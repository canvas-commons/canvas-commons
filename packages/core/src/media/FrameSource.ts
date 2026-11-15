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
  readonly image: VideoFrame;
  readonly seconds: number;
}

interface DecodeTask {
  readonly microsecondTimestamp: number;
  readonly deferred: Deferred<CachedFrame | null>;
}

function toMicroseconds(seconds: number): number {
  return Math.round(seconds * 1e6);
}

/**
 * Decodes video frames for one source through a serialized WebCodecs pipeline.
 *
 * @remarks
 * Timestamps are consumed in ascending order so every packet is decoded at
 * most once. Frames behind the pipeline position are fetched through
 * `getSample()` instead of rewinding the pipeline.
 */
export class FrameSource {
  declare public readonly key: string;
  declare public readonly src: string;
  declare public readonly settings: FrameSourceSettings;

  declare private readonly input: Input;
  declare private sink: VideoSampleSink | null;
  declare private readonly queue: DecodeTask[];
  declare private readonly pending: Map<number, DecodeTask>;
  declare private readonly delivered: DecodeTask[];
  declare private pipeline: Promise<void> | null;
  declare private wake: Deferred<void>;
  declare private position: number | null;
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
    this.delivered = [];
    this.pipeline = null;
    this.wake = deferred<void>();
    this.position = null;
    this.disposed = false;
    this.duration = 0;
    this.size = {x: 0, y: 0};
  }

  public get cache(): FrameCache<CacheableFrame> {
    return this.settings.cache;
  }

  public get clock(): number {
    return this.position === null ? 0 : this.position / 1e6;
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
    const microsecondTimestamp = toMicroseconds(seconds);
    const cached = this.peek(seconds);
    if (cached) {
      return Promise.resolve(cached);
    }

    const pending = this.pending.get(microsecondTimestamp);
    if (pending) {
      return pending.deferred;
    }

    if (!this.settings.canDraw?.(seconds)) {
      return Promise.resolve(null);
    }

    const task: DecodeTask = {
      microsecondTimestamp,
      deferred: deferred<CachedFrame | null>(),
    };
    this.pending.set(microsecondTimestamp, task);
    this.start();
    this.enqueue(task);
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
      const microsecondTimestamp = toMicroseconds(time);
      if (this.pending.has(microsecondTimestamp) || this.peek(time)) continue;
      if (!this.settings.canDraw?.(time)) continue;
      const task: DecodeTask = {
        microsecondTimestamp,
        deferred: deferred<CachedFrame | null>(),
      };
      this.pending.set(microsecondTimestamp, task);
      this.start();
      this.enqueue(task);
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
    this.delivered.length = 0;
    this.wake.resolve();
    (this.sink as unknown as {close(): void}).close();
    this.input.dispose();
  }

  private start(): void {
    if (this.pipeline) return;
    this.pipeline = this.run().finally(() => {
      this.pipeline = null;
    });
  }

  private enqueue(task: DecodeTask): void {
    if (this.position !== null && task.microsecondTimestamp < this.position) {
      void this.resolveSingle(task);
      return;
    }
    const wasEmpty = this.queue.length === 0;
    this.queue.push(task);
    if (wasEmpty) {
      this.wake.resolve();
      this.wake = deferred<void>();
    }
  }

  private async run(): Promise<void> {
    try {
      await this.initialize();
      for await (const sample of this.sink?.samplesAtTimestamps(
        this.timestamps(),
      ) ?? []) {
        const task = this.delivered.shift();
        if (!task) continue;
        this.pending.delete(task.microsecondTimestamp);
        this.resolveTask(task, sample);
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

  private async *timestamps(): AsyncGenerator<number> {
    while (!this.disposed) {
      const task = this.queue.shift();
      if (!task) {
        await this.wake;
        continue;
      }
      this.delivered.push(task);
      yield task.microsecondTimestamp / 1e6;
    }
  }

  private async resolveSingle(task: DecodeTask): Promise<void> {
    this.pending.delete(task.microsecondTimestamp);
    if (!this.sink) {
      task.deferred.resolve(null);
      return;
    }
    try {
      const sample = await this.sink.getSample(task.microsecondTimestamp / 1e6);
      this.resolveTask(task, sample);
    } catch (error) {
      this.settings.logger.debug(
        `frame source ${this.key}: sample failed (${String((error as Error).message)})`,
      );
      task.deferred.resolve(null);
    }
  }

  private resolveTask(task: DecodeTask, sample: VideoSample | null): void {
    if (!sample) {
      task.deferred.resolve(null);
      return;
    }

    this.position = sample.microsecondTimestamp;
    const image = sample.toVideoFrame();
    const entry: CachedFrame = {
      key: `${this.key}:${sample.microsecondTimestamp}`,
      sourceKey: this.key,
      microsecondTimestamp: sample.microsecondTimestamp,
      source: this,
      image,
      seconds: sample.microsecondTimestamp / 1e6,
      allocationSize: () => image.allocationSize(),
      close: () => image.close(),
    };

    const cached = this.cache.put(entry) as CachedFrame;
    if (cached !== entry) {
      image.close();
    }

    task.deferred.resolve(cached);
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
