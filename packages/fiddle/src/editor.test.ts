import {foldAll, foldedRanges, foldState} from '@codemirror/language';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {createFiddleEditor} from './editor';
import {disposeTsClient} from './ts-client';
import type {TsWorkerRequest, TsWorkerResponse} from './ts-protocol';

// The lint extension re-lints after its own idle delay, which defaults to
// 750ms.
const LINT_DELAY_MS = 750;

function waitPastLintDelay(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, LINT_DELAY_MS + 250));
}

// jsdom has no Worker.
class FakeWorker extends EventTarget implements Worker {
  public onmessage: Worker['onmessage'] = null;
  public onmessageerror: Worker['onmessageerror'] = null;
  public onerror: Worker['onerror'] = null;
  public readonly posted: TsWorkerRequest[] = [];

  public postMessage(message: TsWorkerRequest): void {
    this.posted.push(message);
  }

  public respond(response: TsWorkerResponse): void {
    this.onmessage?.(new MessageEvent('message', {data: response}));
  }

  public terminate(): void {}
}

afterEach(() => {
  disposeTsClient();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('createFiddleEditor', () => {
  test('supports native folding through host extensions and the view', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const editor = createFiddleEditor({
      parent,
      doc: 'function scene() {\n  return 1;\n}',
      onChange: () => {},
      extensions: [foldState],
    });

    expect(foldAll(editor.view)).toBe(true);
    expect(foldedRanges(editor.view.state).size).toBe(1);
    editor.destroy();
  });

  test('destroying during initialization prevents registration and diagnostics', async () => {
    vi.useFakeTimers();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const worker = new FakeWorker();
    const editor = createFiddleEditor({
      parent,
      doc: 'const x = 1;',
      onChange: () => {},
      tsDocId: 'disposed',
      typesUrl: '/types.json',
      createTsWorker: () => worker,
    });
    const init = worker.posted.find(request => request.type === 'init');
    if (!init) throw new Error('Expected initialization');
    editor.destroy();
    worker.respond({
      type: 'initOk',
      requestId: init.requestId,
      tsVersion: '6.0.3',
    });
    await vi.advanceTimersByTimeAsync(1000);

    expect(
      worker.posted.filter(
        request =>
          request.type === 'registerDoc' || request.type === 'diagnostics',
      ),
    ).toEqual([]);
  });

  test('a late registration acknowledgment does not schedule diagnostics', async () => {
    vi.useFakeTimers();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const worker = new FakeWorker();
    const editor = createFiddleEditor({
      parent,
      doc: 'const x = 1;',
      onChange: () => {},
      tsDocId: 'disposed',
      typesUrl: '/types.json',
      createTsWorker: () => worker,
    });
    const init = worker.posted.find(request => request.type === 'init');
    if (!init) throw new Error('Expected initialization');
    worker.respond({
      type: 'initOk',
      requestId: init.requestId,
      tsVersion: '6.0.3',
    });
    await vi.advanceTimersByTimeAsync(0);
    const registration = worker.posted.find(
      request => request.type === 'registerDoc',
    );
    if (!registration) throw new Error('Expected registration');
    editor.destroy();
    worker.respond({
      type: 'ack',
      requestId: registration.requestId,
      docId: registration.docId,
      docVersion: registration.docVersion,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(vi.getTimerCount()).toBe(0);
  });

  test('pushed diagnostics survive the lint idle delay', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const editor = createFiddleEditor({
      parent,
      doc: 'const x = 1;\n',
      onChange: () => {},
    });

    editor.setDiagnostics([
      {from: 6, to: 7, message: 'test diagnostic', severity: 'error'},
    ]);
    expect(parent.querySelector('.cm-content')).toBeTruthy();

    await waitPastLintDelay();

    const marks = parent.querySelectorAll(
      '.cm-lintRange-error, .cm-lintRange-warning',
    );
    expect(marks.length).toBeGreaterThan(0);

    editor.destroy();
  }, 3000);

  test('deferTypeScript holds the worker back until asked', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    let workers = 0;
    const editor = createFiddleEditor({
      parent,
      doc: 'const x = 1;\n',
      onChange: () => {},
      tsDocId: 'deferred',
      typesUrl: '/fiddle/types.json',
      deferTypeScript: true,
      createTsWorker: () => {
        workers += 1;
        return new FakeWorker();
      },
    });

    expect(workers).toBe(0);
    editor.enableTypeScript();
    expect(workers).toBe(1);
    editor.enableTypeScript();
    expect(workers).toBe(1);

    editor.destroy();
  });

  test('reports a language service that never starts', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const errors: string[] = [];
    let worker: FakeWorker | undefined;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const editor = createFiddleEditor({
      parent,
      doc: 'const x = 1;\n',
      onChange: () => {},
      tsDocId: 'broken',
      typesUrl: '/fiddle/types.json',
      createTsWorker: () => {
        worker = new FakeWorker();
        return worker;
      },
      onError: message => errors.push(message),
    });
    worker?.onerror?.(new ErrorEvent('error', {message: 'worker boom'}));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('worker boom');

    logged.mockRestore();
    editor.destroy();
  });

  test('starts the worker on mount without deferTypeScript', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    let workers = 0;
    const editor = createFiddleEditor({
      parent,
      doc: 'const x = 1;\n',
      onChange: () => {},
      tsDocId: 'eager',
      typesUrl: '/fiddle/types.json',
      createTsWorker: () => {
        workers += 1;
        return new FakeWorker();
      },
    });

    expect(workers).toBe(1);

    editor.destroy();
  });
});
