import {CompletionContext} from '@codemirror/autocomplete';
import {javascript} from '@codemirror/lang-javascript';
import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {describe, expect, test, vi} from 'vitest';
import type {TsClient} from './ts-client';
import {insideModuleSpecifier, tsCompletionSource} from './ts-completion';
import type {TsCompletionEntry} from './ts-protocol';

function stateFor(doc: string): EditorState {
  return EditorState.create({
    doc,
    selection: {anchor: doc.length},
    extensions: [javascript({jsx: true, typescript: true})],
  });
}

function contextAt(doc: string, pos: number = doc.length): CompletionContext {
  return new CompletionContext(stateFor(doc), pos, true);
}

function fakeClient(overrides: Partial<TsClient>): TsClient {
  return {
    ready: Promise.resolve(true),
    failure: null,
    registerDoc: async () => 0,
    updateDoc: async () => 0,
    completions: async () => [],
    completionDetails: async () => null,
    diagnostics: async () => [],
    disposeDoc: () => {},
    ...overrides,
  };
}

function importingClient(
  textChanges: {span: {start: number; length: number}; newText: string}[],
): TsClient {
  return fakeClient({
    completions: async () => [
      {
        name: 'Rect',
        kind: 'class',
        sortText: '1',
        hasAction: true,
        source: '@canvas-commons/2d',
      },
    ],
    completionDetails: async () => ({
      name: 'Rect',
      displayParts: '',
      documentation: '',
      tags: [],
      codeActions: [
        {description: 'Add import', changes: [{fileName: '/f', textChanges}]},
      ],
    }),
  });
}

// The apply callback is fire and forget from CodeMirror's side, so its awaited
// work has to be flushed before the assertions.
function flush(): Promise<void> {
  return Promise.resolve();
}

async function applyFirstCompletion(
  client: TsClient,
  doc: string,
  label: string,
  from = 0,
): Promise<EditorView> {
  const view = new EditorView({state: stateFor(doc)});
  const context = new CompletionContext(view.state, doc.length, true);
  const source = tsCompletionSource({
    client,
    docId: 'd',
    fileName: '/f',
    getDocVersion: () => 0,
  });
  const result = await source(context);
  const option = result?.options.find(candidate => candidate.label === label);
  const apply = option?.apply;
  if (!option || typeof apply !== 'function') {
    throw new Error(`expected a ${label} completion with an apply callback`);
  }
  apply(view, option, from, doc.length);
  await flush();
  return view;
}

describe('insideModuleSpecifier', () => {
  test('is true with the cursor in an empty import specifier', () => {
    expect(insideModuleSpecifier(contextAt('import {Circle} from "'))).toBe(
      true,
    );
  });

  test('is true with the cursor mid-specifier', () => {
    const doc = 'import {Circle} from "@canvas-commons/';
    expect(insideModuleSpecifier(contextAt(doc))).toBe(true);
  });

  test('is false in the named-import list', () => {
    expect(insideModuleSpecifier(contextAt('import {Ci'))).toBe(false);
  });

  test('is false outside any import declaration', () => {
    const doc = 'const x = "@canvas-commons/';
    expect(insideModuleSpecifier(contextAt(doc))).toBe(false);
  });

  test('is false after a completed import declaration', () => {
    const doc = 'import {Circle} from "@canvas-commons/2d";\nCi';
    expect(insideModuleSpecifier(contextAt(doc))).toBe(false);
  });

  test("is true inside a dynamic import's string argument", () => {
    const doc = 'const x = import("@canvas-commons/';
    expect(insideModuleSpecifier(contextAt(doc))).toBe(true);
  });

  test('is true inside an export-all declaration', () => {
    const doc = 'export * from "@canvas-commons/';
    expect(insideModuleSpecifier(contextAt(doc))).toBe(true);
  });

  test('is true inside a named re-export', () => {
    const doc = 'export {} from "@canvas-commons/';
    expect(insideModuleSpecifier(contextAt(doc))).toBe(true);
  });

  test('is false for a string that merely looks like a specifier', () => {
    const doc = 'const notAnImport = "@canvas-commons/';
    expect(insideModuleSpecifier(contextAt(doc))).toBe(false);
  });
});

