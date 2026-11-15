import type {Logger} from '../app/Logger';
import {useLogger} from '../utils/useScene';
import {type CacheableFrame, FrameCache} from './FrameCache';
import {type FrameSourceOptions, FrameSource} from './FrameSource';

export const DEFAULT_FRAME_CACHE_BYTES: number = 128 * 1024 * 1024;
export const DEFAULT_SOURCE_CACHE_BYTES: number = 64 * 1024 * 1024;
export const DEFAULT_PREFETCH_SECONDS: number = 0.4;
export const DEFAULT_MAX_SOURCES: number = 4;

export interface FrameSourceRegistrySettings {
  cacheBytes: number;
  sourceCacheBytes: number;
  prefetchSeconds: number;
  maxSources: number;
}

/**
 * Holds one frame cache shared by every source, so the cache budget applies to
 * the whole project instead of to a single media node.
 */
export class FrameSourceRegistry {
  private readonly sources = new Map<string, FrameSource>();
  private readonly frames: FrameCache<CacheableFrame>;
  private readonly order: string[] = [];

  public constructor(
    private readonly settings: FrameSourceRegistrySettings,
    private readonly logger: Logger | Console,
  ) {
    this.frames = new FrameCache<CacheableFrame>(settings.cacheBytes);
  }

  public get(
    key: string,
    src: string,
    options: FrameSourceOptions,
  ): FrameSource {
    const existing = this.sources.get(key);
    if (existing) {
      this.touch(key);
      return existing;
    }

    const source = new FrameSource(key, src, {
      cacheBytes: options.cacheBytes || this.settings.sourceCacheBytes,
      prefetchSeconds: options.prefetchSeconds ?? this.settings.prefetchSeconds,
      canDraw: options.canDraw,
      cache: this.frames,
      logger: this.logger,
    });
    this.sources.set(key, source);
    this.touch(key);
    this.limit();
    return source;
  }

  public drop(key: string): void {
    const source = this.sources.get(key);
    if (!source) return;
    this.frames.removeWhere(frame => frame.sourceKey === key);
    source.dispose();
    this.sources.delete(key);
    const index = this.order.indexOf(key);
    if (index >= 0) {
      this.order.splice(index, 1);
    }
  }

  public get cache(): FrameCache<CacheableFrame> {
    return this.frames;
  }

  public get sourceCount(): number {
    return this.sources.size;
  }

  public dispose(): void {
    for (const source of this.sources.values()) {
      source.dispose();
    }
    this.sources.clear();
    this.order.length = 0;
    this.frames.clear();
  }

  private touch(key: string): void {
    const index = this.order.indexOf(key);
    if (index >= 0) {
      this.order.splice(index, 1);
    }
    this.order.push(key);
  }

  private limit(): void {
    while (this.order.length > this.settings.maxSources) {
      this.drop(this.order[0]);
    }
  }
}

let DefaultRegistry: FrameSourceRegistry | null = null;

export function useFrameSourceRegistry(): FrameSourceRegistry {
  DefaultRegistry ??= new FrameSourceRegistry(
    {
      cacheBytes: DEFAULT_FRAME_CACHE_BYTES,
      sourceCacheBytes: DEFAULT_SOURCE_CACHE_BYTES,
      prefetchSeconds: DEFAULT_PREFETCH_SECONDS,
      maxSources: DEFAULT_MAX_SOURCES,
    },
    useLogger(),
  );
  return DefaultRegistry;
}
