import {afterEach, describe, expect, test, vi} from 'vitest';
import {disposeTsClient, getTsClient, type TsClient} from './ts-client';
import type {TsWorkerRequest, TsWorkerResponse} from './ts-protocol';

class FakeWorker extends EventTarget implements Worker {
  public onmessage: ((event: MessageEvent<TsWorkerResponse>) => void) | null =
    null;
  public onmessageerror: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public readonly posted: TsWorkerRequest[] = [];
  public terminated = false;

  public postMessage(message: TsWorkerRequest): void {
    this.posted.push(message);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public respond(response: TsWorkerResponse): void {
    this.onmessage?.(new MessageEvent('message', {data: response}));
  }

  public crash(error: Error): void {
    this.onerror?.(new ErrorEvent('error', {error, message: error.message}));
  }
}

function isRequestOfType<TType extends TsWorkerRequest['type']>(
  request: TsWorkerRequest,
  type: TType,
): request is Extract<TsWorkerRequest, {type: TType}> {
  return request.type === type;
}

// Every client method awaits `ready` first, so a request reaches the worker a
// few microtasks after the call rather than synchronously.
async function waitForRequest<TType extends TsWorkerRequest['type']>(
  worker: FakeWorker,
  type: TType,
  docId?: string,
): Promise<Extract<TsWorkerRequest, {type: TType}>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    for (const request of worker.posted) {
      if (!isRequestOfType(request, type)) continue;
      if (docId !== undefined && !('docId' in request)) continue;
      if (
        docId !== undefined &&
        'docId' in request &&
        request.docId !== docId
      ) {
        continue;
      }
      return request;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`The client never posted a ${type} request`);
}

function startClient(): {client: TsClient; worker: FakeWorker} {
  const worker = new FakeWorker();
  const client = getTsClient({
    typesUrl: '/types.json',
    createWorker: () => worker,
  });
  return {client, worker};
}

function respondInit(worker: FakeWorker): void {
  const request = worker.posted.find(posted => posted.type === 'init');
  if (request?.type !== 'init') throw new Error('The client never sent init');
  worker.respond({
    type: 'initOk',
    requestId: request.requestId,
    tsVersion: '5.9.3',
  });
}

async function registerAndAck(
  client: TsClient,
  worker: FakeWorker,
  docId: string,
  fileName: string,
  text: string,
): Promise<number> {
  const promise = client.registerDoc(docId, fileName, text);
  const request = await waitForRequest(worker, 'registerDoc', docId);
  worker.respond({
    type: 'ack',
    requestId: request.requestId,
    docId,
    docVersion: request.docVersion,
  });
  return promise;
}

async function updateAndAck(
  client: TsClient,
  worker: FakeWorker,
  docId: string,
  text: string,
): Promise<number> {
  const promise = client.updateDoc(docId, text);
  const request = await waitForRequest(worker, 'updateDoc', docId);
  worker.respond({
    type: 'ack',
    requestId: request.requestId,
    docId,
    docVersion: request.docVersion,
  });
  return promise;
}

afterEach(() => {
  disposeTsClient();
});

