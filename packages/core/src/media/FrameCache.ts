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
 * Frames are looked up by the exact timestamp they were requested for, so a
 * caller either gets the frame it asked for or has to request a decode.
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

  public get(sourceKey: string, microsecondTimestamp: number): T | null {
    const frame = this.entries.get(frameKey(sourceKey, microsecondTimestamp));
    if (!frame) return null;
    this.touch(frame);
    return frame;
  }

  public put(frame: T): T {
    const existing = this.entries.get(frame.key);
    if (existing) {
      return existing;
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

  public removeWhere(predicate: (frame: T) => boolean): void {
    for (const frame of [...this.entries.values()]) {
      if (this.held.has(frame.key)) continue;
      if (predicate(frame)) {
        this.remove(frame);
      }
    }
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

export function frameKey(
  sourceKey: string,
  microsecondTimestamp: number,
): string {
  return `${sourceKey}:${microsecondTimestamp}`;
}
