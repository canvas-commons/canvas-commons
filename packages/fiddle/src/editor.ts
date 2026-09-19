import {autocompletion, closeBrackets} from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {javascript} from '@codemirror/lang-javascript';
import {HighlightStyle, syntaxHighlighting} from '@codemirror/language';
import type {Diagnostic} from '@codemirror/lint';
import {
  setDiagnostics as dispatchDiagnostics,
  linter,
  lintGutter,
} from '@codemirror/lint';
import type {Extension} from '@codemirror/state';
import {Compartment, EditorState} from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import {tags as t} from '@lezer/highlight';
import type {FiddleDiagnostic} from './compiler';
import type {TsClient} from './ts-client';
import {getTsClient} from './ts-client';
import {tsCompletionSource} from './ts-completion';
import type {TsDiagnostic} from './ts-protocol';

const TS_DIAGNOSTICS_DEBOUNCE_MS = 500;

interface TsSession {
  client: TsClient;
  docId: string;
  fileName: string;
}

const Palette = {
  background: 'var(--cc-fiddle-background, #1e1e2e)',
  foreground: 'var(--cc-fiddle-foreground, #cdd6f4)',
  selection: 'var(--cc-fiddle-selection, rgb(205 214 244 / 0.15))',
  activeLine: 'var(--cc-fiddle-active-line, rgb(205 214 244 / 0.05))',
  font: 'var(--cc-fiddle-font, ui-monospace, monospace)',
  muted: 'var(--cc-fiddle-muted, #6c7086)',
  border: 'var(--cc-fiddle-border, #313244)',
  string: 'var(--cc-fiddle-string, #a6e3a1)',
  keyword: 'var(--cc-fiddle-keyword, #f38ba8)',
  type: 'var(--cc-fiddle-type, #f9e2af)',
  function: 'var(--cc-fiddle-function, #89b4fa)',
  number: 'var(--cc-fiddle-number, #fab387)',
  comment: 'var(--cc-fiddle-comment, #9399b2)',
} as const;

/* eslint-disable @typescript-eslint/naming-convention -- theme keys are CSS
   selectors, not identifiers. */
const FiddleEditorTheme = EditorView.theme(
  {
    '&': {
      color: Palette.foreground,
      backgroundColor: Palette.background,
      height: '100%',
      fontSize: '0.85rem',
      fontFamily: Palette.font,
    },
    '.cm-content': {
      fontFamily: Palette.font,
      caretColor: Palette.string,
      padding: '0.85em 1.25em 0.85em 0.85em',
    },
    '.cm-line': {
      lineHeight: '1.55',
    },
    '.cm-gutters': {
      backgroundColor: Palette.background,
      color: Palette.muted,
      border: 'none',
      fontFamily: Palette.font,
    },
    '.cm-gutterElement': {
      lineHeight: '1.55',
    },
    '&.cm-focused .cm-cursor': {borderLeftColor: Palette.string},
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: Palette.selection,
    },
    '.cm-activeLine': {backgroundColor: Palette.activeLine},
    '.cm-activeLineGutter': {backgroundColor: Palette.activeLine},
    '.cm-lintRange-error': {textDecorationColor: Palette.keyword},
    '.cm-lintRange-warning': {textDecorationColor: Palette.type},
    '.cm-tooltip': {
      backgroundColor: Palette.background,
      borderColor: Palette.border,
      color: Palette.foreground,
      fontFamily: Palette.font,
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: Palette.selection,
      color: Palette.foreground,
    },
    '.cm-tooltip-autocomplete completion-section': {
      color: Palette.muted,
      borderBottomColor: Palette.muted,
      fontFamily: Palette.font,
    },
    '.cm-tooltip-autocomplete ul completion-section:nth-of-type(2) ~ li': {
      opacity: '0.55',
    },
  },
  {dark: true},
);
/* eslint-enable @typescript-eslint/naming-convention */

