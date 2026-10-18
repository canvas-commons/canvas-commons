import {DependencyContext} from './DependencyContext';

class Tracker extends DependencyContext {
  public static get collecting(): boolean {
    return DependencyContext.collectionStack.length > 0;
  }

  public constructor() {
    super(undefined);
  }

  public track() {
    this.event.reset();
    this.collect();
  }

  public notify() {
    this.markDirty();
  }
}

/**
 * A map whose readers depend only on what they read.
 *
 * @remarks
 * `get` and `has` depend on one key. `keys` and `size` depend on the set of
 * keys and not on the values.
 */
export class SignalMap<TKey, TValue> {
  private readonly values = new Map<TKey, TValue>();
  private readonly trackers = new Map<TKey, Tracker>();
  private readonly keySet = new Tracker();

  public get(key: TKey): TValue | undefined {
    this.track(key);
    return this.values.get(key);
  }

  public has(key: TKey): boolean {
    this.track(key);
    return this.values.has(key);
  }

  public keys(): TKey[] {
    this.keySet.track();
    return [...this.values.keys()];
  }

  public size(): number {
    this.keySet.track();
    return this.values.size;
  }

  public set(key: TKey, value: TValue): this {
    const added = !this.values.has(key);
    if (!added && this.values.get(key) === value) {
      return this;
    }
    this.values.set(key, value);
    this.trackers.get(key)?.notify();
    if (added) {
      this.keySet.notify();
    }
    return this;
  }

  public delete(key: TKey): boolean {
    const existed = this.values.delete(key);
    const tracker = this.trackers.get(key);
    if (tracker) {
      this.trackers.delete(key);
      tracker.notify();
      tracker.dispose();
    }
    if (!existed) {
      return false;
    }
    this.keySet.notify();
    if (this.values.size === 0) {
      this.releaseTrackers();
    }
    return true;
  }

  public dispose() {
    for (const tracker of this.trackers.values()) {
      tracker.dispose();
    }
    this.trackers.clear();
    this.keySet.dispose();
    this.values.clear();
  }

  private releaseTrackers() {
    for (const tracker of this.trackers.values()) {
      tracker.notify();
      tracker.dispose();
    }
    this.trackers.clear();
  }

  private track(key: TKey) {
    if (!Tracker.collecting) {
      return;
    }
    if (this.values.size === 0) {
      this.keySet.track();
      return;
    }
    let tracker = this.trackers.get(key);
    if (!tracker) {
      tracker = new Tracker();
      this.trackers.set(key, tracker);
    }
    tracker.track();
  }
}

/**
 * Create a map with a dependency for each key.
 *
 * @example
 * ```ts
 * const scores = createSignalMap<string, number>();
 * const alice = createComputed(() => scores.get('alice') ?? 0);
 * const players = createComputed(() => scores.keys().length);
 *
 * scores.set('alice', 3); // `alice` and `players` update
 * scores.set('bob', 5); // only `players` updates
 * scores.set('bob', 7); // nothing updates
 * ```
 */
export function createSignalMap<TKey, TValue>(): SignalMap<TKey, TValue> {
  return new SignalMap<TKey, TValue>();
}
