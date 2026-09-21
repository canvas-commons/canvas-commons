import type {FiddleDiagnostic} from './compiler';
import type {FiddleVendorManifest} from './manifest';
import type {
  ConsoleLevel,
  ErrorKind,
  HarnessToHostMessage,
  HostToHarnessMessage,
} from './protocol';
import {DEFAULT_RENDER_SIZE, GenerationTracker} from './protocol';
import {terminateWorker} from './terminate-worker';
import type {WorkerCompileRequest, WorkerCompileResponse} from './worker';

const DEFAULT_DEBOUNCE_MS = 250;

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15000;

/**
 * Everything a fiddle host needs: where to mount, what to serve, and the
 * callbacks a surrounding UI listens on.
 *
 * @example
 * ```ts
 * const options: FiddleHostOptions = {
 *   container: document.querySelector('.preview'),
 *   manifest,
 *   onError: (kind, message) => console.error(kind, message),
 * };
 * ```
 */
export interface FiddleHostOptions {
  container: HTMLElement;
  manifest: FiddleVendorManifest;
  /**
   * The size the harness renders at, which fixes the preview's aspect ratio
   * regardless of the box it is shown in.
   */
  width?: number;
  height?: number;
  /** Backing-store multiplier for the render size. */
  resolutionScale?: number;
  debounceMs?: number;
  handshakeTimeoutMs?: number;
  /**
   * Drops the sandbox boundary, letting scene code reach the embedding page,
   * its storage and the sandbox attribute. Only for a host that chooses the
   * code it runs.
   */
  allowSameOrigin?: boolean;
  onDiagnostics?: (diagnostics: FiddleDiagnostic[]) => void;
  onState?: (paused: boolean) => void;
  onFrame?: (frame: number) => void;
  onDuration?: (duration: number) => void;
  onError?: (kind: ErrorKind, message: string, stack?: string) => void;
  onConsole?: (level: ConsoleLevel, args: string[]) => void;
  createWorker?: () => Worker;
}

/**
 * The handle a fiddle host returns: source in, playback control out.
 *
 * @example
 * ```ts
 * host.setSource('export default makeScene2D(function* () {});');
 * host.play();
 * host.dispose();
 * ```
 */
export interface FiddleHost {
  setSource(code: string): void;
  setResolutionScale(scale: number): void;
  /** Applies to the running scene and to every scene that follows it. */
  setVariables(variables: Record<string, unknown>): void;
  recompile(code: string): void;
  play(): void;
  pause(): void;
  seek(frame: number): void;
  dispose(): void;
}

function isReadyMessage(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'ready'
  );
}

/**
 * Creates the page-side half of a fiddle: a sandboxed preview iframe, a
 * compiler worker, and the debounced pipe between them.
 *
 * @example
 * ```ts
 * const host = createFiddleHost({
 *   container: previewElement,
 *   manifest,
 *   onDiagnostics: diagnostics => editor.setDiagnostics(diagnostics),
 * });
 * host.setSource(initialSource);
 * ```
 */
