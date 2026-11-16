import {
  ALL_FORMATS,
  Input,
  UrlSource,
  VideoSampleSink,
  type VideoSample,
} from 'mediabunny';
import {Logger} from '../app/Logger';
import {frameKey, type CacheableFrame, type FrameCache} from './FrameCache';

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

export interface FrameSourceSettings {
  readonly cache: FrameCache<CacheableFrame>;
  readonly logger: Logger | Console;
  /**
   * Longest a caller waits for a decoded frame. A stalled decoder must not hold
   * up the render loop.
   */
  readonly timeoutMs: number;
}

export interface CachedFrame extends CacheableFrame {
  readonly source: FrameSource;
  readonly image: ImageBitmap;
  readonly seconds: number;
}

interface DecodeTask {
  readonly seconds: number;
  readonly key: string;
  readonly deferred: Deferred<CachedFrame | null>;
}

/**
 * Decodes single frames of one media source through a serialized WebCodecs
 * pipeline and stores them in the shared frame cache.
 *
 * @remarks
 * Decoding is only used for stills, scrubbing and export - live playback draws
 * the media element directly, which is far cheaper than decoding every frame.
 */
export class FrameSource {
  declare public readonly key: string;
  declare public readonly src: string;
  declare public readonly settings: FrameSourceSettings;

  declare private readonly input: Input;
  declare private sink: VideoSampleSink | null;
  declare private readonly queue: DecodeTask[];
  declare private readonly pending: Map<string, DecodeTask>;
  declare private pipeline: Promise<void> | null;
  declare private disposed: boolean;
  declare public duration: number;
  declare public size: {x: number; y: number};

  public constructor(src: string, settings: FrameSourceSettings) {
    this.key = src;
    this.src = src;
    this.settings = settings;
    this.input = new Input({formats: ALL_FORMATS, source: new UrlSource(src)});
    this.sink = null;
    this.queue = [];
    this.pending = new Map();
    this.pipeline = null;
    this.disposed = false;
    this.duration = 0;
    this.size = {x: 0, y: 0};
  }

  public get cache(): FrameCache<CacheableFrame> {
    return this.settings.cache;
  }

  public get pendingCount(): number {
    return this.pending.size;
  }

  public isReady(): boolean {
    return this.duration > 0 && this.size.x > 0 && this.size.y > 0;
  }

  public peek(seconds: number): CachedFrame | null {
    return this.cache.get(
      this.key,
      toMicroseconds(seconds),
    ) as CachedFrame | null;
  }

  public isCached(seconds: number): boolean {
    return this.peek(seconds) !== null;
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

    const key = frameKey(this.key, toMicroseconds(seconds));
    const pending = this.pending.get(key);
    if (pending) {
      return pending.deferred;
    }

    const task: DecodeTask = {
      seconds,
      key,
      deferred: deferred<CachedFrame | null>(),
    };
    this.pending.set(key, task);
    this.queue.push(task);
    this.start();
    return withTimeout(task.deferred, this.settings.timeoutMs, null);
  }

  public dispose(): void {
    this.disposed = true;
    for (const task of this.pending.values()) {
      task.deferred.resolve(null);
    }
    this.pending.clear();
    this.queue.length = 0;
    this.sink = null;
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
      await withTimeout(this.initialize(), this.settings.timeoutMs, false);
      while (!this.disposed && this.queue.length > 0) {
        const task = this.queue.shift()!;
        await this.process(task);
      }
    } catch (error) {
      this.logFailure(error);
    }

    for (const task of this.pending.values()) {
      task.deferred.resolve(null);
    }
    this.pending.clear();
  }

  private async process(task: DecodeTask): Promise<void> {
    this.pending.delete(task.key);

    if (!this.sink) {
      task.deferred.resolve(null);
      return;
    }

    const sample = await withTimeout(
      this.sink.getSample(task.seconds),
      this.settings.timeoutMs,
      null,
    );
    if (!sample) {
      task.deferred.resolve(null);
      return;
    }

    task.deferred.resolve(await this.store(task, sample));
  }

  private async store(
    task: DecodeTask,
    sample: VideoSample,
  ): Promise<CachedFrame> {
    const source = sample.toVideoFrame();
    const seconds = sample.microsecondTimestamp / 1e6;
    sample.close();
    const image = await createImageBitmap(source);
    source.close();
    const entry: CachedFrame = {
      key: task.key,
      sourceKey: this.key,
      microsecondTimestamp: toMicroseconds(task.seconds),
      source: this,
      image,
      seconds,
      allocationSize: () => image.width * image.height * 4,
      close: () => image.close(),
    };

    const cached = this.cache.put(entry) as CachedFrame;
    if (cached !== entry) {
      image.close();
    }

    return cached;
  }

  private async initialize(): Promise<boolean> {
    const [track] = await this.input.getVideoTracks();
    if (!track) {
      return false;
    }

    this.sink = new VideoSampleSink(track);
    this.size = {
      x: await track.getCodedWidth(),
      y: await track.getCodedHeight(),
    };
    this.duration =
      (await this.input.getDurationFromMetadata([track])) ??
      (await this.input.computeDuration([track]));

    this.logDetail(
      `ready duration=${this.duration.toFixed(2)}s size=${this.size.x}x${this.size.y}`,
    );
    return true;
  }

  private logDetail(message: string): void {
    if (this.settings.logger instanceof Logger) {
      this.settings.logger.debug(
        `frame source ${shortUrl(this.key)}: ${message}`,
      );
    }
  }

  private logFailure(error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    this.logDetail(`pipeline failed (${reason})`);
  }
}

function toMicroseconds(seconds: number): number {
  return Math.round(seconds * 1e6);
}

function shortUrl(url: string): string {
  return url.split('/').pop() ?? url;
}

function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  fallback: T,
): Promise<T> {
  return new Promise<T>(resolve => {
    const timer = setTimeout(() => resolve(fallback), milliseconds);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
