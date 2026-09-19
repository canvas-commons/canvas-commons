import type {Node} from '@canvas-commons/2d';
import {Code, Scene2D} from '@canvas-commons/2d';
import type {
  FullSceneDescription,
  LogPayload,
  PlaybackManager,
  PlayerSettings,
  Project,
  SceneDescription,
} from '@canvas-commons/core';
import {
  createSceneMetadata,
  createSettingsMetadata,
  endPlayback,
  endScene,
  Logger,
  LogLevel,
  Player,
  ProjectMetadata,
  Stage,
  startPlayback,
  startScene,
  ValueDispatcher,
  Vector2,
} from '@canvas-commons/core';
import {createFiddleHighlighter} from './highlighter';
import type {
  ConsoleLevel,
  ErrorKind,
  HarnessToHostMessage,
  HostToHarnessMessage,
} from './protocol';
import {
  DEFAULT_RENDER_SIZE,
  GenerationTracker,
  VariableTracker,
} from './protocol';

const SCENE_NAME = 'fiddle';
const FPS = 30;
const DEFAULT_SIZE = new Vector2(
  DEFAULT_RENDER_SIZE.width,
  DEFAULT_RENDER_SIZE.height,
);
const RECALCULATION_TIMEOUT_MS = 20000;

type HarnessPlayer = Pick<
  Player,
  | 'configure'
  | 'deactivate'
  | 'onRender'
  | 'onStateChanged'
  | 'onFrameChanged'
  | 'onDurationChanged'
  | 'onRecalculated'
  | 'requestSeek'
  | 'requestRender'
  | 'setVariables'
  | 'toggleLoop'
  | 'togglePlayback'
> & {
  playback: Pick<
    PlaybackManager,
    'currentScene' | 'previousScene' | 'onScenesRecalculated'
  >;
};

type HarnessStage = Pick<Stage, 'configure' | 'render' | 'finalBuffer'>;

/** The engine and module-loading operations used by a preview harness. */
export interface FiddleHarnessRuntime {
  createPlayer(
    project: Project,
    settings: Partial<PlayerSettings>,
  ): HarnessPlayer;
  createStage(): HarnessStage;
  importModule(url: string): Promise<unknown>;
}

const DEFAULT_RUNTIME: FiddleHarnessRuntime = {
  createPlayer: (project, settings) => new Player(project, settings),
  createStage: () => new Stage(),
  importModule: url => import(/* @vite-ignore */ url),
};

class AlreadyReportedError extends Error {}

function toFullScene(
  description: SceneDescription,
  onReplaced?: ValueDispatcher<FullSceneDescription>,
): FullSceneDescription {
  // `Player` fills the remaining runtime fields before the scene is built.
  const scene = {
    klass: description.klass,
    config: description.config,
    meta: description.meta ?? createSceneMetadata(),
    name: SCENE_NAME,
  } as FullSceneDescription;
  scene.onReplaced = onReplaced ?? new ValueDispatcher(scene);
  return scene;
}

function isSceneDescription(value: unknown): value is SceneDescription {
  return (
    typeof value === 'object' &&
    value !== null &&
    'klass' in value &&
    typeof value.klass === 'function'
  );
}

