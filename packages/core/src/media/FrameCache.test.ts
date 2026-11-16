import {describe, expect, test} from 'vitest';
import type {CacheableFrame} from './FrameCache';
import {FrameCache} from './FrameCache';

class FakeFrame implements CacheableFrame {
  public closed = false;
  public readonly key: string;

  public constructor(
    public readonly sourceKey: string,
    public readonly microsecondTimestamp: number,
    private readonly size: number,
  ) {
    this.key = `${sourceKey}:${microsecondTimestamp}`;
  }

  public allocationSize(): number {
    return this.size;
  }

  public close(): void {
    this.closed = true;
  }
}

const MakeFrame = (
  sourceKey: string,
  microsecondTimestamp: number,
  size: number,
): FakeFrame => new FakeFrame(sourceKey, microsecondTimestamp, size);

describe('FrameCache', () => {
  test('returns the frame stored for the exact timestamp', () => {
    const cache = new FrameCache<CacheableFrame>(1000);
    cache.put(MakeFrame('a', 100, 10));
    cache.put(MakeFrame('a', 300, 10));

    expect(cache.get('a', 300)?.microsecondTimestamp).toBe(300);
    expect(cache.get('a', 250)).toBeNull();
    expect(cache.get('a', 99)).toBeNull();
  });

  test('does not return frames from another source', () => {
    const cache = new FrameCache<CacheableFrame>(1000);
    cache.put(MakeFrame('a', 100, 10));

    expect(cache.get('b', 100)).toBeNull();
  });

  test('closes the least recently used frames over the budget', () => {
    const cache = new FrameCache<CacheableFrame>(30);
    const first = MakeFrame('a', 1, 10);
    const second = MakeFrame('a', 2, 10);
    const third = MakeFrame('a', 3, 10);

    cache.put(first);
    cache.put(second);
    cache.put(third);
    expect(cache.usedBytes).toBe(30);
    expect(first.closed).toBe(false);

    cache.put(MakeFrame('a', 4, 10));
    expect(first.closed).toBe(true);
    expect(cache.count).toBe(3);

    expect(cache.get('a', 2)).toBe(second);
    expect(second.closed).toBe(false);

    cache.put(MakeFrame('a', 5, 10));
    expect(third.closed).toBe(true);
    expect(second.closed).toBe(false);
    expect(cache.usedBytes).toBe(30);
  });

  test('keeps held frames alive while evicting', () => {
    const cache = new FrameCache<CacheableFrame>(20);
    const held = MakeFrame('a', 1, 10);
    cache.put(held);
    cache.hold(held);
    cache.put(MakeFrame('a', 2, 10));
    cache.put(MakeFrame('a', 3, 10));

    expect(held.closed).toBe(false);
    cache.release(held);
    cache.put(MakeFrame('a', 4, 10));
    expect(held.closed).toBe(true);
  });

  test('reuses an entry for the same timestamp', () => {
    const cache = new FrameCache<CacheableFrame>(100);
    const stored = cache.put(MakeFrame('a', 5, 10));
    const again = cache.put(MakeFrame('a', 5, 10));

    expect(again).toBe(stored);
    expect(cache.count).toBe(1);
    expect(cache.usedBytes).toBe(10);
  });

  test('closes only its own entries on clear', () => {
    const cache = new FrameCache<CacheableFrame>(100);
    const kept = MakeFrame('a', 1, 10);
    const removed = MakeFrame('a', 2, 10);
    cache.put(kept);
    cache.put(removed);
    cache.remove(removed);

    expect(removed.closed).toBe(true);
    expect(kept.closed).toBe(false);
    expect(cache.usedBytes).toBe(10);

    cache.clear();
    expect(kept.closed).toBe(true);
    expect(cache.count).toBe(0);
  });
});
