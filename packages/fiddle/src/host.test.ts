import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import type {FiddleDiagnostic} from './compiler';
import {createFiddleHost} from './host';
import type {FiddleVendorManifest} from './manifest';
import type {HarnessToHostMessage, HostToHarnessMessage} from './protocol';
import type {WorkerCompileResponse} from './worker';

const MANIFEST: FiddleVendorManifest = {
  hash: 'test-hash',
  engineVersion: '0.3.1',
  stamp: 'test-stamp',
  frameUrl: '/fiddle/0.3.1-test-hash/frame.html',
  harnessUrl: '/fiddle/0.3.1-test-hash/harness.js',
  typesUrl: '/fiddle/0.3.1-test-hash/types.json',
  tsVersion: '6.0.3',
  importMap: {
    /* eslint-disable-next-line @typescript-eslint/naming-convention -- import
       map keys are module specifiers. */
    imports: {'@canvas-commons/core': '/fiddle/0.3.1-test-hash/core.js'},
  },
};

// jsdom has no Worker.
class FakeWorker extends EventTarget implements Worker {
  public onmessage: Worker['onmessage'] = null;
  public onmessageerror: Worker['onmessageerror'] = null;
  public onerror: Worker['onerror'] = null;
  public posted: unknown[] = [];
  public terminated = false;

