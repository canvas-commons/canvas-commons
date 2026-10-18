import {SignalMap} from './createSignalMap';
import type {SimpleSignal} from './SignalContext';

/** An entry that decays as its progress reaches 1. */
export interface MotionEntry {
  readonly progress: SimpleSignal<number>;
}

const NoEntries: readonly never[] = [];

/**
 * A signal map of stacked motion entries. Each entry belongs to the progress
 * signal of the animation that added it.
 */
export class MotionStack<TKey, TEntry extends MotionEntry> extends SignalMap<
  TKey,
  readonly TEntry[]
> {
  public entries(key: TKey): readonly TEntry[] {
    return this.get(key) ?? NoEntries;
  }

  /** Add `entry` on top of `key` and answer the call that takes it away. */
  public push(key: TKey, entry: TEntry): () => void {
    this.set(key, [...this.entries(key), entry]);
    return () => this.keep(key, other => other !== entry);
  }

  /** Remove every entry that `progress` owns. */
  public release(progress: SimpleSignal<number>) {
    for (const key of this.keys()) {
      this.keep(key, entry => entry.progress !== progress);
    }
  }

  private keep(key: TKey, predicate: (entry: TEntry) => boolean) {
    const entries = this.entries(key);
    const rest = entries.filter(predicate);
    if (rest.length === entries.length) {
      return;
    }
    if (rest.length > 0) {
      this.set(key, rest);
    } else {
      this.delete(key);
    }
  }
}

/**
 * Create a map of motion entries stacked for each key.
 *
 * @example
 * ```ts
 * const offsets = createMotionStack<string, {
 *   progress: SimpleSignal<number>;
 *   delta: number;
 * }>();
 * const progress = createSignal(0);
 * offsets.push('a', {progress, delta: 10});
 * yield* progress(1, 0.6);
 * offsets.release(progress);
 * ```
 */
export function createMotionStack<
  TKey,
  TEntry extends MotionEntry,
>(): MotionStack<TKey, TEntry> {
  return new MotionStack<TKey, TEntry>();
}
