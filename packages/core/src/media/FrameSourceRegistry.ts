import type {Logger} from '../app/Logger';
import {useLogger} from '../utils/useScene';
import {type CacheableFrame, FrameCache} from './FrameCache';
import {FrameSource} from './FrameSource';

export const DEFAULT_FRAME_CACHE_BYTES: number = 512 * 1024 * 1024;
export const DEFAULT_MAX_SOURCES: number = 16;
export const DEFAULT_TIMEOUT_MS: number = 2000;

export interface FrameSourceRegistrySettings {
  cacheBytes: number;
  maxSources: number;
  timeoutMs: number;
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

  public get(src: string): FrameSource {
    const existing = this.sources.get(src);
    if (existing) {
      this.touch(src);
      return existing;
    }

    const source = new FrameSource(src, {
      cache: this.frames,
      logger: this.logger,
      timeoutMs: this.settings.timeoutMs,
    });
    this.sources.set(src, source);
    this.touch(src);
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
      const oldest = this.order[0];
      if (!this.sources.has(oldest)) {
        this.order.shift();
        continue;
      }
      this.drop(oldest);
    }
  }
}

let DefaultRegistry: FrameSourceRegistry | null = null;

export function useFrameSourceRegistry(): FrameSourceRegistry {
  DefaultRegistry ??= new FrameSourceRegistry(
    {
      cacheBytes: DEFAULT_FRAME_CACHE_BYTES,
      maxSources: DEFAULT_MAX_SOURCES,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    useLogger(),
  );
  return DefaultRegistry;
}
