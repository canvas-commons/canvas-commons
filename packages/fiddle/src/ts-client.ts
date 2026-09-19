import type {
  TsCompletionDetails,
  TsCompletionEntry,
  TsDiagnostic,
  TsWorkerRequest,
  TsWorkerResponse,
} from './ts-protocol';

interface PendingRequest {
  resolve: (value: TsWorkerResponse) => void;
  reject: (reason: Error) => void;
}

/**
 * The page-side handle on the shared language service worker.
 *
 * Every method resolves. A worker that fails to start, or crashes later,
 * degrades to no completions and no diagnostics instead of throwing.
 */
export interface TsClient {
  /** Register a virtual document at version zero, replacing the same id. */
  registerDoc(docId: string, fileName: string, text: string): Promise<number>;
  /** Replace the document text and return its incremented version. */
  updateDoc(docId: string, text: string): Promise<number>;
  /** Request a completion list that CodeMirror can map through later edits. */
  completions(
    docId: string,
    docVersion: number,
    pos: number,
    triggerCharacter: string | undefined,
    insideModuleSpecifier: boolean,
  ): Promise<TsCompletionEntry[] | null>;
  /** Resolve an entry's import edits, returning null if the document changes. */
  completionDetails(
    docId: string,
    docVersion: number,
    pos: number,
    entryName: string,
    source: string | undefined,
    data: unknown,
  ): Promise<TsCompletionDetails | null>;
  /** Check a document version, returning null if it changes during the check. */
  diagnostics(
    docId: string,
    docVersion: number,
  ): Promise<TsDiagnostic[] | null>;
  /** Remove a document and invalidate its pending responses. */
  disposeDoc(docId: string): void;
  /** Resolve whether the worker successfully loads its type pack. */
  ready: Promise<boolean>;
  /** Why the service failed to start, or stopped after initialization. */
  readonly failure: string | null;
}

let Singleton: TsClientInternal | null = null;

class TsClientInternal implements TsClient {
  public readonly ready: Promise<boolean>;
  public failure: string | null = null;

  private worker: Worker | null = null;
  private requestId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly documents = new Map<string, {version: number}>();

