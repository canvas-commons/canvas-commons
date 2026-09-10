import {DependencyContext, useScene, waitFor} from '@canvas-commons/core';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Video} from '../Video';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

class TestVideo extends Video {
  public element(): HTMLVideoElement {
    return this.video();
  }

  public duration(): number {
    return this.getDuration();
  }

  public syncPlayback(): HTMLVideoElement {
    // The editor consumes the element's play() promise during its render loop;
    // suppress collection here so directly invoking the sync in tests does not
    // leak that resolved-but-unconsumed promise across cases.
    return DependencyContext.collectingPromisesSuppressed(() =>
      this.fastSeekedVideo(),
    );
  }
}

function makeReady(video: TestVideo, duration: number): HTMLVideoElement {
  const element = video.element();
  Object.defineProperty(element, 'duration', {
    value: duration,
    configurable: true,
  });
  return element;
}

describe('Video audio', () => {
  mockScene2D();

  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom's HTMLMediaElement never becomes ready on its own; report ready
    // immediately so `Video.video()` never registers an async `canplay`
    // wait (which nothing in these tests would ever consume/drain).
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      4,
    );
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('always silences the underlying <video> element', () => {
    const video = (<TestVideo src="clip.mp4" volume={1} />) as TestVideo;
    const element = video.element();
    expect(element.muted).toBe(true);
    expect(element.volume).toBe(0);
  });

  it(
    'registers a sound clip while playing',
    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" />) as TestVideo;
      makeReady(video, 10);

      video.play();
      expect(useScene().sounds.getSounds()).toHaveLength(1);
      const [clip] = useScene().sounds.getSounds();
      expect(clip.audio).toBe('clip.mp4');
      expect(clip.start).toBe(0);
      expect(clip.end).toBeUndefined();
      expect(clip.sourceKey).toBe(video.key);

      yield* waitFor(2);
      video.pause();

      const [finalized] = useScene().sounds.getSounds();
      expect(finalized.end).toBeCloseTo(2, 1);
    }),
  );

  it(
    'applies volume as gain in dB',
    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" volume={0.5} />) as TestVideo;
      makeReady(video, 10);

      video.play();
      const [clip] = useScene().sounds.getSounds();
      expect(clip.gain).toBeCloseTo(-6.02, 1);
      video.pause();
    }),
  );

  it(
    'registers no audio clip when muted (volume 0)',
    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" volume={0} />) as TestVideo;
      makeReady(video, 10);

      video.play();
      yield* waitFor(1);
      expect(useScene().sounds.getSounds()).toHaveLength(0);
      video.pause();
    }),
  );

  it(
    'discards a clip that ends up covering no duration',
    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" />) as TestVideo;
      makeReady(video, 10);

      video.play();
      expect(useScene().sounds.getSounds()).toHaveLength(1);
      video.pause();
      expect(useScene().sounds.getSounds()).toHaveLength(0);
    }),
  );

  it(
    'finalizes its in-progress clip on dispose',
    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" />) as TestVideo;
      makeReady(video, 10);

      video.play();
      yield* waitFor(1);
      expect(useScene().sounds.getSounds()).toHaveLength(1);

      video.dispose();
      const [clip] = useScene().sounds.getSounds();
      expect(clip.end).toBeCloseTo(1, 1);
    }),
  );

  it(
    'discards its clip on dispose if it never accrued duration',
    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" />) as TestVideo;
      makeReady(video, 10);

      video.play();
      expect(useScene().sounds.getSounds()).toHaveLength(1);

      video.dispose();
      expect(useScene().sounds.getSounds()).toHaveLength(0);
    }),
  );

  it(
    'finalizes a looping clip with a finite end when the duration is unknown',
    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" loop />) as TestVideo;
      // Deliberately leave the element duration as NaN (never `makeReady`),
      // mirroring a pooled element that has been torn down. Looping used to
      // take the modulo against NaN, storing NaN as the clip's `end`.
      video.play();
      yield* waitFor(1);
      expect(useScene().sounds.getSounds()).toHaveLength(1);

      video.dispose();
      const [clip] = useScene().sounds.getSounds();
      expect(clip.end).toBeDefined();
      expect(Number.isFinite(clip.end)).toBe(true);
      expect(clip.end).toBeCloseTo(1, 1);
    }),
  );

  it(
    'keeps the current time finite for a looping video without a duration',
    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" loop />) as TestVideo;
      video.play();
      yield* waitFor(2);
      expect(Number.isFinite(video.getCurrentTime())).toBe(true);
      video.pause();
    }),
  );

  it(
    'finalizes the previous clip and starts a new one on seek while playing',
    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" />) as TestVideo;
      makeReady(video, 10);

      video.play();
      yield* waitFor(1);
      video.seek(5);

      const sounds = useScene().sounds.getSounds();
      expect(sounds).toHaveLength(2);
      expect(sounds[0].start).toBe(0);
      expect(sounds[0].end).toBeCloseTo(1, 1);
      expect(sounds[1].start).toBeCloseTo(5, 1);
      video.pause();
    }),
  );
});

