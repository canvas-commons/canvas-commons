import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete';
import {insertCompletionText} from '@codemirror/autocomplete';
import {syntaxTree} from '@codemirror/language';
import type {EditorView} from '@codemirror/view';
import type {TsClient} from './ts-client';
import type {TsCompletionEntry, TsFileTextChanges} from './ts-protocol';

const KindToCmType = new Map<string, string>([
  ['class', 'class'],
  ['interface', 'interface'],
  ['enum', 'enum'],
  ['module', 'namespace'],
  ['external module name', 'namespace'],
  ['method', 'method'],
  ['property', 'property'],
  ['getter', 'property'],
  ['setter', 'property'],
  ['function', 'function'],
  ['var', 'variable'],
  ['let', 'variable'],
  ['const', 'constant'],
  ['parameter', 'variable'],
  ['alias', 'type'],
  ['type', 'type'],
  ['keyword', 'keyword'],
  ['string', 'text'],
  ['label', 'text'],
  ['JSX attribute', 'property'],
]);

function toCmType(kind: string): string {
  return KindToCmType.get(kind) ?? 'variable';
}

const MODULE_SPECIFIER_PARENTS = new Set([
  'ImportDeclaration',
  'ExportDeclaration',
  'DynamicImport',
]);

/**
 * Check if a position sits inside a module specifier string.
 *
 * @example
 * ```ts
 * const inSpecifier = insideModuleSpecifier(context);
 * ```
 */
export function insideModuleSpecifier(context: CompletionContext): boolean {
  const node = syntaxTree(context.state).resolveInner(context.pos, -1);
  if (node.name !== 'String') return false;
  let cursor: typeof node | null = node;
  while (cursor) {
    if (MODULE_SPECIFIER_PARENTS.has(cursor.name)) return true;
    cursor = cursor.parent;
  }
  return false;
}

function applyAutoImport(
  view: EditorView,
  fileName: string,
  primary: {from: number; to: number; insert: string},
  changes: TsFileTextChanges[],
): void {
  const own = changes.find(change => change.fileName === fileName);
  const edits = [
    ...(own?.textChanges ?? []).map(textChange => ({
      from: textChange.span.start,
      to: textChange.span.start + textChange.span.length,
      insert: textChange.newText,
    })),
    {from: primary.from, to: primary.to, insert: primary.insert},
  ];
  const transactionChanges = view.state.changes(edits);
  view.dispatch({
    changes: transactionChanges,
    selection: {anchor: transactionChanges.mapPos(primary.to, 1)},
    scrollIntoView: true,
    userEvent: 'input.complete',
  });
}

/**
 * What the completion source needs to talk to the worker.
 *
 * `getDocVersion` reads the version the last register or update produced. The
 * editor owns that counter because it sees every edit.
 */
export interface TsCompletionOptions {
  client: TsClient;
  docId: string;
  fileName: string;
  getDocVersion: () => number;
}

const TS_TRIGGER_CHARACTERS = new Set(['.', '"', "'", '`', '/', '@', '<', '#']);

function detectTriggerCharacter(
  context: CompletionContext,
  wordIsEmpty: boolean,
): string | undefined {
  if (!wordIsEmpty || context.pos === 0) return undefined;
  const character = context.state.sliceDoc(context.pos - 1, context.pos);
  return TS_TRIGGER_CHARACTERS.has(character) ? character : undefined;
}

/**
 * Build a CodeMirror completion source backed by the language service.
 *
 * An entry that needs an import withholds its insertion until the worker
 * answers with the import edits, then applies both in one transaction.
 *
 * @example
 * ```ts
 * autocompletion({override: [tsCompletionSource(options)]});
 * ```
 */
export function tsCompletionSource(
  options: TsCompletionOptions,
): (context: CompletionContext) => Promise<CompletionResult | null> {
  return async (context: CompletionContext) => {
    const word = context.matchBefore(/[\w$]*/);
    const triggerChar = detectTriggerCharacter(
      context,
      !word || word.from === word.to,
    );
    const isModuleSpecifier = insideModuleSpecifier(context);
    if (!isModuleSpecifier && !word && !context.explicit) return null;

    const docVersion = options.getDocVersion();
    const entries = await options.client.completions(
      options.docId,
      docVersion,
      context.pos,
      isModuleSpecifier ? undefined : triggerChar,
      isModuleSpecifier,
    );
    if (!entries) return null;

    const specifierLength = context.matchBefore(/[^"']*/)?.text.length ?? 0;
    const from = isModuleSpecifier
      ? context.pos - specifierLength
      : (word?.from ?? context.pos);

    const cmOptions: Completion[] = entries.map((entry: TsCompletionEntry) => ({
      label: entry.name,
      type: toCmType(entry.kind),
      detail: entry.sourceDisplay,
      boost: entry.boost ?? 0,
      section: entry.section,
      apply: (
        view: EditorView,
        _completion: Completion,
        applyFrom: number,
        applyTo: number,
      ) => {
        void (async () => {
          const currentVersion = options.getDocVersion();
          const details = entry.hasAction
            ? await options.client.completionDetails(
                options.docId,
                currentVersion,
                applyTo,
                entry.name,
                entry.source,
                entry.data,
              )
            : null;
          if (options.getDocVersion() !== currentVersion) return;

          const insertText = entry.insertText ?? entry.name;
          const span =
            currentVersion === docVersion ? entry.replacementSpan : undefined;
          const primary = span
            ? {
                from: span.start,
                to: span.start + span.length,
                insert: insertText,
              }
            : {from: applyFrom, to: applyTo, insert: insertText};

          if (entry.hasAction) {
            if (!details?.codeActions || details.codeActions.length === 0) {
              console.warn(
                `[fiddle] Dropped completion "${entry.name}": its import ` +
                  'action was unavailable or touched another file.',
              );
              return;
            }
            const changes = details.codeActions.flatMap(
              action => action.changes,
            );
            applyAutoImport(view, options.fileName, primary, changes);
            return;
          }

          view.dispatch(
            insertCompletionText(
              view.state,
              primary.insert,
              primary.from,
              primary.to,
            ),
          );
        })();
      },
    }));

    return {
      from,
      options: cmOptions,
      validFor: isModuleSpecifier ? undefined : /^[\w$]*$/,
    };
  };
}