const FiddleHighlightStyle = HighlightStyle.define([
  {tag: t.keyword, color: Palette.keyword, fontWeight: 'bold'},
  {tag: [t.string, t.special(t.string)], color: Palette.string},
  {tag: t.comment, color: Palette.comment, fontStyle: 'italic'},
  {tag: [t.number, t.bool, t.null], color: Palette.number},
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: Palette.function,
  },
  {tag: t.typeName, color: Palette.type},
  {tag: t.tagName, color: Palette.function},
  {tag: t.attributeName, color: Palette.type},
  {tag: [t.punctuation, t.operator], color: Palette.comment},
]);

/**
 * How to mount a fiddle editor, and whether to back it with TypeScript.
 *
 * `tsDocId` names this document to the shared language service worker. Leave
 * it or `typesUrl` out to run without completions and TypeScript diagnostics.
 */
export interface FiddleEditorOptions {
  parent: HTMLElement;
  doc: string;
  /** Receives every document edit, including changes made by `setValue`. */
  onChange: (doc: string) => void;
  tsDocId?: string;
  typesUrl?: string;
  createTsWorker?: () => Worker;
  extensions?: Extension[];
  /**
   * Reports a language service that never started, once per editor. Without
   * it the editor runs silently with no completions and no diagnostics.
   */
  onError?: (message: string) => void;
  /**
   * Holds the language service back until
   * {@link FiddleEditor.enableTypeScript} runs, so a page nobody edits never
   * fetches the type pack.
   */
  deferTypeScript?: boolean;
}

/**
 * A mounted fiddle editor.
 */
export interface FiddleEditor {
  readonly view: EditorView;
  /** Replace compiler diagnostics while retaining TypeScript diagnostics. */
  setDiagnostics(diagnostics: FiddleDiagnostic[]): void;
  /**
   * Starts the language service a `deferTypeScript` editor held back. Does
   * nothing on an editor without a document id or a type pack, and nothing
   * after the first call.
   */
  enableTypeScript(): void;
  /** Return the current document text. */
  getValue(): string;
  /** Replace the document text and notify `onChange`. */
  setValue(doc: string): void;
  /** Dispose the editor view and its document in the shared worker. */
  destroy(): void;
}

function toCmDiagnostic(
  diagnostic: FiddleDiagnostic,
  docLength: number,
): Diagnostic {
  const from = Math.max(0, Math.min(diagnostic.from, docLength));
  const to = Math.max(from, Math.min(diagnostic.to, docLength));
  return {from, to, message: diagnostic.message, severity: diagnostic.severity};
}

function toTsCmDiagnostic(
  diagnostic: TsDiagnostic,
  docLength: number,
): Diagnostic {
  const from = Math.max(0, Math.min(diagnostic.from, docLength));
  const to = Math.max(from, Math.min(diagnostic.to, docLength));
  return {from, to, message: `ts: ${diagnostic.message}`, severity: 'warning'};
}

/**
 * Create a CodeMirror editor for fiddle source.
 *
 * The editor takes its colours from these custom properties, each of which
 * has a dark fallback, so it stays legible with no host stylesheet:
 *
 * - `--cc-fiddle-background`, `--cc-fiddle-foreground`, `--cc-fiddle-font`
 * - `--cc-fiddle-selection`, `--cc-fiddle-active-line`, `--cc-fiddle-muted`
 * - `--cc-fiddle-border`
 * - `--cc-fiddle-keyword`, `--cc-fiddle-string`, `--cc-fiddle-comment`
 * - `--cc-fiddle-number`, `--cc-fiddle-function`, `--cc-fiddle-type`
 *
 * @example
 * ```ts
 * const editor = createFiddleEditor({
 *   parent: document.body,
 *   doc: 'const x = 1;',
 *   onChange: doc => console.log(doc),
 * });
 * ```
 */
