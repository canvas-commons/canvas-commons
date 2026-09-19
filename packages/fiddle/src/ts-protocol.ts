/**
 * A heading in the completion dropdown. `rank` orders whole sections ahead of
 * any per-option score.
 */
export interface TsCompletionSection {
  name: string;
  rank: number;
}

/**
 * A single completion offered for a document.
 */
export interface TsCompletionEntry {
  name: string;
  kind: string;
  kindModifiers?: string;
  sortText: string;
  insertText?: string;
  isSnippet?: boolean;
  replacementSpan?: {start: number; length: number};
  source?: string;
  sourceDisplay?: string;
  hasAction?: boolean;
  data?: unknown;
  boost?: number;
  section?: TsCompletionSection;
}

/**
 * Documentation and code actions for one completion entry.
 */
export interface TsCompletionDetails {
  name: string;
  displayParts: string;
  documentation: string;
  tags: string[];
  codeActions: TsCodeAction[] | null;
}

/**
 * An edit the language service proposes, such as adding an import.
 */
export interface TsCodeAction {
  description: string;
  changes: TsFileTextChanges[];
}

/**
 * Text edits that apply to one file.
 */
export interface TsFileTextChanges {
  fileName: string;
  textChanges: {span: {start: number; length: number}; newText: string}[];
}

/**
 * A diagnostic, with offsets into the document text.
 */
export interface TsDiagnostic {
  from: number;
  to: number;
  message: string;
  code: number;
}

/**
 * A message sent to the language service worker.
 *
 * The client drops stale diagnostics and completion details, but a completion
 * list may outlive its `docVersion` because CodeMirror maps it through later
 * edits.
 */
export type TsWorkerRequest =
  | {type: 'init'; requestId: number; typesUrl: string}
  | {
      type: 'registerDoc';
      requestId: number;
      docId: string;
      docVersion: number;
      fileName: string;
      text: string;
    }
  | {
      type: 'updateDoc';
      requestId: number;
      docId: string;
      docVersion: number;
      text: string;
    }
  | {
      type: 'completions';
      requestId: number;
      docId: string;
      docVersion: number;
      pos: number;
      triggerCharacter?: string;
      insideModuleSpecifier: boolean;
    }
  | {
      type: 'completionDetails';
      requestId: number;
      docId: string;
      docVersion: number;
      pos: number;
      entryName: string;
      source?: string;
      data?: unknown;
    }
  | {type: 'diagnostics'; requestId: number; docId: string; docVersion: number}
  | {type: 'disposeDoc'; requestId: number; docId: string};

/**
 * A message sent back by the language service worker.
 */
export type TsWorkerResponse =
  | {type: 'initOk'; requestId: number; tsVersion: string}
  | {type: 'initError'; requestId: number; message: string}
  | {type: 'ack'; requestId: number; docId: string; docVersion: number}
  | {
      type: 'completionsResult';
      requestId: number;
      docId: string;
      docVersion: number;
      entries: TsCompletionEntry[];
    }
  | {
      type: 'completionDetailsResult';
      requestId: number;
      docId: string;
      docVersion: number;
      details: TsCompletionDetails | null;
    }
  | {
      type: 'diagnosticsResult';
      requestId: number;
      docId: string;
      docVersion: number;
      diagnostics: TsDiagnostic[];
    }
  | {type: 'error'; requestId: number; docId?: string; message: string};

/**
 * Package specifiers an auto-import completion may come from. Mirrors the
 * allowlist the compiler enforces.
 */
export const AUTO_IMPORT_ALLOWLIST: ReadonlySet<string> = new Set([
  '@canvas-commons/core',
  '@canvas-commons/2d',
  '@canvas-commons/2d/jsx-runtime',
]);

/**
 * Check if fiddle code may import from a bare, unquoted module specifier.
 *
 * @example
 * ```ts
 * isAllowlistedSpecifier('@canvas-commons/2d'); // true
 * ```
 */
export function isAllowlistedSpecifier(specifier: string): boolean {
  return AUTO_IMPORT_ALLOWLIST.has(specifier);
}