describe('Video playback sync', () => {
  mockScene2D();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      4,
    );
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    // jsdom never dispatches `seeked`, so a seek that reports `seeking` would
    // register a promise that nothing resolves and leaks across tests.
    vi.spyOn(HTMLMediaElement.prototype, 'seeking', 'get').mockReturnValue(
      false,
    );
  });

  function trackCurrentTime(element: HTMLVideoElement): number[] {
    const history: number[] = [];
    let value = 0;
    Object.defineProperty(element, 'currentTime', {
      configurable: true,
      get: () => value,
      set: (next: number) => {
        value = next;
        history.push(next);
      },
    });
    return history;
  }

  it(
    'does not seek the element every frame while playing',
    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" />) as TestVideo;
      const element = makeReady(video, 10);
      const history = trackCurrentTime(element);

      // A real element advances its own currentTime while playing; emulate that
      // so it stays in sync and never trips the large-drift correction.
      video.play();
      for (let i = 0; i < 30; i++) {
        (element as unknown as {currentTime: number}).currentTime =
          video.getCurrentTime();
        history.length = 0;
        yield* waitFor(1 / 30);
        video.syncPlayback();
      }
      video.pause();

      // Seeking a playing element every frame leaves it perpetually mid-seek,
      // so `drawImage` samples blank frames and the video blinks. While it
      // tracks the animation clock we must not issue any per-frame seek.
      expect(history.length).toBe(0);
    }),
  );

  it(
    'corrects the element only when it drifts far from the animation clock',
    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" />) as TestVideo;
      const element = makeReady(video, 10);

      video.play();
      yield* waitFor(1 / 30);

      // Element sitting within tolerance: no correction.
      (element as unknown as {currentTime: number}).currentTime =
        video.getCurrentTime();
      const history = trackCurrentTime(element);
      video.syncPlayback();
      expect(history.length).toBe(0);

      // Element drifted far ahead (editor lagged): a single correction fires.
      (element as unknown as {currentTime: number}).currentTime =
        video.getCurrentTime() + 1;
      history.length = 0;
      yield* waitFor(1 / 30);
      video.syncPlayback();
      expect(history.length).toBeGreaterThan(0);

      video.pause();
    }),
  );
});