export function createFiddleHost(options: FiddleHostOptions): FiddleHost {
  const {container, manifest} = options;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const handshakeTimeoutMs =
    options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
  const extraSpecifiers = Object.keys(manifest.importMap.imports);

  const worker =
    options.createWorker?.() ??
    new Worker(new URL('./worker.js', import.meta.url), {type: 'module'});

  const allowSameOrigin = options.allowSameOrigin ?? false;

  const iframe = document.createElement('iframe');
  iframe.title = 'Canvas Commons animation preview';
  if (allowSameOrigin) {
    iframe.sandbox.add('allow-scripts', 'allow-same-origin');
  } else {
    iframe.sandbox.add('allow-scripts');
  }
  iframe.src = manifest.frameUrl;
  container.appendChild(iframe);
  // An opaque origin cannot be addressed, so `ready` authenticates the frame
  // by `event.source` instead.
  const portTargetOrigin = allowSameOrigin
    ? new URL(manifest.frameUrl, window.location.href).origin
    : '*';

  const compileGenerations = new GenerationTracker();
  const harnessGenerations = new GenerationTracker();
  let port: MessagePort | null = null;
  let outboundQueue: HostToHarnessMessage[] = [];
  let compileTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSource: string | null = null;
  let pendingGeneration = -1;
  let disposed = false;
  let workerFailed = false;

  function reportFailure(kind: ErrorKind, message: string): void {
    if (disposed) return;
    options.onError?.(kind, message);
  }

  const handshakeTimer = setTimeout(() => {
    if (disposed || port) return;
    reportFailure(
      'runtime',
      `The preview frame never finished loading (no handshake after ` +
        `${handshakeTimeoutMs}ms). Either ${manifest.frameUrl} is ` +
        `unreachable, the host is not sending Access-Control-Allow-Origin ` +
        `for the vendored fiddle files, or a content security policy blocks ` +
        `the frame from running them.`,
    );
  }, handshakeTimeoutMs);

  function sendToHarness(message: HostToHarnessMessage): void {
    if (disposed) return;
    if (!port) {
      outboundQueue.push(message);
      return;
    }
    port.postMessage(message);
  }

  function handleReadyMessage(event: MessageEvent): void {
    if (disposed || port) return;
    if (event.source !== iframe.contentWindow) return;
    if (!isReadyMessage(event.data)) return;
    window.removeEventListener('message', handleReadyMessage);
    clearTimeout(handshakeTimer);

    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = (portEvent: MessageEvent<HarnessToHostMessage>) =>
      handlePortMessage(portEvent.data);
    port.start();

    iframe.contentWindow?.postMessage(null, portTargetOrigin, [channel.port2]);

    for (const queued of outboundQueue) port.postMessage(queued);
    outboundQueue = [];
  }

  function handlePortMessage(message: HarnessToHostMessage): void {
    if (disposed) return;
    if (message.type === 'ready') return;
    if (message.generation !== harnessGenerations.current) return;
    switch (message.type) {
      case 'state':
        options.onState?.(message.paused);
        break;
      case 'frame':
        options.onFrame?.(message.frame);
        break;
      case 'duration':
        options.onDuration?.(message.duration);
        break;
      case 'error':
        options.onError?.(message.kind, message.message, message.stack);
        break;
      case 'console':
        options.onConsole?.(message.level, message.args);
        break;
    }
  }

  worker.onerror = (event: ErrorEvent) => {
    if (disposed || workerFailed) return;
    workerFailed = true;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    if (compileTimer !== null) {
      clearTimeout(compileTimer);
      compileTimer = null;
    }
    reportFailure(
      'compile',
      `The compiler worker failed; edits will no longer recompile: ` +
        `${event.message}`,
    );
  };

  worker.onmessage = (event: MessageEvent<WorkerCompileResponse>) => {
    if (disposed || workerFailed) return;
    const {generation, result} = event.data;
    if (generation !== compileGenerations.current) return;
    options.onDiagnostics?.(result.diagnostics);
    if (result.diagnostics.some(d => d.severity === 'error')) return;
    harnessGenerations.observe(generation);
    sendToHarness({type: 'run', generation, code: result.code});
  };

  function flushCompile(): void {
    if (compileTimer !== null) {
      clearTimeout(compileTimer);
      compileTimer = null;
    }
    if (disposed || workerFailed || pendingSource === null) return;
    const request: WorkerCompileRequest = {
      type: 'compile',
      generation: pendingGeneration,
      source: pendingSource,
      extraSpecifiers,
    };
    worker.postMessage(request);
  }

  function scheduleCompile(): void {
    if (compileTimer !== null) clearTimeout(compileTimer);
    compileTimer = setTimeout(flushCompile, debounceMs);
  }

  window.addEventListener('message', handleReadyMessage);

  const renderWidth = options.width || DEFAULT_RENDER_SIZE.width;
  const renderHeight = options.height || DEFAULT_RENDER_SIZE.height;
  let resolutionScale = options.resolutionScale ?? 1;

  function sendConfigure(): void {
    sendToHarness({
      type: 'configure',
      width: renderWidth,
      height: renderHeight,
      resolutionScale,
      engineVersion: manifest.engineVersion,
    });
  }

  sendConfigure();

  const setSource = (code: string): void => {
    if (disposed || workerFailed) return;
    pendingSource = code;
    pendingGeneration = compileGenerations.next();
    scheduleCompile();
  };

  return {
    setSource,
    recompile(code: string): void {
      setSource(code);
      flushCompile();
    },
    setResolutionScale(scale: number): void {
      if (scale === resolutionScale) return;
      resolutionScale = scale;
      sendConfigure();
    },
    setVariables(variables: Record<string, unknown>): void {
      sendToHarness({type: 'variables', variables});
    },
    play(): void {
      sendToHarness({type: 'play', generation: harnessGenerations.current});
    },
    pause(): void {
      sendToHarness({type: 'pause', generation: harnessGenerations.current});
    },
    seek(frame: number): void {
      sendToHarness({
        type: 'seek',
        generation: harnessGenerations.current,
        frame,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      clearTimeout(handshakeTimer);
      if (compileTimer !== null) clearTimeout(compileTimer);
      window.removeEventListener('message', handleReadyMessage);
      terminateWorker(worker);
      if (port) port.onmessage = null;
      port?.close();
      port = null;
      outboundQueue = [];
      pendingSource = null;
      iframe.remove();
    },
  };
}
