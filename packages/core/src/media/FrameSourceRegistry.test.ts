import {describe, expect, it} from 'vitest';
import type {Logger} from '../app/Logger';
import type {CacheableFrame} from './FrameCache';
import {FrameSourceRegistry} from './FrameSourceRegistry';

interface TestFrame extends CacheableFrame {
  closed: boolean;
}

function MakeFrame(sourceKey: string, microsecondTimestamp: number): TestFrame {
  return {
    key: `${sourceKey}:${microsecondTimestamp}`,
    sourceKey,
    microsecondTimestamp,
    closed: false,
    allocationSize: () => 100,
    close() {
      this.closed = true;
    },
  };
}

function MakeRegistry(maxSources: number): FrameSourceRegistry {
  return new FrameSourceRegistry(
    {
      cacheBytes: 1000,
      sourceCacheBytes: 100,
      prefetchSeconds: 0.4,
      maxSources,
    },
    console as unknown as Logger,
  );
}

describe('FrameSourceRegistry', () => {
  it('bounds the number of live sources', () => {
    const registry = MakeRegistry(2);
    registry.get('a', 'a.mp4', {cacheBytes: 100, prefetchSeconds: 0});
    registry.get('b', 'b.mp4', {cacheBytes: 100, prefetchSeconds: 0});
    registry.get('c', 'c.mp4', {cacheBytes: 100, prefetchSeconds: 0});

    expect(registry.sourceCount).toBe(2);
    expect(
      registry.get('b', 'b.mp4', {cacheBytes: 100, prefetchSeconds: 0}),
    ).toBeTruthy();
    expect(
      registry.get('c', 'c.mp4', {cacheBytes: 100, prefetchSeconds: 0}),
    ).toBeTruthy();
    registry.dispose();
  });

  it('drops the frames of an evicted source', () => {
    const registry = MakeRegistry(2);
    const frame = MakeFrame('a', 1000);
    registry.cache.put(frame);

    registry.get('a', 'a.mp4', {cacheBytes: 100, prefetchSeconds: 0});
    registry.get('b', 'b.mp4', {cacheBytes: 100, prefetchSeconds: 0});
    registry.get('c', 'c.mp4', {cacheBytes: 100, prefetchSeconds: 0});

    expect(frame.closed).toBe(true);
    expect(registry.cache.find('a', 1000)).toBeNull();
    registry.dispose();
  });

  it('keeps held frames when a source is dropped', () => {
    const registry = MakeRegistry(1);
    const frame = MakeFrame('a', 1000);
    registry.cache.put(frame);
    registry.cache.hold(frame);

    registry.get('a', 'a.mp4', {cacheBytes: 100, prefetchSeconds: 0});
    registry.get('b', 'b.mp4', {cacheBytes: 100, prefetchSeconds: 0});

    expect(frame.closed).toBe(false);
    registry.cache.release(frame);
    registry.dispose();
  });
});