  public constructor(typesUrl: string, createWorker: () => Worker) {
    try {
      const worker = createWorker();
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<TsWorkerResponse>) =>
        this.handleMessage(event.data);
      worker.onerror = (event: ErrorEvent) =>
        this.disable(event.error ?? new Error(event.message));
      worker.onmessageerror = () =>
        this.disable(new Error('a response could not be deserialized'));
      this.ready = this.init(typesUrl);
    } catch (error) {
      this.disable(error);
      this.ready = Promise.resolve(false);
    }
  }

  public async registerDoc(
    docId: string,
    fileName: string,
    text: string,
  ): Promise<number> {
    const docVersion = 0;
    if (!this.worker) return docVersion;
    const document = {version: docVersion};
    this.documents.set(docId, document);
    const ok = await this.ready;
    if (!ok || this.documents.get(docId) !== document) return docVersion;
    try {
      await this.send({
        type: 'registerDoc',
        requestId: this.nextRequestId(),
        docId,
        docVersion,
        fileName,
        text,
      });
    } catch {
      return docVersion;
    }
    return docVersion;
  }

  public async updateDoc(docId: string, text: string): Promise<number> {
    const document = this.documents.get(docId);
    if (!document) return 0;
    const docVersion = ++document.version;
    const ok = await this.ready;
    if (!ok || this.documents.get(docId) !== document) return docVersion;
    try {
      await this.send({
        type: 'updateDoc',
        requestId: this.nextRequestId(),
        docId,
        docVersion,
        text,
      });
    } catch {
      return docVersion;
    }
    return docVersion;
  }

  public async completions(
    docId: string,
    docVersion: number,
    pos: number,
    triggerCharacter: string | undefined,
    insideModuleSpecifier: boolean,
  ): Promise<TsCompletionEntry[] | null> {
    const document = this.documents.get(docId);
    const ok = await this.ready;
    if (
      !ok ||
      !document ||
      this.documents.get(docId) !== document ||
      document.version !== docVersion
    ) {
      return null;
    }
    try {
      const response = await this.send({
        type: 'completions',
        requestId: this.nextRequestId(),
        docId,
        docVersion,
        pos,
        triggerCharacter,
        insideModuleSpecifier,
      });
      if (response.type !== 'completionsResult') return null;
      if (this.documents.get(docId) !== document) return null;
      return response.entries;
    } catch {
      return null;
    }
  }

  public async completionDetails(
    docId: string,
    docVersion: number,
    pos: number,
    entryName: string,
    source: string | undefined,
    data: unknown,
  ): Promise<TsCompletionDetails | null> {
    const document = this.documents.get(docId);
    const ok = await this.ready;
    if (
      !ok ||
      !document ||
      this.documents.get(docId) !== document ||
      document.version !== docVersion
    ) {
      return null;
    }
    try {
      const response = await this.send({
        type: 'completionDetails',
        requestId: this.nextRequestId(),
        docId,
        docVersion,
        pos,
        entryName,
        source,
        data,
      });
      if (response.type !== 'completionDetailsResult') return null;
      if (
        this.documents.get(docId) !== document ||
        document.version !== response.docVersion
      ) {
        return null;
      }
      return response.details;
    } catch {
      return null;
    }
  }

  public async diagnostics(
    docId: string,
    docVersion: number,
  ): Promise<TsDiagnostic[] | null> {
    const document = this.documents.get(docId);
    const ok = await this.ready;
    if (
      !ok ||
      !document ||
      this.documents.get(docId) !== document ||
      document.version !== docVersion
    ) {
      return null;
    }
    try {
      const response = await this.send({
        type: 'diagnostics',
        requestId: this.nextRequestId(),
        docId,
        docVersion,
      });
      if (response.type !== 'diagnosticsResult') return null;
      if (
        this.documents.get(docId) !== document ||
        document.version !== response.docVersion
      ) {
        return null;
      }
      return response.diagnostics;
    } catch {
      return null;
    }
  }

  public disposeDoc(docId: string): void {
    this.documents.delete(docId);
    if (!this.worker) return;
    void this.send({
      type: 'disposeDoc',
      requestId: this.nextRequestId(),
      docId,
    }).catch(() => {});
  }

  public destroy(): void {
    this.stop(new Error('ts-client: destroyed'));
  }

  private stop(reason: Error): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
    for (const pending of this.pending.values()) {
      pending.reject(reason);
    }
    this.pending.clear();
    this.documents.clear();
  }

  private disable(reason: unknown): void {
    if (this.failure) return;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    this.failure = `The TypeScript language service worker failed: ${error.message}`;
    console.error(
      '[fiddle] TypeScript language service worker failed; completions and ' +
        'TS diagnostics are disabled for this page:',
      error,
    );
    this.stop(error);
  }

  private handleMessage(response: TsWorkerResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    pending.resolve(response);
  }

  private nextRequestId(): number {
    this.requestId += 1;
    return this.requestId;
  }

  private send(request: TsWorkerRequest): Promise<TsWorkerResponse> {
    const worker = this.worker;
    if (!worker) {
      return Promise.reject(new Error('ts-client: unavailable'));
    }
    return new Promise((resolve, reject) => {
      this.pending.set(request.requestId, {resolve, reject});
      try {
        worker.postMessage(request);
      } catch (error) {
        this.disable(error);
      }
    });
  }

  private async init(typesUrl: string): Promise<boolean> {
    try {
      const response = await this.send({
        type: 'init',
        requestId: this.nextRequestId(),
        typesUrl,
      });
      if (response.type === 'initOk') return true;
      this.disable(
        new Error(
          response.type === 'initError' ? response.message : response.type,
        ),
      );
    } catch (error) {
      if (this.worker) this.disable(error);
    }
    return false;
  }
}

/**
 * How to reach the type pack and the worker that loads it.
 */
export interface GetTsClientOptions {
  typesUrl: string;
  createWorker?: () => Worker;
}

/**
 * Get the language service client shared by every fiddle on the page.
 *
 * The first call starts the worker and every later call reuses it. The host
 * owns teardown, so call {@link disposeTsClient} when the page or view that
 * holds the editors goes away.
 *
 * @example
 * ```ts
 * const client = getTsClient({typesUrl: '/fiddle/types.json'});
 * ```
 */
export function getTsClient(options: GetTsClientOptions): TsClient {
  if (!Singleton) {
    const createWorker =
      options.createWorker ??
      (() =>
        new Worker(new URL('./ts-worker.js', import.meta.url), {
          type: 'module',
        }));
    Singleton = new TsClientInternal(options.typesUrl, createWorker);
  }
  return Singleton;
}

/**
 * Terminate the shared worker and forget it. The next {@link getTsClient}
 * call starts a new one.
 *
 * @example
 * ```ts
 * disposeTsClient();
 * ```
 */
export function disposeTsClient(): void {
  Singleton?.destroy();
  Singleton = null;
}