describe('Video CORS', () => {
  mockScene2D();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    import.meta.env.VITE_MC_PROXY_ENABLED = undefined;
    import.meta.env.VITE_MC_PROXY_ALLOW_LIST = undefined;
  });

  const elementOf = (video: TestVideo): HTMLVideoElement =>
    DependencyContext.collectingPromisesSuppressed(() => video.element());

  it('requests the element anonymously so the export canvas is not tainted', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      4,
    );
    const video = (<TestVideo src="clip.mp4" />) as TestVideo;
    expect(elementOf(video).crossOrigin).toBe('anonymous');
  });

  it('routes a remote src through the cors proxy when enabled', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      4,
    );
    import.meta.env.VITE_MC_PROXY_ENABLED = 'true';
    import.meta.env.VITE_MC_PROXY_ALLOW_LIST = JSON.stringify([]);
    const remote = 'https://i.imgflip.com/5utid6.mp4';
    const video = (<TestVideo src={remote} />) as TestVideo;
    expect(elementOf(video).getAttribute('src')).toContain(
      '/cors-proxy/' + encodeURIComponent(remote),
    );
  });

  it('leaves a local src same-origin (no proxy)', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      4,
    );
    import.meta.env.VITE_MC_PROXY_ENABLED = 'true';
    import.meta.env.VITE_MC_PROXY_ALLOW_LIST = JSON.stringify([]);
    const video = (<TestVideo src="clip.mp4" />) as TestVideo;
    expect(elementOf(video).getAttribute('src')).not.toContain('/cors-proxy/');
  });
});

describe('Video.getDuration', () => {
  mockScene2D();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('returns 0 instead of NaN before metadata loads', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      0,
    );
    const video = (<TestVideo src="clip.mp4" />) as TestVideo;

    // Duration is NaN until the element reports metadata; getDuration must not
    // leak that NaN (which would corrupt `waitFor`/timeline). Suppress promise
    // collection so the jsdom element's never-resolving readiness listeners do
    // not leak into other tests.
    let duration = NaN;
    DependencyContext.collectingPromisesSuppressed(() => {
      duration = video.duration();
    });
    expect(duration).toBe(0);
  });

  it('returns the real duration once metadata is available', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      4,
    );
    const video = (<TestVideo src="clip.mp4" />) as TestVideo;
    const element = video.element();
    Object.defineProperty(element, 'duration', {
      value: 12.5,
      configurable: true,
    });

    let duration = NaN;
    DependencyContext.collectingPromisesSuppressed(() => {
      duration = video.duration();
    });
    expect(duration).toBe(12.5);
  });

  it('reuses a previously resolved duration when the element is not ready', () => {
    const ready = vi
      .spyOn(HTMLMediaElement.prototype, 'readyState', 'get')
      .mockReturnValue(4);
    const video = (<TestVideo src="cached-clip.mp4" />) as TestVideo;
    const element = video.element();
    Object.defineProperty(element, 'duration', {
      value: 42,
      configurable: true,
    });

    let first = NaN;
    DependencyContext.collectingPromisesSuppressed(() => {
      first = video.duration();
    });
    expect(first).toBe(42);

    // The element becomes not-ready again (mirroring a torn-down/reloading
    // pooled element during a later recalculation). A fresh node for the same
    // source must still report the cached duration instead of collapsing to 0.
    ready.mockReturnValue(0);
    const other = (<TestVideo src="cached-clip.mp4" />) as TestVideo;
    let second = NaN;
    DependencyContext.collectingPromisesSuppressed(() => {
      second = other.duration();
    });
    expect(second).toBe(42);
  });

  it('caches the duration once metadata loads for a not-ready element', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      0,
    );
    const video = (<TestVideo src="late-clip.mp4" />) as TestVideo;
    const element = video.element();
    Object.defineProperty(element, 'duration', {
      value: 99,
      configurable: true,
    });

    let first = NaN;
    DependencyContext.collectingPromisesSuppressed(() => {
      first = video.duration();
    });
    // Not ready yet: reports 0 and registers a metadata listener.
    expect(first).toBe(0);

    // Metadata arrives; the listener records the duration in the cache even
    // though the element is still reported as not-ready.
    element.dispatchEvent(new Event('loadedmetadata'));

    const other = (<TestVideo src="late-clip.mp4" />) as TestVideo;
    let second = NaN;
    DependencyContext.collectingPromisesSuppressed(() => {
      second = other.duration();
    });
    expect(second).toBe(99);
  });
});