describe('ts-client', () => {
  test('preserves edits queued while initialization is pending', async () => {
    const {client, worker} = startClient();
    const registration = client.registerDoc('doc', '/doc', 'const x = 1;');
    const firstEdit = client.updateDoc('doc', 'const x = 2;');
    const secondEdit = client.updateDoc('doc', 'const x = 3;');
    respondInit(worker);
    await waitForRequest(worker, 'registerDoc', 'doc');
    const changes = worker.posted.filter(
      request => request.type === 'registerDoc' || request.type === 'updateDoc',
    );

    expect(changes.map(request => [request.docVersion, request.text])).toEqual([
      [0, 'const x = 1;'],
      [1, 'const x = 2;'],
      [2, 'const x = 3;'],
    ]);
    for (const request of changes) {
      worker.respond({
        type: 'ack',
        requestId: request.requestId,
        docId: 'doc',
        docVersion: request.docVersion,
      });
    }
    await expect(
      Promise.all([registration, firstEdit, secondEdit]),
    ).resolves.toEqual([0, 1, 2]);
  });

  test('disposing before initialization cancels registration and updates', async () => {
    const {client, worker} = startClient();
    const registration = client.registerDoc('doc', '/doc', 'const x = 1;');
    const update = client.updateDoc('doc', 'const x = 2;');
    client.disposeDoc('doc');
    respondInit(worker);

    await Promise.all([registration, update]);

    expect(
      worker.posted.filter(
        request =>
          request.type === 'registerDoc' || request.type === 'updateDoc',
      ),
    ).toEqual([]);
    await expect(client.diagnostics('doc', 1)).resolves.toBeNull();
  });

  test('reusing an id does not revive a disposed registration', async () => {
    const {client, worker} = startClient();
    const original = client.registerDoc('doc', '/doc', 'const old = 1;');
    client.disposeDoc('doc');
    const replacement = client.registerDoc('doc', '/doc', 'const current = 2;');
    respondInit(worker);

    const request = await waitForRequest(worker, 'registerDoc', 'doc');
    expect(request.text).toBe('const current = 2;');
    expect(worker.posted.filter(item => item.type === 'registerDoc')).toEqual([
      request,
    ]);
    worker.respond({
      type: 'ack',
      requestId: request.requestId,
      docId: 'doc',
      docVersion: 0,
    });

    await expect(original).resolves.toBe(0);
    await expect(replacement).resolves.toBe(0);
  });

  test('two documents with identical source edit independently', async () => {
    const {client, worker} = startClient();
    respondInit(worker);
    expect(await client.ready).toBe(true);

    const source = 'const shared = 1;';
    const versionA = await registerAndAck(
      client,
      worker,
      'hash-1',
      '/fiddles/hash-1/index.tsx',
      source,
    );
    const versionB = await registerAndAck(
      client,
      worker,
      'hash-2',
      '/fiddles/hash-2/index.tsx',
      source,
    );
    expect(versionA).toBe(0);
    expect(versionB).toBe(0);

    const updatedVersionA = await updateAndAck(
      client,
      worker,
      'hash-1',
      'const shared = 2;',
    );
    expect(updatedVersionA).toBe(1);

    const completionsB = client.completions('hash-2', 0, 5, undefined, false);
    const request = await waitForRequest(worker, 'completions', 'hash-2');
    worker.respond({
      type: 'completionsResult',
      requestId: request.requestId,
      docId: 'hash-2',
      docVersion: 0,
      entries: [{name: 'shared', kind: 'const', sortText: '1'}],
    });
    const resultB = await completionsB;
    expect(resultB).not.toBeNull();
    expect(resultB?.[0]?.name).toBe('shared');

    const staleA = await client.completions('hash-1', 0, 5, undefined, false);
    expect(staleA).toBeNull();
  });

  test('rejects a late response from a previous registration of the same id', async () => {
    const {client, worker} = startClient();
    respondInit(worker);
    await registerAndAck(client, worker, 'doc', '/doc', 'const x = missing;');
    const diagnostics = client.diagnostics('doc', 0);
    const request = await waitForRequest(worker, 'diagnostics', 'doc');
    client.disposeDoc('doc');
    worker.posted.length = 0;
    await registerAndAck(client, worker, 'doc', '/doc', 'const x = 1;');
    worker.respond({
      type: 'diagnosticsResult',
      requestId: request.requestId,
      docId: 'doc',
      docVersion: 0,
      diagnostics: [{from: 10, to: 17, message: 'Unknown name', code: 2304}],
    });

    await expect(diagnostics).resolves.toBeNull();
  });

  test('a completion list still lands after the next keystroke', async () => {
    const {client, worker} = startClient();
    respondInit(worker);
    expect(await client.ready).toBe(true);
    await registerAndAck(client, worker, 'doc', '/doc', 'cons');

    const completions = client.completions('doc', 0, 4, undefined, false);
    const request = await waitForRequest(worker, 'completions', 'doc');
    await updateAndAck(client, worker, 'doc', 'const');
    worker.respond({
      type: 'completionsResult',
      requestId: request.requestId,
      docId: 'doc',
      docVersion: request.docVersion,
      entries: [{name: 'const', kind: 'keyword', sortText: '1'}],
    });

    expect(await completions).toHaveLength(1);
  });

  test('a worker that fails to construct disables the client', async () => {
    const client = getTsClient({
      typesUrl: '/types.json',
      createWorker: () => {
        throw new Error('Worker construction blocked by CSP');
      },
    });
    expect(await client.ready).toBe(false);
    await expect(client.registerDoc('x', '/x', 'code')).resolves.toBe(0);
    await expect(
      client.completions('x', 0, 0, undefined, false),
    ).resolves.toBeNull();
    await expect(client.diagnostics('x', 0)).resolves.toBeNull();
  });

  test('a worker crash resolves pending calls and disables later ones', async () => {
    const {client, worker} = startClient();
    respondInit(worker);
    expect(await client.ready).toBe(true);

    await registerAndAck(client, worker, 'doc', '/doc', 'code');

    const pending = client.diagnostics('doc', 0);
    await waitForRequest(worker, 'diagnostics', 'doc');
    worker.crash(new Error('worker.js failed to evaluate'));
    await expect(pending).resolves.toBeNull();
    expect(worker.terminated).toBe(true);
    expect(worker.onmessage).toBeNull();

    await expect(
      client.completions('doc', 0, 0, undefined, false),
    ).resolves.toBeNull();
    await expect(client.diagnostics('doc', 0)).resolves.toBeNull();
  });

  test('releases a worker whose type pack fails to initialize', async () => {
    const {client, worker} = startClient();
    const request = await waitForRequest(worker, 'init');
    worker.respond({
      type: 'initError',
      requestId: request.requestId,
      message: 'The type pack is incompatible.',
    });

    await expect(client.ready).resolves.toBe(false);
    expect(client.failure).toContain('The type pack is incompatible.');
    expect(worker.terminated).toBe(true);
  });

  test('a send failure releases pending requests and stops the worker', async () => {
    const {client, worker} = startClient();
    respondInit(worker);
    await registerAndAck(client, worker, 'doc', '/doc', 'const x = 1;');
    const pending = client.diagnostics('doc', 0);
    await waitForRequest(worker, 'diagnostics', 'doc');
    vi.spyOn(worker, 'postMessage').mockImplementation(() => {
      throw new DOMException('Cannot clone completion data', 'DataCloneError');
    });

    await expect(
      client.completionDetails('doc', 0, 4, 'Rect', undefined, undefined),
    ).resolves.toBeNull();
    expect(worker.terminated).toBe(true);
    await expect(pending).resolves.toBeNull();
    await expect(client.diagnostics('doc', 0)).resolves.toBeNull();
  });

  test('disposeTsClient terminates the worker the next call replaces', () => {
    const {worker} = startClient();
    respondInit(worker);
    disposeTsClient();
    expect(worker.terminated).toBe(true);

    let created = 0;
    getTsClient({
      typesUrl: '/types.json',
      createWorker: () => {
        created += 1;
        return new FakeWorker();
      },
    });
    expect(created).toBe(1);
  });
});
