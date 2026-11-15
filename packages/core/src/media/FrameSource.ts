import {
  ALL_FORMATS,
  Input,
  UrlSource,
  VideoSampleSink,
  type VideoSample,
} from 'mediabunny';
import {Logger} from '../app/Logger';
import {type CacheableFrame, type FrameCache} from './FrameCache';

interface Deferred<T> extends Promise<T> {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  }) as Deferred<T>;
  promise.resolve = resolve;
  promise.reject = reject;
  return promise;
}

export interface FrameSourceOptions {
  readonly cacheBytes: number;
  readonly prefetchSeconds: number;
  /**
   * Returns true when the frame at the timestamp can be produced and should be
   * decoded. Returning false lets the pipeline skip the timestamp.
   */
  readonly canDraw?: (timestamp: number) => boolean;
}

export interface FrameSourceSettings extends FrameSourceOptions {
  readonly cache: FrameCache<CacheableFrame>;
  readonly logger: Logger | Console;
}

export interface CachedFrame extends CacheableFrame {
  readonly source: FrameSource;
  readonly image: ImageBitmap;
  readonly seconds: number;
}

interface DecodeTask {
  readonly seconds: number;
  readonly deferred: Deferred<CachedFrame | null>;
}

/**
 * Decodes the frames of one media source through a serialized WebCodecs
 * pipeline and stores them in the shared frame cache.
 */
export class FrameSource {
  declare public readonly key: string;
  declare public readonly src: string;
  declare public readonly settings: FrameSourceSettings;

  declare private readonly input: Input;
  declare private sink: VideoSampleSink | null;
  declare private readonly queue: DecodeTask[];
  declare private readonly pending: Map<number, DecodeTask>;
  declare private pipeline: Promise<void> | null;
  declare private position: number;
  declare private disposed: boolean;
  declare public duration: number;
  declare public size: {x: number; y: number};

  public constructor(key: string, src: string, settings: FrameSourceSettings) {
    this.key = key;
    this.src = src;
    this.settings = settings;
    this.input = new Input({formats: ALL_FORMATS, source: new UrlSource(src)});
    this.sink = null;
    this.queue = [];
    this.pending = new Map();
    this.pipeline = null;
    this.position = 0;
    this.disposed = false;
    this.duration = 0;
    this.size = {x: 0, y: 0};
  }

  public get cache(): FrameCache<CacheableFrame> {
    return this.settings.cache;
  }

  public get clock(): number {
    return this.position;
  }

  public get pendingCount(): number {
    return this.pending.size;
  }

  public isReady(): boolean {
    return this.duration > 0 && this.size.x > 0 && this.size.y > 0;
  }

  public peek(seconds: number): CachedFrame | null {
    return this.cache.find(
      this.key,
      toMicroseconds(seconds),
    ) as CachedFrame | null;
  }

  /**
   * Schedule decoding of the frame at the timestamp.
   *
   * @remarks
   * Resolves with null when the timestamp cannot produce a frame, so callers
   * never wait on timestamps that will never be drawn.
   */
  public request(seconds: number): Promise<CachedFrame | null> {
    const cached = this.peek(seconds);
    if (cached) {
      return Promise.resolve(cached);
    }

    const pending = this.pending.get(seconds);
    if (pending) {
      return pending.deferred;
    }

    if (!this.settings.canDraw?.(seconds)) {
      return Promise.resolve(null);
    }

    const task: DecodeTask = {
      seconds,
      deferred: deferred<CachedFrame | null>(),
    };
    this.pending.set(seconds, task);
    this.queue.push(task);
    this.start();
    return task.deferred;
  }

  /**
   * Schedule work around the timestamp without blocking the caller.
   */
  public prefetch(seconds: number): void {
    if (!this.isReady() || this.pending.size > 64) return;
    const end = Math.min(
      this.duration,
      seconds + this.settings.prefetchSeconds,
    );
    for (let time = seconds; time <= end; time += 1 / 30) {
      const rounded = Math.round(time * 1000) / 1000;
      if (this.pending.has(rounded) || this.peek(rounded)) continue;
      if (!this.settings.canDraw?.(rounded)) continue;
      const task: DecodeTask = {
        seconds: rounded,
        deferred: deferred<CachedFrame | null>(),
      };
      this.pending.set(rounded, task);
      this.queue.push(task);
      this.start();
    }
  }

  public async drain(): Promise<void> {
    while (this.pipeline) {
      await this.pipeline;
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.pending.clear();
    this.queue.length = 0;
    // mediabunny's published types omit the sink close method.
    (this.sink as unknown as {close(): void})?.close();
    this.input.dispose();
  }

  private start(): void {
    if (this.pipeline) return;
    this.pipeline = this.run().finally(() => {
      this.pipeline = null;
    });
  }

  private async run(): Promise<void> {
    try {
      await this.initialize();
      while (!this.disposed && this.queue.length > 0) {
        const task = this.queue.shift()!;
        await this.process(task);
      }
    } catch (error) {
      this.settings.logger.debug(
        `frame source ${this.key}: pipeline failed (${String((error as Error).message)})`,
      );
    }

    for (const task of this.pending.values()) {
      task.deferred.resolve(null);
    }
    this.pending.clear();
  }

  private async process(task: DecodeTask): Promise<void> {
    this.pending.delete(task.seconds);

    if (!this.sink || !this.settings.canDraw?.(task.seconds)) {
      task.deferred.resolve(null);
      return;
    }

    const sample = await this.sink.getSample(task.seconds);
    if (!sample) {
      task.deferred.resolve(null);
      return;
    }

    const stored = await this.store(sample);
    task.deferred.resolve(stored);
  }

  private async store(sample: VideoSample): Promise<CachedFrame> {
    this.position = sample.microsecondTimestamp / 1e6;
    const source = sample.toVideoFrame();
    const image = await createImageBitmap(source);
    source.close();
    const entry: CachedFrame = {
      key: `${this.key}:${sample.microsecondTimestamp}`,
      sourceKey: this.key,
      microsecondTimestamp: sample.microsecondTimestamp,
      source: this,
      image,
      seconds: sample.microsecondTimestamp / 1e6,
      allocationSize: () => image.width * image.height * 4,
      close: () => image.close(),
    };

    const cached = this.cache.put(entry) as CachedFrame;
    if (cached !== entry) {
      image.close();
    }

    return cached;
  }

  private async initialize(): Promise<void> {
    const [track] = await this.input.getVideoTracks();
    if (!track) {
      return;
    }

    this.sink = new VideoSampleSink(track);
    this.size = {
      x: await track.getCodedWidth(),
      y: await track.getCodedHeight(),
    };
    this.duration =
      (await this.input.getDurationFromMetadata([track])) ??
      (await this.input.computeDuration([track]));

    if (this.settings.logger instanceof Logger) {
      this.settings.logger.debug(
        `frame source ${this.key}: duration=${this.duration.toFixed(2)}s size=${this.size.x}x${this.size.y} cache=${(this.cache.usedBytes / 1024 / 1024).toFixed(1)}MB`,
      );
    }
  }
}

function toMicroseconds(seconds: number): number {
  return Math.round(seconds * 1e6);
}