export function createFiddleEditor(options: FiddleEditorOptions): FiddleEditor {
  const {tsDocId, typesUrl} = options;
  let tsSession: TsSession | null = null;

  let tsDocVersion = 0;
  let babelDiagnostics: FiddleDiagnostic[] = [];
  let tsDiagnostics: TsDiagnostic[] = [];
  let tsDiagnosticsTimer: ReturnType<typeof setTimeout> | null = null;

  function pushMergedDiagnostics(): void {
    const docLength = view.state.doc.length;
    const merged = [
      ...babelDiagnostics.map(d => toCmDiagnostic(d, docLength)),
      ...tsDiagnostics.map(d => toTsCmDiagnostic(d, docLength)),
    ];
    view.dispatch(dispatchDiagnostics(view.state, merged));
  }

  function scheduleTsDiagnostics(): void {
    const session = tsSession;
    if (!session) return;
    if (tsDiagnosticsTimer !== null) clearTimeout(tsDiagnosticsTimer);
    tsDiagnosticsTimer = setTimeout(() => {
      const requestedVersion = tsDocVersion;
      void session.client
        .diagnostics(session.docId, requestedVersion)
        .then(result => {
          if (
            tsSession !== session ||
            !result ||
            tsDocVersion !== requestedVersion
          ) {
            return;
          }
          tsDiagnostics = result;
          pushMergedDiagnostics();
        });
    }, TS_DIAGNOSTICS_DEBOUNCE_MS);
  }

  function completionFor(session: TsSession): Extension {
    return autocompletion({
      override: [
        tsCompletionSource({
          client: session.client,
          docId: session.docId,
          fileName: session.fileName,
          getDocVersion: () => tsDocVersion,
        }),
      ],
    });
  }

  function startTsSession(): void {
    if (tsSession || !tsDocId || !typesUrl) return;
    const session: TsSession = {
      client: getTsClient({typesUrl, createWorker: options.createTsWorker}),
      docId: tsDocId,
      fileName: `/fiddles/${tsDocId}/index.tsx`,
    };
    tsSession = session;
    view.dispatch({effects: completion.reconfigure(completionFor(session))});
    void session.client.ready.then(ok => {
      if (ok || tsSession !== session) return;
      options.onError?.(
        session.client.failure ??
          'The TypeScript language service is unavailable.',
      );
    });
    void session.client
      .registerDoc(session.docId, session.fileName, view.state.doc.toString())
      .then(() => scheduleTsDiagnostics());
  }

  const completion = new Compartment();
  const extensions = [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    syntaxHighlighting(FiddleHighlightStyle, {fallback: true}),
    javascript({typescript: true, jsx: true}),
    closeBrackets(),
    completion.of(autocompletion()),
    lintGutter(),
    linter(null),
    FiddleEditorTheme,
    EditorView.updateListener.of(update => {
      if (!update.docChanged) return;
      const doc = update.state.doc.toString();
      options.onChange(doc);
      const session = tsSession;
      if (!session) return;
      tsDocVersion += 1;
      void session.client.updateDoc(session.docId, doc);
      scheduleTsDiagnostics();
    }),
  ];

  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [...extensions, ...(options.extensions ?? [])],
    }),
  });

  if (!options.deferTypeScript) startTsSession();

  return {
    view,
    setDiagnostics(diagnostics: FiddleDiagnostic[]): void {
      babelDiagnostics = diagnostics;
      pushMergedDiagnostics();
    },
    enableTypeScript: startTsSession,
    getValue(): string {
      return view.state.doc.toString();
    },
    setValue(doc: string): void {
      view.dispatch({
        changes: {from: 0, to: view.state.doc.length, insert: doc},
      });
    },
    destroy(): void {
      if (tsDiagnosticsTimer !== null) clearTimeout(tsDiagnosticsTimer);
      tsSession?.client.disposeDoc(tsSession.docId);
      tsSession = null;
      view.destroy();
    },
  };
}
