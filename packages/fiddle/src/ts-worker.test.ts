import {dirname, resolve} from 'path';
import ts from 'typescript';
import {fileURLToPath} from 'url';
import {beforeAll, describe, expect, test} from 'vitest';
import {CORE_VENDOR_PACKAGES} from './build-vendor';
import {isAllowlistedSpecifier} from './ts-protocol';
import {
  filterCompletionEntries,
  handleCompletionDetails,
  handleCompletions,
  loadTypePack,
  mapCodeAction,
  normalizeSource,
  registerDocument,
  updateDocument,
} from './ts-worker';
import {buildTypePack} from './type-pack';

const ACTIVE_FILE = '/fiddles/a/index.tsx';

function entry(overrides: Partial<ts.CompletionEntry>): ts.CompletionEntry {
  return {
    name: 'Circle',
    kind: ts.ScriptElementKind.classElement,
    kindModifiers: '',
    sortText: '1',
    ...overrides,
  };
}

function codeAction(
  changes: {fileName: string; isNewFile?: boolean}[],
): ts.CodeAction {
  return {
    description: 'Add import',
    changes: changes.map(change => ({
      fileName: change.fileName,
      isNewFile: change.isNewFile ?? false,
      textChanges: [{span: {start: 0, length: 0}, newText: 'x'}],
    })),
  };
}

describe('filterCompletionEntries', () => {
  test('keeps only allowlisted specifiers inside a module specifier', () => {
    const entries = [
      entry({name: '@canvas-commons/2d'}),
      entry({name: '@codemirror/language'}),
      entry({name: 'roughjs'}),
    ];
    const kept = filterCompletionEntries(entries, true).map(each => each.name);
    expect(kept).toEqual(['@canvas-commons/2d']);
  });

  test('drops entries whose import source is not allowlisted', () => {
    const entries = [
      entry({name: 'Circle', source: '@canvas-commons/2d', hasAction: true}),
      entry({
        name: 'HighlightStyle',
        source: '@codemirror/language',
        hasAction: true,
      }),
      entry({name: 'localVar'}),
    ];
    const kept = filterCompletionEntries(entries, false).map(each => each.name);
    expect(kept).toEqual(['Circle', 'localVar']);
  });
});

describe('normalizeSource', () => {
  test('strips surrounding quotes', () => {
    expect(normalizeSource('"@canvas-commons/2d"')).toBe('@canvas-commons/2d');
    expect(normalizeSource("'@canvas-commons/2d'")).toBe('@canvas-commons/2d');
  });

  test('passes through a bare specifier', () => {
    expect(normalizeSource('@canvas-commons/2d')).toBe('@canvas-commons/2d');
  });
});

describe('mapCodeAction', () => {
  test('maps an action that only touches the active file', () => {
    const action = codeAction([{fileName: ACTIVE_FILE}]);
    const mapped = mapCodeAction(action, ACTIVE_FILE);
    expect(mapped).not.toBeNull();
    expect(mapped?.changes).toHaveLength(1);
    expect(mapped?.changes[0]?.fileName).toBe(ACTIVE_FILE);
  });

  test('rejects the whole action when any change creates a file', () => {
    const action = codeAction([
      {fileName: ACTIVE_FILE},
      {fileName: '/new-file.ts', isNewFile: true},
    ]);
    expect(mapCodeAction(action, ACTIVE_FILE)).toBeNull();
  });

  test('rejects the whole action when any change targets another file', () => {
    const action = codeAction([
      {fileName: ACTIVE_FILE},
      {fileName: '/fiddles/other/index.tsx'},
    ]);
    expect(mapCodeAction(action, ACTIVE_FILE)).toBeNull();
  });

  test('rejects an action that only touches another file', () => {
    const action = codeAction([{fileName: '/fiddles/other/index.tsx'}]);
    expect(mapCodeAction(action, ACTIVE_FILE)).toBeNull();
  });
});

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACK_TIMEOUT_MS = 120_000;
const DOC_ID = 'pack';
const SCENE = `import {Circle, makeScene2D} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const ball = createRef<Circle>();
  view.add(<Circle ref={ball} size={160} />);
  view.add(<Rec />);
  yield* ball().scale(2, 1);
  yield* waitFor(1);
});
`;

describe('the language service on a real type pack', () => {
  const position = (marker: string): number =>
    SCENE.indexOf(marker) + marker.length;

  beforeAll(() => {
    loadTypePack(
      buildTypePack(
        PACKAGE_ROOT,
        CORE_VENDOR_PACKAGES.map(vendorPackage => vendorPackage.specifier),
      ),
    );
    registerDocument(DOC_ID, ACTIVE_FILE, SCENE);
  }, PACK_TIMEOUT_MS);

  test('completes an imported symbol', () => {
    const names = handleCompletions(
      DOC_ID,
      position('yield* wait'),
      undefined,
      false,
    ).map(entry => entry.name);
    expect(names).toContain('waitFor');
  });

  test('completes a member after a dot', () => {
    const names = handleCompletions(
      DOC_ID,
      position('ball().'),
      '.',
      false,
    ).map(entry => entry.name);
    expect(names).toContain('scale');
  });

  test('offers an unimported export with the module it comes from', () => {
    const rect = handleCompletions(
      DOC_ID,
      position('<Rec'),
      undefined,
      false,
    ).find(entry => entry.name === 'Rect');
    expect(rect?.source).toBe('@canvas-commons/2d');
    expect(rect?.hasAction).toBe(true);
  });

  test('resolves that entry to an import code action', () => {
    const pos = position('<Rec');
    const rect = handleCompletions(DOC_ID, pos, undefined, false).find(
      entry => entry.name === 'Rect',
    );
    const details = handleCompletionDetails(
      DOC_ID,
      pos,
      'Rect',
      rect?.source,
      rect?.data,
    );
    const changes = details?.codeActions?.flatMap(action => action.changes);
    expect(changes?.map(change => change.fileName)).toEqual([ACTIVE_FILE]);
    expect(
      changes?.flatMap(change =>
        change.textChanges.map(textChange => textChange.newText),
      ),
    ).toEqual([', Rect']);
  });

  test('still completes after the document is emptied and retyped', () => {
    updateDocument(DOC_ID, '');
    updateDocument(DOC_ID, SCENE);
    const names = handleCompletions(
      DOC_ID,
      position('yield* wait'),
      undefined,
      false,
    ).map(entry => entry.name);
    expect(names).toContain('waitFor');
  });

  test('offers only allowlisted modules inside a specifier', () => {
    const names = handleCompletions(
      DOC_ID,
      position(`from '@canvas-commons/`),
      undefined,
      true,
    ).map(entry => entry.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter(name => !isAllowlistedSpecifier(name))).toEqual([]);
  });
});