function stringifyConsoleArg(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack ?? value.message;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function buildProject(
  scene: FullSceneDescription,
  logger: Logger,
  engineVersion: string,
): Project {
  const draft: Omit<Project, 'meta'> = {
    name: SCENE_NAME,
    scenes: [scene],
    plugins: [],
    logger,
    settings: createSettingsMetadata(),
    versions: {
      core: engineVersion,
      two: engineVersion,
      ui: null,
      vitePlugin: null,
    },
    experimentalFeatures: true,
    variables: {},
  };
  // `ProjectMetadata` reads the project it belongs to, so `meta` lands last.
  const project = draft as Project;
  project.meta = new ProjectMetadata(project);
  return project;
}

/**
 * The sandboxed iframe half of a fiddle: it compiles nothing, but mounts the
 * module its host sends, drives a `Player`, and blits each rendered frame onto
 * its own canvas.
 *
 * Construct one per frame document. The host's `configure` message precedes
 * the first `run`, so a project is built with a known size and engine version.
 *
 * @example
 * ```ts
 * new FiddleHarness().start();
 * ```
 */
export class FiddleHarness {
  private canvas: HTMLCanvasElement;
  private logger: Logger;
  private player: HarnessPlayer | null = null;
  private stage: HarnessStage | null = null;
  private sceneOnReplaced: ValueDispatcher<FullSceneDescription> | null = null;
  private generations = new GenerationTracker();
  private variables = new VariableTracker();
  private port: MessagePort | null = null;
  private size = DEFAULT_SIZE;
  private resolutionScale = 1;
  private engineVersion: string | null = null;
  private highlighter = createFiddleHighlighter();
  private readonly previousHighlighter = Code.defaultHighlighter;
  private readonly lifetime = new AbortController();
  private run: AbortController | null = null;
  private restoreConsole: (() => void) | null = null;
  private subscriptions: (() => void)[] = [];

  /** Creates a preview canvas backed by the supplied engine operations. */
  public constructor(private readonly runtime = DEFAULT_RUNTIME) {
    Code.defaultHighlighter = this.highlighter;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.objectFit = 'contain';
    document.body.style.margin = '0';
    document.body.appendChild(this.canvas);

    this.logger = new Logger();
    this.subscriptions.push(
      this.logger.onLogged.subscribe((payload: LogPayload) => {
        if (payload.level === LogLevel.Error) {
          this.postError(
            this.generations.current,
            'runtime',
            payload.message,
            payload.stack,
          );
        }
      }),
    );
  }

  /**
   * Hooks the console, listens for the host's port transfer and announces
   * readiness to the parent document.
   */
  public start(): void {
    if (this.restoreConsole || this.lifetime.signal.aborted) return;
    this.restoreConsole = this.hookConsole();
    const options = {signal: this.lifetime.signal};
    window.addEventListener(
      'unhandledrejection',
      event => {
        this.postError(this.generations.current, 'runtime', event.reason);
      },
      options,
    );
    window.addEventListener(
      'error',
      event => {
        this.postError(
          this.generations.current,
          'runtime',
          event.error ?? event.message,
        );
      },
      options,
    );
    window.addEventListener('message', this.handlePortTransfer, options);
    window.parent.postMessage(
      {type: 'ready'} satisfies HarnessToHostMessage,
      '*',
    );
  }

  /** Stops playback and releases the harness's listeners, port and canvas. */
  public dispose(): void {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort();
    this.run?.abort();
    this.restoreConsole?.();
    this.restoreConsole = null;
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions = [];
    if (this.port) {
      this.port.onmessage = null;
      this.port.close();
      this.port = null;
    }
    this.player?.deactivate();
    this.player = null;
    this.stage = null;
    this.canvas.remove();
    if (Code.defaultHighlighter === this.highlighter) {
      Code.defaultHighlighter = this.previousHighlighter;
    }
  }

  private handlePortTransfer = (event: MessageEvent): void => {
    if (
      this.port ||
      this.lifetime.signal.aborted ||
      event.source !== window.parent
    ) {
      return;
    }
    const [port] = event.ports;
    if (!port) return;
    window.removeEventListener('message', this.handlePortTransfer, false);
    this.port = port;
    port.onmessage = (portEvent: MessageEvent<HostToHarnessMessage>) =>
      this.handleMessage(portEvent.data);
    port.start();
  };

  private handleMessage(message: HostToHarnessMessage): void {
    if (this.lifetime.signal.aborted) return;
    switch (message.type) {
      case 'configure':
        this.size = new Vector2(message.width, message.height);
        this.resolutionScale = message.resolutionScale;
        this.engineVersion = message.engineVersion;
        this.applyRenderSize();
        break;
      case 'variables':
        this.variables.set(message.variables);
        this.updateHighlighter(message.variables);
        this.variables.applyTo(this.player);
        break;
      case 'run':
        void this.handleRun(message.generation, message.code);
        break;
      case 'play':
        if (this.generations.observe(message.generation)) {
          this.player?.togglePlayback(true);
        }
        break;
      case 'pause':
        if (this.generations.observe(message.generation)) {
          this.player?.togglePlayback(false);
        }
        break;
      case 'seek':
        if (this.generations.observe(message.generation)) {
          this.player?.requestSeek(message.frame);
        }
        break;
    }
  }

  private updateHighlighter(variables: Record<string, unknown>): void {
    const previous = this.highlighter;
    this.highlighter = createFiddleHighlighter(variables);
    if (Code.defaultHighlighter === previous) {
      Code.defaultHighlighter = this.highlighter;
    }
    for (const scene of this.player?.playback.onScenesRecalculated.current ??
      []) {
      if (!(scene instanceof Scene2D)) continue;
      try {
        startScene(scene);
        startPlayback(scene.playback);
        for (const node of scene
          .getView()
          .findAll(
            (node: Node): node is Code =>
              node instanceof Code && node.highlighter() === previous,
          )) {
          node.highlighter(this.highlighter);
        }
      } finally {
        endPlayback(scene.playback);
        endScene(scene);
      }
    }
  }

  private async handleRun(generation: number, code: string): Promise<void> {
    if (!this.generations.observe(generation)) return;

    this.run?.abort();
    const run = new AbortController();
    this.run = run;

    const blob = new Blob([code], {type: 'text/javascript'});
    const url = URL.createObjectURL(blob);
    let moduleExports: unknown;
    try {
      moduleExports = await this.runtime.importModule(url);
    } catch (error) {
      this.postError(generation, 'runtime', error);
      return;
    } finally {
      URL.revokeObjectURL(url);
    }

    if (run.signal.aborted || generation !== this.generations.current) return;

    const description =
      typeof moduleExports === 'object' &&
      moduleExports !== null &&
      'default' in moduleExports
        ? moduleExports.default
        : undefined;
    if (!isSceneDescription(description)) {
      this.postError(
        generation,
        'runtime',
        new Error('Fiddle module must default-export a scene.'),
      );
      return;
    }

    try {
      if (!this.player) {
        await this.mount(description, run.signal);
      } else {
        await this.reload(description, run.signal);
      }
    } catch (error) {
      if (!(error instanceof AlreadyReportedError)) {
        this.postError(generation, 'runtime', error);
      }
    }
  }

  private async mount(
    description: SceneDescription,
    signal: AbortSignal,
  ): Promise<void> {
    const engineVersion = this.engineVersion;
    if (engineVersion === null) {
      throw new Error('A configure message must precede the first run.');
    }

    const scene = toFullScene(description);
    this.sceneOnReplaced = scene.onReplaced;

    const player = this.runtime.createPlayer(
      buildProject(scene, this.logger, engineVersion),
      {
        size: this.size,
        fps: FPS,
        resolutionScale: this.resolutionScale,
      },
    );
    player.toggleLoop(true);
    this.subscriptions.push(player.onRender.subscribe(() => this.render()));
    this.subscriptions.push(
      player.onStateChanged.subscribe(state =>
        this.postState(this.generations.current, state.paused),
      ),
    );
    this.subscriptions.push(
      player.onFrameChanged.subscribe(frame =>
        this.postFrame(this.generations.current, frame),
      ),
    );
    this.subscriptions.push(
      player.onDurationChanged.subscribe(duration =>
        this.postDuration(this.generations.current, duration),
      ),
    );
    this.player = player;
    this.variables.applyTo(player);

    await this.waitForRecalculation(signal);
  }

  private async reload(
    description: SceneDescription,
    signal: AbortSignal,
  ): Promise<void> {
    const onReplaced = this.sceneOnReplaced;
    if (!onReplaced) return;
    const replacement = toFullScene(description, onReplaced);
    const recalculated = this.waitForRecalculation(signal);
    onReplaced.current = replacement;
    await recalculated;
  }

  private waitForRecalculation(signal: AbortSignal): Promise<void> {
    const player = this.player;
    if (!player || signal.aborted) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const settle = (action: () => void): void => {
        clearTimeout(timer);
        unsubscribeRecalculated();
        unsubscribeLogged();
        signal.removeEventListener('abort', cancel);
        action();
      };
      const cancel = (): void => settle(resolve);
      const timer = setTimeout(() => {
        settle(() =>
          reject(new Error('Timed out waiting for scene recalculation')),
        );
      }, RECALCULATION_TIMEOUT_MS);
      const unsubscribeRecalculated = player.onRecalculated.subscribe(() => {
        settle(resolve);
      });
      const unsubscribeLogged = this.logger.onLogged.subscribe(
        (payload: LogPayload) => {
          if (payload.level !== LogLevel.Error) return;
          settle(() => reject(new AlreadyReportedError(payload.message)));
        },
      );
      signal.addEventListener('abort', cancel, {once: true});
    });
  }

  private applyRenderSize(): void {
    const generation = this.generations.current;
    this.stage?.configure({
      size: this.size,
      resolutionScale: this.resolutionScale,
    });
    this.player
      ?.configure({
        range: [0, Infinity],
        fps: FPS,
        size: this.size,
        audioOffset: 0,
        resolutionScale: this.resolutionScale,
      })
      .catch((error: unknown) => {
        this.postError(generation, 'runtime', error);
      });
  }

  private async render(): Promise<void> {
    const player = this.player;
    if (!player) return;
    const generation = this.generations.current;
    try {
      if (!this.stage) {
        this.stage = this.runtime.createStage();
        this.stage.configure({
          size: this.size,
          resolutionScale: this.resolutionScale,
        });
      }
      const stage = this.stage;
      await stage.render(
        player.playback.currentScene,
        player.playback.previousScene,
      );
      if (
        !this.lifetime.signal.aborted &&
        generation === this.generations.current
      ) {
        this.blit(stage.finalBuffer);
      }
    } catch (error) {
      this.postError(generation, 'runtime', error);
    }
  }

  private blit(source: HTMLCanvasElement): void {
    const context = this.canvas.getContext('2d');
    if (!context) return;
    if (this.canvas.width !== source.width) this.canvas.width = source.width;
    if (this.canvas.height !== source.height) {
      this.canvas.height = source.height;
    }
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.drawImage(source, 0, 0);
  }

  private hookConsole(): () => void {
    const levels: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
    const restore: (() => void)[] = [];
    for (const level of levels) {
      const original = console[level];
      const hooked = (...args: unknown[]): void => {
        original.apply(console, args);
        this.send({
          type: 'console',
          generation: this.generations.current,
          level,
          args: args.map(stringifyConsoleArg),
        });
      };
      console[level] = hooked;
      restore.push(() => {
        if (console[level] === hooked) console[level] = original;
      });
    }
    return () => restore.forEach(unhook => unhook());
  }

  private postState(generation: number, paused: boolean): void {
    this.send({type: 'state', generation, paused});
  }

  private postFrame(generation: number, frame: number): void {
    this.send({type: 'frame', generation, frame});
  }

  private postDuration(generation: number, duration: number): void {
    this.send({type: 'duration', generation, duration});
  }

  private postError(
    generation: number,
    kind: ErrorKind,
    error: unknown,
    stack?: string,
  ): void {
    if (generation !== this.generations.current) return;
    const message = error instanceof Error ? error.message : String(error);
    const errorStack =
      stack ?? (error instanceof Error ? error.stack : undefined);
    this.send({type: 'error', generation, kind, message, stack: errorStack});
  }

  private send(message: HarnessToHostMessage): void {
    if (this.lifetime.signal.aborted) return;
    this.port?.postMessage(message);
  }
}
