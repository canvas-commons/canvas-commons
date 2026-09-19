import {
  createSystem,
  createVirtualTypeScriptEnvironment,
} from '@typescript/vfs';
import ts from 'typescript';
import type {
  TsCodeAction,
  TsCompletionDetails,
  TsCompletionEntry,
  TsDiagnostic,
  TsFileTextChanges,
  TsWorkerRequest,
  TsWorkerResponse,
} from './ts-protocol';
import {isAllowlistedSpecifier} from './ts-protocol';
import {rankCompletionEntries, type ContextualScope} from './ts-ranking';

/**
 * The part of a type pack the worker reads.
 */
export interface FetchedTypePack {
  tsVersion: string;
  compilerOptions: ts.CompilerOptions;
  files: {path: string; text: string}[];
  rootPaths: string[];
  ambientPaths: string[];
}

interface WorkerScope {
  postMessage(message: TsWorkerResponse): void;
  onmessage: ((event: {data: TsWorkerRequest}) => void) | null;
  fetch(
    input: string,
  ): Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;
}

/* eslint-disable-next-line @typescript-eslint/naming-convention -- the worker
   global is named self. */
declare const self: WorkerScope;

type VirtualEnv = ReturnType<typeof createVirtualTypeScriptEnvironment>;

let Environment: VirtualEnv | null = null;
const DocPaths = new Map<string, string>();

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isPackFile(value: unknown): value is {path: string; text: string} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    typeof value.path === 'string' &&
    'text' in value &&
    typeof value.text === 'string'
  );
}

function isTypePack(value: unknown): value is FetchedTypePack {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tsVersion' in value &&
    typeof value.tsVersion === 'string' &&
    'compilerOptions' in value &&
    typeof value.compilerOptions === 'object' &&
    value.compilerOptions !== null &&
    'files' in value &&
    Array.isArray(value.files) &&
    value.files.every(isPackFile) &&
    'rootPaths' in value &&
    isStringArray(value.rootPaths) &&
    'ambientPaths' in value &&
    isStringArray(value.ambientPaths)
  );
}

/**
 * Stand the language service up on a type pack.
 *
 * @example
 * ```ts
 * loadTypePack(await (await fetch(typesUrl)).json());
 * ```
 */
export function loadTypePack(pack: FetchedTypePack): string {
  if (pack.tsVersion !== ts.version) {
    throw new Error(
      `Type pack was built with typescript@${pack.tsVersion}, ` +
        `but the worker bundles typescript@${ts.version}.`,
    );
  }

  const fsMap = new Map<string, string>();
  for (const file of pack.files) fsMap.set(file.path, file.text);

  const system = createSystem(fsMap);
  Environment = createVirtualTypeScriptEnvironment(
    system,
    [],
    ts,
    pack.compilerOptions,
  );
  for (const path of [...pack.rootPaths, ...pack.ambientPaths]) {
    const text = fsMap.get(path);
    if (text !== undefined) Environment.createFile(path, text);
  }
  return pack.tsVersion;
}

async function handleInit(typesUrl: string): Promise<string> {
  const response = await self.fetch(typesUrl);
  if (!response.ok) {
    throw new Error(`Fetching ${typesUrl} failed: ${response.status}`);
  }
  const pack: unknown = await response.json();
  if (!isTypePack(pack)) {
    throw new Error(`${typesUrl} did not return a type pack.`);
  }
  return loadTypePack(pack);
}

function requireEnv(): VirtualEnv {
  if (!Environment) throw new Error('ts-worker: init() has not completed');
  return Environment;
}

function docFileName(docId: string): string {
  return DocPaths.get(docId) ?? `/fiddles/${docId}/index.tsx`;
}

/**
 * Add an editor's document to the language service's program.
 *
 * @example
 * ```ts
 * registerDocument('a', '/fiddles/a/index.tsx', 'const x = 1;');
 * ```
 */
export function registerDocument(
  docId: string,
  fileName: string,
  text: string,
): void {
  DocPaths.set(docId, fileName);
  requireEnv().createFile(fileName, text);
}

/**
 * Replace an editor's document with its current text.
 *
 * An empty document leaves the program, so the next text creates it again.
 *
 * @example
 * ```ts
 * updateDocument('a', 'const x = 2;');
 * ```
 */
export function updateDocument(docId: string, text: string): void {
  const environment = requireEnv();
  const fileName = docFileName(docId);
  if (environment.getSourceFile(fileName)) {
    environment.updateFile(fileName, text);
  } else {
    environment.createFile(fileName, text);
  }
}