describe('tsCompletionSource', () => {
  test('resolves a mapped completion at the current document position', async () => {
    let version = 0;
    const client = importingClient([
      {
        span: {start: 0, length: 0},
        newText: "import {Rect} from '@canvas-commons/2d';\n",
      },
    ]);
    const completionDetails = vi.spyOn(client, 'completionDetails');
    const view = new EditorView({state: stateFor('Rec')});
    const source = tsCompletionSource({
      client,
      docId: 'd',
      fileName: '/f',
      getDocVersion: () => version,
    });
    const result = await source(new CompletionContext(view.state, 3, true));
    const option = result?.options.find(
      candidate => candidate.label === 'Rect',
    );
    const apply = option?.apply;
    if (!option || typeof apply !== 'function') {
      throw new Error('Expected a Rect completion');
    }
    view.dispatch({changes: {from: 0, insert: '\n'}});
    version += 1;
    apply(view, option, 1, 4);
    await flush();

    expect(completionDetails).toHaveBeenCalledWith(
      'd',
      version,
      4,
      'Rect',
      '@canvas-commons/2d',
      undefined,
    );
    expect(view.state.doc.toString()).toBe(
      "import {Rect} from '@canvas-commons/2d';\n\nRect",
    );
    view.destroy();
  });

  test('drops a completion whose import action is unavailable', async () => {
    const entry: TsCompletionEntry = {
      name: 'Circle',
      kind: 'class',
      sortText: '1',
      hasAction: true,
      source: '@canvas-commons/2d',
    };
    const client = fakeClient({
      completions: async () => [entry],
      completionDetails: async () => null,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const view = await applyFirstCompletion(client, 'Ci', 'Circle');

    expect(view.state.doc.toString()).toBe('Ci');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Circle'));
    warn.mockRestore();
    view.destroy();
  });

  test('adds the import an accepted completion needs', async () => {
    const client = importingClient([
      {
        span: {start: 0, length: 0},
        newText: "import {Rect} from '@canvas-commons/2d';\n",
      },
    ]);

    const view = await applyFirstCompletion(client, 'Rec', 'Rect');

    expect(view.state.doc.toString()).toBe(
      "import {Rect} from '@canvas-commons/2d';\nRect",
    );
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    view.destroy();
  });

  test('inserts the import before a completion at the start of an empty document', async () => {
    const client = importingClient([
      {
        span: {start: 0, length: 0},
        newText: "import {Rect} from '@canvas-commons/2d';\n",
      },
    ]);
    const view = await applyFirstCompletion(client, '', 'Rect');
    const text = view.state.doc.toString();
    const cursor = view.state.selection.main.head;
    view.destroy();

    expect(text).toBe("import {Rect} from '@canvas-commons/2d';\nRect");
    expect(cursor).toBe(text.length);
  });

  test('extends the matching import instead of adding a second', async () => {
    const doc = "import {Circle} from '@canvas-commons/2d';\nRec";
    const client = importingClient([
      {span: {start: doc.indexOf('}'), length: 0}, newText: ', Rect'},
    ]);

    const view = await applyFirstCompletion(
      client,
      doc,
      'Rect',
      doc.length - 'Rec'.length,
    );
    const text = view.state.doc.toString();

    expect(text).toBe("import {Circle, Rect} from '@canvas-commons/2d';\nRect");
    expect(text.match(/^import /gm)).toHaveLength(1);
    expect(view.state.selection.main.head).toBe(text.length);
    view.destroy();
  });

  test('places the cursor after a completion with no typed prefix', async () => {
    const client = fakeClient({
      completions: async () => [
        {name: 'scale', kind: 'property', sortText: '1'},
      ],
    });
    const doc = 'ball().';
    const view = await applyFirstCompletion(client, doc, 'scale', doc.length);

    expect(view.state.doc.toString()).toBe('ball().scale');
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    view.dispatch(view.state.replaceSelection('('));
    expect(view.state.doc.toString()).toBe('ball().scale(');
    view.destroy();
  });

  test('maps the cursor through an import with no typed prefix', async () => {
    const client = importingClient([
      {
        span: {start: 0, length: 0},
        newText: "import {Rect} from '@canvas-commons/2d';\n",
      },
    ]);
    const view = await applyFirstCompletion(client, '<', 'Rect', 1);

    expect(view.state.doc.toString()).toBe(
      "import {Rect} from '@canvas-commons/2d';\n<Rect",
    );
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    view.dispatch(view.state.replaceSelection(' />'));
    expect(view.state.doc.toString()).toBe(
      "import {Rect} from '@canvas-commons/2d';\n<Rect />",
    );
    view.destroy();
  });

  test('applies a plain completion without asking for details', async () => {
    const entry: TsCompletionEntry = {
      name: 'localVar',
      kind: 'var',
      sortText: '1',
      hasAction: false,
    };
    const completionDetails = vi.fn(async () => null);
    const client = fakeClient({
      completions: async () => [entry],
      completionDetails,
    });

    const view = await applyFirstCompletion(client, 'loc', 'localVar');

    expect(view.state.doc.toString()).toBe('localVar');
    expect(completionDetails).not.toHaveBeenCalled();
    view.destroy();
  });
});
