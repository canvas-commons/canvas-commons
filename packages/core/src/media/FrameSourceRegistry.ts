import type {Logger} from '../app/Logger';
import {useLogger} from '../utils/useScene';
import {type CacheableFrame, FrameCache} from './FrameCache';
import {type FrameSourceOptions, FrameSource} from './FrameSource';

export const DEFAULT_FRAME_CACHE_BYTES: number = 128 * 1024 * 1024;
export const DEFAULT_SOURCE_CACHE_BYTES: number = 64 * 1024 * 1024;
export const DEFAULT_PREFETCH_SECONDS: number = 0.4;

export interface FrameSourceRegistrySettings {
  cacheBytes: number;
  sourceCacheBytes: number;
  prefetchSeconds: number;
}

/**
 * Holds one frame cache shared by every source, so the cache budget applies to
 * the whole project instead of to a single media node.
 */
export class FrameSourceRegistry {
  private readonly sources = new Map<string, FrameSource>();
  private readonly frames: FrameCache<CacheableFrame>;

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
      return existing;
    }

    const source = new FrameSource(key, src, {
      cacheBytes: options.cacheBytes,
      prefetchSeconds: options.prefetchSeconds ?? this.settings.prefetchSeconds,
      canDraw: options.canDraw,
      cache: this.frames,
      logger: this.logger,
    });
    this.sources.set(key, source);
    return source;
  }

  public drop(key: string): void {
    const source = this.sources.get(key);
    if (!source) return;
    source.dispose();
    this.sources.delete(key);
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
    this.frames.clear();
  }
}

let DefaultRegistry: FrameSourceRegistry | null = null;

export function useFrameSourceRegistry(): FrameSourceRegistry {
  DefaultRegistry ??= new FrameSourceRegistry(
    {
      cacheBytes: DEFAULT_FRAME_CACHE_BYTES,
      sourceCacheBytes: DEFAULT_SOURCE_CACHE_BYTES,
      prefetchSeconds: DEFAULT_PREFETCH_SECONDS,
    },
    useLogger(),
  );
  return DefaultRegistry;
}