function mapCompletionEntry(entry: ts.CompletionEntry): TsCompletionEntry {
  return {
    name: entry.name,
    kind: entry.kind,
    kindModifiers: entry.kindModifiers,
    sortText: entry.sortText,
    insertText: entry.insertText,
    isSnippet: entry.isSnippet,
    replacementSpan: entry.replacementSpan
      ? {
          start: entry.replacementSpan.start,
          length: entry.replacementSpan.length,
        }
      : undefined,
    source: entry.source,
    sourceDisplay: entry.sourceDisplay
      ? ts.displayPartsToString(entry.sourceDisplay)
      : undefined,
    hasAction: entry.hasAction,
    data: entry.data,
  };
}

/**
 * Drop every completion that would import from outside the allowlist.
 *
 * Entries inside a module specifier carry no `source`, so their own name is
 * the specifier to check.
 *
 * @example
 * ```ts
 * const kept = filterCompletionEntries(info.entries, false);
 * ```
 */
export function filterCompletionEntries(
  entries: ts.CompletionEntry[],
  isModuleSpecifierContext: boolean,
): ts.CompletionEntry[] {
  return entries.filter(entry => {
    if (isModuleSpecifierContext) {
      return isAllowlistedSpecifier(normalizeSource(entry.name));
    }
    if (entry.source) {
      return isAllowlistedSpecifier(normalizeSource(entry.source));
    }
    return true;
  });
}

/**
 * Strip the quotes the language service puts around a module specifier.
 *
 * @example
 * ```ts
 * normalizeSource('"@canvas-commons/2d"'); // '@canvas-commons/2d'
 * ```
 */