  public postMessage(message: unknown): void {
    this.posted.push(message);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public crash(message: string): void {
    this.onerror?.(new ErrorEvent('error', {message}));
  }

  public compileResult(response: WorkerCompileResponse): void {
    this.onmessage?.(new MessageEvent('message', {data: response}));
  }
}

// jsdom does not reflect HTMLIFrameElement.sandbox as a token list, which the
// host writes to.
beforeAll(() => {
  if (document.createElement('iframe').sandbox) return;
  function tokenList(element: HTMLIFrameElement) {
    return {
      add(...tokens: string[]) {
        const current = (element.getAttribute('sandbox') ?? '')
          .split(/\s+/)
          .filter(Boolean);
        element.setAttribute(
          'sandbox',
          [...new Set([...current, ...tokens])].join(' '),
        );
      },
    };
  }

  Object.defineProperty(HTMLIFrameElement.prototype, 'sandbox', {
    configurable: true,
    get(this: HTMLIFrameElement) {
      return tokenList(this);
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/* eslint-disable @typescript-eslint/naming-convention -- scene variables are
   CSS custom property names. */
const LATTE_GREEN = {'--cc-green': '#40a02b'};
const MOCHA_GREEN = {'--cc-green': '#a6e3a1'};
/* eslint-enable @typescript-eslint/naming-convention */

interface Reported {
  kind: string;
  message: string;
}

function mount(overrides: {
  resolutionScale?: number;
  handshakeTimeoutMs?: number;
}) {
  const container = document.createElement('div');
  document.body.append(container);
  const errors: Reported[] = [];
  const diagnostics: FiddleDiagnostic[][] = [];
  const worker = new FakeWorker();
  const host = createFiddleHost({
    container,
    manifest: MANIFEST,
    width: 1600,
    height: 900,
    debounceMs: 0,
    resolutionScale: overrides.resolutionScale,
    handshakeTimeoutMs: overrides.handshakeTimeoutMs,
    createWorker: () => worker,
    onError: (kind, message) => errors.push({kind, message}),
    onDiagnostics: result => diagnostics.push(result),
  });
  return {host, worker, errors, container, diagnostics};
}

// Completes the port handshake the harness normally performs, and collects
// everything the host sends over the transferred port.
function handshake(container: HTMLElement) {
  const iframe = container.querySelector('iframe');
  const frameWindow = iframe?.contentWindow;
  if (!frameWindow) throw new Error('No preview frame was created.');

  const transferred: {port: MessagePort | null} = {port: null};
  frameWindow.postMessage = ((
    _data: unknown,
    _origin: string,
    transfer?: Transferable[],
  ) => {
    const [port] = transfer ?? [];
    transferred.port = port instanceof MessagePort ? port : null;
  }) as typeof frameWindow.postMessage;

  const ready = new MessageEvent('message', {data: {type: 'ready'}});
  Object.defineProperty(ready, 'source', {value: frameWindow});
  window.dispatchEvent(ready);

  const port = transferred.port;
  if (!port) throw new Error('The host transferred no port.');

  const received: HostToHarnessMessage[] = [];
  port.onmessage = (event: MessageEvent<HostToHarnessMessage>) =>
    received.push(event.data);
  port.start();

  // Port delivery is a task, not a microtask.
  return {
    send: (message: HarnessToHostMessage) => port.postMessage(message),
    settled: async (count: number): Promise<HostToHarnessMessage[]> => {
      await vi.waitFor(() =>
        expect(received.length).toBeGreaterThanOrEqual(count),
      );
      return received;
    },
  };
}

describe('createFiddleHost configure', () => {
  it('sends the render size, scale and engine version before any run', async () => {
    const {host, container} = mount({resolutionScale: 1.75});
    const {settled} = handshake(container);
    expect(await settled(1)).toEqual([
      {
        type: 'configure',
        width: 1600,
        height: 900,
        resolutionScale: 1.75,
        engineVersion: '0.3.1',
      },
    ]);
    host.dispose();
  });

  it('defaults to an unscaled render', async () => {
    const {host, container} = mount({});
    const {settled} = handshake(container);
    const [message] = await settled(1);
    expect(message).toMatchObject({resolutionScale: 1});
    host.dispose();
  });

  it('re-sends on a scale change, and only on a change', async () => {
    const {host, container} = mount({resolutionScale: 1});
    const {settled} = handshake(container);
    host.setResolutionScale(2);
    host.setResolutionScale(2);
    const messages = await settled(2);
    expect(
      messages
        .filter(message => message.type === 'configure')
        .map(message => message.resolutionScale),
    ).toEqual([1, 2]);
    host.dispose();
  });
});

describe('createFiddleHost preview frame', () => {
  it('keeps the frame opaque-origin by default', () => {
    const {host, container} = mount({});
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe?.title).toBe('Canvas Commons animation preview');
    host.dispose();
  });

  it('adds allow-same-origin when a host opts in', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const host = createFiddleHost({
      container,
      manifest: MANIFEST,
      debounceMs: 0,
      allowSameOrigin: true,
      createWorker: () => new FakeWorker(),
    });
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin',
    );
    host.dispose();
  });
});

describe('createFiddleHost scene variables', () => {
  it('delivers variables sent before the handshake', async () => {
    const {host, container} = mount({});
    host.setVariables(LATTE_GREEN);
    const {settled} = handshake(container);
    const messages = await settled(2);
    expect(messages[1]).toEqual({type: 'variables', variables: LATTE_GREEN});
    host.dispose();
  });

  it('sends every later change', async () => {
    const {host, container} = mount({});
    const {settled} = handshake(container);
    host.setVariables(LATTE_GREEN);
    host.setVariables(MOCHA_GREEN);
    const messages = await settled(3);
    expect(
      messages
        .filter(message => message.type === 'variables')
        .map(message => message.variables),
    ).toEqual([LATTE_GREEN, MOCHA_GREEN]);
    host.dispose();
  });
});

describe('createFiddleHost transport generation', () => {
  it('ignores replies for runs that were never sent without poisoning the current generation', async () => {
    const {host, worker, container, errors, diagnostics} = mount({});
    const {settled, send} = handshake(container);
    await settled(1);
    host.recompile('export default 1;');
    worker.compileResult({
      type: 'compiled',
      generation: 50,
      result: {code: 'export default 50;', diagnostics: []},
    });
    expect(diagnostics).toEqual([]);
    worker.compileResult({
      type: 'compiled',
      generation: 0,
      result: {code: 'export default 1;', diagnostics: []},
    });
    expect((await settled(2))[1]).toMatchObject({type: 'run', generation: 0});
    send({type: 'error', generation: 50, kind: 'runtime', message: 'future'});
    send({type: 'error', generation: -1, kind: 'runtime', message: 'stale'});
    send({type: 'error', generation: 0, kind: 'runtime', message: 'current'});
    await vi.waitFor(() =>
      expect(errors).toEqual([{kind: 'runtime', message: 'current'}]),
    );
    host.dispose();
  });

  it('stamps play with the run generation before the harness echoes it', async () => {
    const {host, worker, container} = mount({});
    const {settled} = handshake(container);
    await settled(1);

    host.recompile('export default 1;');
    worker.compileResult({
      type: 'compiled',
      generation: 0,
      result: {code: 'export default 1;', diagnostics: []},
    });
    host.play();

    const messages = await settled(3);
    expect(messages[1]).toMatchObject({type: 'run', generation: 0});
    expect(messages[2]).toEqual({type: 'play', generation: 0});
    host.dispose();
  });
});

describe('createFiddleHost compile worker failure', () => {
  it('reports a worker that fails to instantiate', () => {
    const {host, worker, errors} = mount({});
    worker.crash('worker.js failed to evaluate');
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe('compile');
    expect(errors[0].message).toContain('worker.js failed to evaluate');
    host.dispose();
  });

  it('reports once, not per later edit', () => {
    const {host, worker, errors} = mount({});
    worker.crash('boom');
    worker.crash('boom again');
    expect(errors).toHaveLength(1);
    host.dispose();
  });

  it('stops posting compile requests to a dead worker', () => {
    const {host, worker, errors} = mount({});
    worker.crash('boom');
    const before = worker.posted.length;
    host.recompile('export default 1;');
    expect(worker.posted.length).toBe(before);
    expect(errors).toHaveLength(1);
    host.dispose();
  });
});

describe('createFiddleHost harness handshake', () => {
  it('discards late worker replies and work requested after disposal', () => {
    vi.useFakeTimers();
    const {host, worker, diagnostics} = mount({});
    host.recompile('export default 1;');
    const lateReply = worker.onmessage?.bind(worker);
    host.dispose();
    lateReply?.(
      new MessageEvent('message', {
        data: {
          type: 'compiled',
          generation: 0,
          result: {code: 'export default 1;', diagnostics: []},
        },
      }),
    );
    host.recompile('export default 2;');
    host.setSource('export default 3;');
    vi.runAllTimers();
    expect(diagnostics).toEqual([]);
    expect(worker.posted).toHaveLength(1);
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
    expect(worker.terminated).toBe(true);
  });

  it('reports a frame that never handshakes once the deadline passes', () => {
    vi.useFakeTimers();
    const {host, errors} = mount({handshakeTimeoutMs: 5000});
    expect(errors).toHaveLength(0);
    vi.advanceTimersByTime(5000);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe('runtime');
    expect(errors[0].message).toContain(MANIFEST.frameUrl);
    host.dispose();
  });

  it('does not report after dispose', () => {
    vi.useFakeTimers();
    const {host, errors} = mount({handshakeTimeoutMs: 5000});
    host.dispose();
    vi.advanceTimersByTime(5000);
    expect(errors).toHaveLength(0);
  });
});
