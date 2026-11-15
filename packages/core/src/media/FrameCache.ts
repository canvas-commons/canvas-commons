export interface CacheableFrame {
  /** Cache key in the form `${sourceKey}:${microsecondTimestamp}`. */
  readonly key: string;
  readonly sourceKey: string;
  readonly microsecondTimestamp: number;
  allocationSize(): number;
  close(): void;
}

/**
 * A budget-bounded LRU cache of decoded frames shared across sources.
 *
 * @remarks
 * Held frames are never evicted, so a frame stays alive while it is being
 * drawn or exported.
 */
export class FrameCache<T extends CacheableFrame> {
  private readonly entries = new Map<string, T>();
  private readonly held = new Set<string>();
  private used = 0;

  public constructor(private readonly budgetValue: number) {}

  public get usedBytes(): number {
    return this.used;
  }

  public get budget(): number {
    return this.budgetValue;
  }

  public get count(): number {
    return this.entries.size;
  }

  /**
   * Find the cached frame at or before the microsecond timestamp of a source.
   */
  public find(sourceKey: string, microsecondTimestamp: number): T | null {
    let best: T | null = null;
    for (const entry of this.entries.values()) {
      if (entry.sourceKey !== sourceKey) continue;
      if (entry.microsecondTimestamp > microsecondTimestamp) continue;
      if (
        best === null ||
        entry.microsecondTimestamp > best.microsecondTimestamp
      ) {
        best = entry;
      }
    }
    if (best === null) return null;
    this.touch(best);
    return best;
  }

  public put(frame: T): T {
    if (this.entries.has(frame.key)) {
      return this.entries.get(frame.key)!;
    }
    this.entries.set(frame.key, frame);
    this.used += frame.allocationSize();
    this.evict();
    return frame;
  }

  public remove(frame: T): void {
    if (!this.entries.has(frame.key)) return;
    this.entries.delete(frame.key);
    this.held.delete(frame.key);
    this.used -= frame.allocationSize();
    frame.close();
  }

  public hold(frame: T): void {
    this.held.add(frame.key);
  }

  public release(frame: T): void {
    this.held.delete(frame.key);
  }

  public clear(): void {
    for (const [key, frame] of [...this.entries]) {
      if (this.held.has(key)) continue;
      this.entries.delete(key);
      this.used -= frame.allocationSize();
      frame.close();
    }
  }

  private touch(frame: T): void {
    if (!this.entries.has(frame.key)) return;
    this.entries.delete(frame.key);
    this.entries.set(frame.key, frame);
  }

  private evict(): void {
    for (const key of [...this.entries.keys()]) {
      if (this.used <= this.budget) break;
      if (this.held.has(key)) continue;
      const frame = this.entries.get(key)!;
      this.entries.delete(key);
      this.used -= frame.allocationSize();
      frame.close();
    }
  }
}