export function normalizeSource(source: string): string {
  return source.replace(/^["']|["']$/g, '');
}

const TRIGGER_CHARACTERS: readonly ts.CompletionsTriggerCharacter[] = [
  '.',
  '"',
  "'",
  '`',
  '/',
  '@',
  '<',
  '#',
  ' ',
];

function toTriggerCharacter(
  value: string | undefined,
): ts.CompletionsTriggerCharacter | undefined {
  return TRIGGER_CHARACTERS.find(character => character === value);
}

function isCompletionEntryData(
  value: unknown,
): value is ts.CompletionEntryData {
  if (typeof value !== 'object' || value === null) return false;
  if (!('exportName' in value) || typeof value.exportName !== 'string') {
    return false;
  }
  return (
    ('moduleSpecifier' in value && typeof value.moduleSpecifier === 'string') ||
    ('exportMapKey' in value && typeof value.exportMapKey === 'string')
  );
}

/**
 * Rank and filter the completions the language service offers at a position.
 *
 * @example
 * ```ts
 * handleCompletions('a', 42, undefined, false);
 * ```
 */
export function handleCompletions(
  docId: string,
  pos: number,
  triggerCharacter: string | undefined,
  insideModuleSpecifier: boolean,
): TsCompletionEntry[] {
  const current = requireEnv();
  const service = current.languageService;
  const fileName = docFileName(docId);
  const info = service.getCompletionsAtPosition(fileName, pos, {
    includeCompletionsForModuleExports: true,
    includeCompletionsForImportStatements: true,
    includeCompletionsWithInsertText: true,
    triggerCharacter: toTriggerCharacter(triggerCharacter),
  });
  if (!info) return [];
  const filtered = filterCompletionEntries(
    info.entries,
    insideModuleSpecifier,
  ).map(mapCompletionEntry);
  const scope = insideModuleSpecifier
    ? null
    : contextualScope(service, current.sys, fileName, pos);
  return rankCompletionEntries(filtered, scope);
}

function contextualScope(
  service: ts.LanguageService,
  moduleResolutionHost: ts.ModuleResolutionHost,
  fileName: string,
  pos: number,
): ContextualScope | null {
  const program = service.getProgram();
  const sourceFile = program?.getSourceFile(fileName);
  if (!program || !sourceFile) return null;
  return {
    program,
    checker: program.getTypeChecker(),
    moduleResolutionHost,
    sourceFile,
    pos,
  };
}

/**
 * Convert a code action into edits the editor can apply, or null when a
 * change creates a file or touches one the editor does not own.
 *
 * @example
 * ```ts
 * const edits = mapCodeAction(action, '/fiddles/a/index.tsx');
 * ```
 */
export function mapCodeAction(
  action: ts.CodeAction,
  activeFileName: string,
): TsCodeAction | null {
  const changes: TsFileTextChanges[] = [];
  for (const change of action.changes) {
    if (change.isNewFile || change.fileName !== activeFileName) return null;
    changes.push({
      fileName: change.fileName,
      textChanges: change.textChanges.map(textChange => ({
        span: {start: textChange.span.start, length: textChange.span.length},
        newText: textChange.newText,
      })),
    });
  }
  return {description: action.description, changes};
}

/**
 * Resolve one completion entry, including the import it would add.
 *
 * @example
 * ```ts
 * handleCompletionDetails('a', 42, 'Rect', '@canvas-commons/2d', entry.data);
 * ```
 */
export function handleCompletionDetails(
  docId: string,
  pos: number,
  entryName: string,
  source: string | undefined,
  data: unknown,
): TsCompletionDetails | null {
  const service = requireEnv().languageService;
  const fileName = docFileName(docId);
  const details = service.getCompletionEntryDetails(
    fileName,
    pos,
    entryName,
    ts.getDefaultFormatCodeSettings(),
    source,
    undefined,
    isCompletionEntryData(data) ? data : undefined,
  );
  if (!details) return null;

  const codeActions =
    details.codeActions
      ?.map(action => mapCodeAction(action, fileName))
      .filter((action): action is TsCodeAction => action !== null) ?? null;
  const rejectedAll =
    details.codeActions !== undefined &&
    details.codeActions.length > 0 &&
    codeActions !== null &&
    codeActions.length === 0;
  if (rejectedAll) return null;

  return {
    name: details.name,
    displayParts: ts.displayPartsToString(details.displayParts),
    documentation: ts.displayPartsToString(details.documentation),
    tags: (details.tags ?? []).map(tag => tag.name),
    codeActions,
  };
}

function handleDiagnostics(docId: string): TsDiagnostic[] {
  const service = requireEnv().languageService;
  const fileName = docFileName(docId);
  const syntactic = service.getSyntacticDiagnostics(fileName);
  const semantic = service.getSemanticDiagnostics(fileName);
  return [...syntactic, ...semantic].map(diagnostic => ({
    from: diagnostic.start ?? 0,
    to: (diagnostic.start ?? 0) + (diagnostic.length ?? 0),
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    code: diagnostic.code,
  }));
}

/**
 * Answer one request from the page-side client.
 *
 * @example
 * ```ts
 * self.onmessage = handleWorkerMessage;
 * ```
 */
export const handleWorkerMessage = (event: {data: TsWorkerRequest}): void => {
  const request = event.data;
  void (async () => {
    try {
      switch (request.type) {
        case 'init': {
          const tsVersion = await handleInit(request.typesUrl);
          self.postMessage({
            type: 'initOk',
            requestId: request.requestId,
            tsVersion,
          });
          break;
        }
        case 'registerDoc': {
          registerDocument(request.docId, request.fileName, request.text);
          self.postMessage({
            type: 'ack',
            requestId: request.requestId,
            docId: request.docId,
            docVersion: request.docVersion,
          });
          break;
        }
        case 'updateDoc': {
          updateDocument(request.docId, request.text);
          self.postMessage({
            type: 'ack',
            requestId: request.requestId,
            docId: request.docId,
            docVersion: request.docVersion,
          });
          break;
        }
        case 'completions': {
          const entries = handleCompletions(
            request.docId,
            request.pos,
            request.triggerCharacter,
            request.insideModuleSpecifier,
          );
          self.postMessage({
            type: 'completionsResult',
            requestId: request.requestId,
            docId: request.docId,
            docVersion: request.docVersion,
            entries,
          });
          break;
        }
        case 'completionDetails': {
          const details = handleCompletionDetails(
            request.docId,
            request.pos,
            request.entryName,
            request.source,
            request.data,
          );
          self.postMessage({
            type: 'completionDetailsResult',
            requestId: request.requestId,
            docId: request.docId,
            docVersion: request.docVersion,
            details,
          });
          break;
        }
        case 'diagnostics': {
          const diagnostics = handleDiagnostics(request.docId);
          self.postMessage({
            type: 'diagnosticsResult',
            requestId: request.requestId,
            docId: request.docId,
            docVersion: request.docVersion,
            diagnostics,
          });
          break;
        }
        case 'disposeDoc': {
          const fileName = DocPaths.get(request.docId);
          if (fileName) {
            requireEnv().deleteFile(fileName);
            DocPaths.delete(request.docId);
          }
          self.postMessage({
            type: 'ack',
            requestId: request.requestId,
            docId: request.docId,
            docVersion: 0,
          });
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (request.type === 'init') {
        self.postMessage({
          type: 'initError',
          requestId: request.requestId,
          message,
        });
      } else {
        const docId = 'docId' in request ? request.docId : undefined;
        self.postMessage({
          type: 'error',
          requestId: request.requestId,
          docId,
          message,
        });
      }
    }
  })();
};

if (typeof self !== 'undefined') {
  self.onmessage = handleWorkerMessage;
}
