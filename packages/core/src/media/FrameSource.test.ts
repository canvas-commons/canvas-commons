import {describe, expect, test} from 'vitest';
import type {Logger} from '../app/Logger';
import type {CacheableFrame} from './FrameCache';
import {FrameCache} from './FrameCache';
import type {CachedFrame} from './FrameSource';
import {FrameSource} from './FrameSource';

function MakeSource(cacheBytes = 1000, timeoutMs = 100): FrameSource {
  const cache = new FrameCache<CacheableFrame>(cacheBytes);
  const settings = {cache, logger: console as unknown as Logger, timeoutMs};
  const source = new FrameSource('missing.mp4', settings);
  return source;
}

function MakeCachedFrame(seconds: number): CachedFrame {
  return {
    key: `missing.mp4:${Math.round(seconds * 1e6)}`,
    sourceKey: 'missing.mp4',
    microsecondTimestamp: Math.round(seconds * 1e6),
    image: {} as ImageBitmap,
    seconds,
    allocationSize: () => 10,
    close: () => {},
  } as unknown as CachedFrame;
}

describe('FrameSource', () => {
  test('reports a frame as cached only for the requested timestamp', () => {
    const source = MakeSource();
    source.cache.put(MakeCachedFrame(1));
    source.cache.put(MakeCachedFrame(2));

    expect(source.isCached(1)).toBe(true);
    expect(source.isCached(2)).toBe(true);
    expect(source.isCached(1.5)).toBe(false);
  });

  test('resolves a cached frame without decoding', async () => {
    const source = MakeSource();
    const frame = MakeCachedFrame(1);
    source.cache.put(frame);

    await expect(source.request(1)).resolves.toBe(frame);
    expect(source.pendingCount).toBe(0);
    source.dispose();
  });

  test('resolves null instead of hanging when the media cannot be decoded', async () => {
    const source = MakeSource(1000, 50);

    await expect(source.request(1)).resolves.toBeNull();
    source.dispose();
  });

  test('shares one pending decode for the same timestamp', () => {
    const source = MakeSource(1000, 50);
    void source.request(1);
    void source.request(1);

    expect(source.pendingCount).toBe(1);
    source.dispose();
  });

  test('resolves outstanding requests when disposed', async () => {
    const source = MakeSource(1000, 1000);
    const pending = source.request(1);
    source.dispose();

    await expect(pending).resolves.toBeNull();
  });
});
