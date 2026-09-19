import {Code, makeScene2D, Scene2D, type View2D} from '@canvas-commons/2d';
import type {
  FullSceneDescription,
  PlayerSettings,
  PlayerState,
  Project,
  ThreadGeneratorFactory,
} from '@canvas-commons/core';
import {
  AsyncEventDispatcher,
  endPlayback,
  endScene,
  EventDispatcher,
  PlaybackManager,
  PlaybackStatus,
  ReadOnlyTimeEvents,
  SharedWebGLContext,
  startPlayback,
  startScene,
  useScene,
  ValueDispatcher,
  Vector2,
} from '@canvas-commons/core';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {FiddleHarness, type FiddleHarnessRuntime} from './harness-runtime';
import type {HostToHarnessMessage} from './protocol';

function deferred<TValue>() {
  let resolve: (value: TValue) => void;
  let reject: (reason: unknown) => void;
  const promise = new Promise<TValue>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return {
    promise,
    resolve: (value: TValue) => resolve(value),
    reject: (reason: unknown) => reject(reason),
  };
}

function sceneDescription() {
  return makeScene2D(function* () {
    yield;
  });
}

function fixture() {
  const rendered = new AsyncEventDispatcher<void>();
  const recalculated = new EventDispatcher<void>();
  const state = new ValueDispatcher<PlayerState>({
    paused: true,
    loop: true,
    muted: true,
    volume: 1,
    speed: 1,
  });
  const frame = new ValueDispatcher(0);
  const duration = new ValueDispatcher(0);
  const playback = new PlaybackManager();
  const replacements: FullSceneDescription[] = [];
  let mounted: Scene2D | null = null;
  const player = {
    playback,
    onRender: rendered.subscribable,
    onRecalculated: recalculated.subscribable,
    onStateChanged: state.subscribable,
    onFrameChanged: frame.subscribable,
    onDurationChanged: duration.subscribable,
    configure: vi.fn(async () => {}),
    deactivate: vi.fn(),
    requestSeek: vi.fn(),
    requestRender: vi.fn(),
    setVariables: vi.fn(),
    toggleLoop: vi.fn(),
    togglePlayback: vi.fn(),
  };
  const stage = {
    finalBuffer: document.createElement('canvas'),
    configure: vi.fn(),
    render: vi.fn(async () => {}),
  };
  const createPlayer = vi.fn(
    (project: Project, settings: Partial<PlayerSettings>) => {
      const description = project.scenes[0];
      const fullDescription: FullSceneDescription<
        ThreadGeneratorFactory<View2D>
      > = {
        ...description,
        ...sceneDescription(),
        playback: new PlaybackStatus(playback),
        size: settings.size ?? new Vector2(1920, 1080),
        resolutionScale: settings.resolutionScale ?? 1,
        logger: project.logger,
        timeEventsClass: ReadOnlyTimeEvents,
        sharedWebGLContext: new SharedWebGLContext(project.logger),
        get onReplaced() {
          return onReplaced;
        },
      };
      const onReplaced = new ValueDispatcher(fullDescription);
      const scene = new Scene2D(fullDescription);
      mounted = scene;
      playback.setup([scene]);
      description.onReplaced.subscribe(
        value => replacements.push(value),
        false,
      );
      return player;
    },
  );
  const runtime = {
    createPlayer,
    createStage: vi.fn(() => stage),
    importModule: vi
      .fn<(url: string) => Promise<unknown>>()
      .mockResolvedValue({default: sceneDescription()}),
  } satisfies FiddleHarnessRuntime;
  const channel = new MessageChannel();
  const posted = vi
    .spyOn(channel.port1, 'postMessage')
    .mockImplementation(() => {});
  const ready = vi
    .spyOn(window.parent, 'postMessage')
    .mockImplementation(() => {});
  const harness = new FiddleHarness(runtime);
  const connect = (
    port = channel.port1,
    source: Window | null = window.parent,
  ) => {
    window.dispatchEvent(new MessageEvent('message', {source, ports: [port]}));
  };
  const send = (message: HostToHarnessMessage) => {
    channel.port1.onmessage?.(new MessageEvent('message', {data: message}));
  };
  const configure = () =>
    send({
      type: 'configure',
      width: 960,
      height: 540,
      resolutionScale: 2,
      engineVersion: '0.3.1',
    });
  const run = async (generation = 0) => {
    send({type: 'run', generation, code: `scene ${generation}`});
    await Promise.resolve();
  };
  const addCode = () => {
    if (!mounted) throw new Error('No scene has been mounted.');
    const scene = mounted;
    startScene(scene);
    startPlayback(scene.playback);
    try {
      const code = new Code({code: 'const answer = 42;'});
      scene.getView().add(code);
      return code;
    } finally {
      endPlayback(scene.playback);
      endScene(scene);
    }
  };
  const dispose = () => {
    harness.dispose();
    channel.port1.close();
    channel.port2.close();
  };
  harness.start();
  return {
    harness,
    runtime,
    player,
    stage,
    posted,
    ready,
    channel,
    rendered,
    recalculated,
    state,
    frame,
    duration,
    replacements,
    connect,
    send,
    configure,
    run,
    addCode,
    dispose,
  };
}

describe('FiddleHarness lifecycle', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation(() => {});
    }
    let blob = 0;
    vi.stubGlobal(
      'URL',
      class extends URL {
        public static createObjectURL = vi.fn(() => `blob:fiddle-${blob++}`);
        public static revokeObjectURL = vi.fn();
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function mount() {
    const test = fixture();
    cleanup = test.dispose;
    return test;
  }

  it('announces readiness once and accepts only one parent port', () => {
    const test = mount();
    test.harness.start();
    expect(test.ready).toHaveBeenCalledExactlyOnceWith({type: 'ready'}, '*');
    test.connect(test.channel.port1, null);
    expect(test.channel.port1.onmessage).toBeNull();
    test.connect();
    expect(test.channel.port1.onmessage).toBeTypeOf('function');
    const second = new MessageChannel();
    test.connect(second.port1);
    expect(second.port1.onmessage).toBeNull();
    second.port1.close();
    second.port2.close();
  });

  it('configures one player, applies queued variables and reuses it for replacements', async () => {
    const test = mount();
    test.connect();
    test.configure();
    const variables = {accent: 'blue'};
    test.send({type: 'variables', variables});
    await test.run(0);
    expect(test.runtime.createPlayer).toHaveBeenCalledTimes(1);
    expect(test.runtime.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        versions: expect.objectContaining({core: '0.3.1'}),
      }),
      {size: new Vector2(960, 540), fps: 30, resolutionScale: 2},
    );
    expect(test.player.setVariables).toHaveBeenCalledWith(variables);
    expect(test.player.requestRender).toHaveBeenCalledOnce();
    test.recalculated.dispatch();
    await test.run(1);
    expect(test.runtime.createPlayer).toHaveBeenCalledTimes(1);
    expect(test.replacements).toHaveLength(1);
    expect(test.replacements[0].onReplaced.current).toBe(test.replacements[0]);
    expect(test.player.deactivate).not.toHaveBeenCalled();
    test.recalculated.dispatch();
    expect(vi.getTimerCount()).toBe(0);
    test.frame.current = 12;
    test.duration.current = 90;
    test.state.current = {...test.state.current, paused: false};
    expect(test.posted).toHaveBeenCalledWith({
      type: 'frame',
      generation: 1,
      frame: 12,
    });
    expect(test.posted).toHaveBeenCalledWith({
      type: 'duration',
      generation: 1,
      duration: 90,
    });
    expect(test.posted).toHaveBeenCalledWith({
      type: 'state',
      generation: 1,
      paused: false,
    });
  });

  it('recolours code nodes in a mounted scene and leaves no scene open', async () => {
    const test = mount();
    test.connect();
    test.configure();
    await test.run();
    const code = test.addCode();
    const before = code.highlighter();
    expect(before).toBe(Code.defaultHighlighter);
    test.send({type: 'variables', variables: {accent: '#ff0000'}});
    expect(code.highlighter()).toBe(Code.defaultHighlighter);
    expect(code.highlighter()).not.toBe(before);
    expect(() => useScene()).toThrow();
  });

  it('discards stale modules and transport commands and revokes every blob URL', async () => {
    const test = mount();
    const older = deferred<unknown>();
    test.runtime.importModule.mockReturnValueOnce(older.promise);
    test.connect();
    test.configure();
    await test.run(0);
    await test.run(1);
    older.resolve({default: sceneDescription()});
    await Promise.resolve();
    expect(test.runtime.createPlayer).toHaveBeenCalledTimes(1);
    expect(test.replacements).toHaveLength(0);
    test.send({type: 'play', generation: 0});
    test.send({type: 'pause', generation: 0});
    test.send({type: 'seek', generation: 0, frame: 5});
    expect(test.player.togglePlayback).not.toHaveBeenCalled();
    expect(test.player.requestSeek).not.toHaveBeenCalled();
    test.send({type: 'play', generation: 1});
    test.send({type: 'seek', generation: 1, frame: 8});
    expect(test.player.togglePlayback).toHaveBeenCalledWith(true);
    expect(test.player.requestSeek).toHaveBeenCalledWith(8);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fiddle-0');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fiddle-1');
  });

  it('reports module errors once and suppresses errors from superseded imports', async () => {
    const test = mount();
    const older = deferred<unknown>();
    test.runtime.importModule
      .mockReturnValueOnce(older.promise)
      .mockRejectedValueOnce(new Error('current import failed'));
    test.connect();
    test.configure();
    await test.run(0);
    await test.run(1);
    older.reject(new Error('stale import failed'));
    await Promise.resolve();
    expect(test.posted).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: 'error',
        generation: 1,
        message: 'current import failed',
      }),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('requires configuration before mounting a scene', async () => {
    const test = mount();
    test.connect();
    await test.run();
    await Promise.resolve();
    expect(test.posted).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        generation: 0,
        message: 'A configure message must precede the first run.',
      }),
    );
    expect(test.runtime.createPlayer).not.toHaveBeenCalled();
  });

  it.each([{}, {default: null}, {default: {klass: 3}}])(
    'rejects an invalid scene export %s',
    async exports => {
      const test = mount();
      test.runtime.importModule.mockResolvedValue(exports);
      test.connect();
      test.configure();
      await test.run();
      expect(test.posted).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'Fiddle module must default-export a scene.',
        }),
      );
      expect(test.runtime.createPlayer).not.toHaveBeenCalled();
    },
  );

  it('clears recalculation waits on errors and superseding runs', async () => {
    const test = mount();
    test.connect();
    test.configure();
    await test.run();
    expect(vi.getTimerCount()).toBe(1);
    const pending = deferred<unknown>();
    test.runtime.importModule.mockReturnValueOnce(pending.promise);
    await test.run(1);
    expect(vi.getTimerCount()).toBe(0);
    pending.resolve({default: sceneDescription()});
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);
    test.posted.mockClear();
    const [project] = test.runtime.createPlayer.mock.calls[0];
    project.logger.error({message: 'scene failed', stack: 'scene stack'});
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20000);
    expect(vi.getTimerCount()).toBe(0);
    expect(test.posted).toHaveBeenCalledExactlyOnceWith({
      type: 'error',
      generation: 1,
      kind: 'runtime',
      message: 'scene failed',
      stack: 'scene stack',
    });
  });

  it('reports recalculation timeouts without leaving an active wait', async () => {
    const test = mount();
    test.connect();
    test.configure();
    await test.run();
    test.posted.mockClear();
    await vi.advanceTimersByTimeAsync(20000);
    expect(test.posted).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: 'error',
        generation: 0,
        message: 'Timed out waiting for scene recalculation',
      }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reuses the stage and ignores stale asynchronous render failures', async () => {
    const test = mount();
    test.connect();
    test.configure();
    await test.run();
    test.recalculated.dispatch();
    await test.rendered.dispatch();
    expect(test.runtime.createStage).toHaveBeenCalledOnce();
    expect(test.stage.configure).toHaveBeenCalledWith({
      size: new Vector2(960, 540),
      resolutionScale: 2,
    });
    const pending = deferred<void>();
    test.stage.render.mockReturnValueOnce(pending.promise);
    const rendering = test.rendered.dispatch();
    await test.run(1);
    test.recalculated.dispatch();
    test.posted.mockClear();
    pending.reject(new Error('obsolete render'));
    await rendering;
    expect(test.posted).not.toHaveBeenCalled();
    expect(test.runtime.createStage).toHaveBeenCalledOnce();
    test.stage.render.mockRejectedValueOnce(new Error('current render'));
    await test.rendered.dispatch();
    expect(test.posted).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        generation: 1,
        message: 'current render',
      }),
    );
  });

  it('does not paint a frame after its run has been superseded', async () => {
    const test = mount();
    test.connect();
    test.configure();
    await test.run();
    test.recalculated.dispatch();
    const pending = deferred<void>();
    test.stage.render.mockReturnValueOnce(pending.promise);
    const rendering = test.rendered.dispatch();
    const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext);
    getContext.mockClear();
    await test.run(1);
    test.recalculated.dispatch();
    pending.resolve();
    await rendering;
    expect(getContext).not.toHaveBeenCalled();
    await test.rendered.dispatch();
    expect(getContext).toHaveBeenCalledOnce();
  });

  it('reports failures while constructing the render stage', async () => {
    const test = mount();
    test.connect();
    test.configure();
    await test.run();
    test.recalculated.dispatch();
    test.runtime.createStage.mockImplementationOnce(() => {
      throw new Error('stage failed');
    });
    await test.rendered.dispatch();
    expect(test.posted).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        generation: 0,
        message: 'stage failed',
      }),
    );
  });

  it('forwards console output and window errors, and cleans up on disposal', async () => {
    const test = mount();
    test.connect();
    test.configure();
    await test.run();
    test.posted.mockClear();
    console.warn('message', {value: 1});
    window.dispatchEvent(
      new ErrorEvent('error', {error: new Error('window failed')}),
    );
    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), {
        reason: new Error('promise failed'),
      }),
    );
    expect(test.posted).toHaveBeenCalledWith({
      type: 'console',
      generation: 0,
      level: 'warn',
      args: ['message', '{"value":1}'],
    });
    expect(test.posted).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        generation: 0,
        message: 'window failed',
      }),
    );
    expect(test.posted).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        generation: 0,
        message: 'promise failed',
      }),
    );
    expect(test.posted).toHaveBeenCalledTimes(3);
    test.harness.dispose();
    test.harness.dispose();
    expect(test.player.deactivate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector('canvas')).toBeNull();
    expect(test.channel.port1.onmessage).toBeNull();
    test.posted.mockClear();
    console.warn('after disposal');
    test.frame.current = 99;
    window.dispatchEvent(
      new ErrorEvent('error', {error: new Error('after disposal')}),
    );
    expect(test.posted).not.toHaveBeenCalled();
  });

  it('does not mount a module that finishes after disposal', async () => {
    const test = mount();
    const pending = deferred<unknown>();
    test.runtime.importModule.mockReturnValueOnce(pending.promise);
    test.connect();
    test.configure();
    await test.run();
    test.harness.dispose();
    pending.resolve({default: sceneDescription()});
    await Promise.resolve();
    expect(test.runtime.createPlayer).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fiddle-0');
    expect(vi.getTimerCount()).toBe(0);
  });
});
