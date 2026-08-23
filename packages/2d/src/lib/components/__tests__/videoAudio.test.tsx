import {
  Sound,
  useMediaAudioAnalyzer,
  useScene,
  waitFor,
} from '@canvas-commons/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Video} from '../Video';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

class TestVideo extends Video {
  public element(): HTMLVideoElement {
    return this.video();
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
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

  it('applies an async normalize gain once measured', async () => {
    const analyzer = useMediaAudioAnalyzer();
    vi.spyOn(analyzer, 'hasAudio').mockResolvedValue(true);
    const spy = vi.spyOn(analyzer, 'computeNormalizeGain').mockResolvedValue(6);

    let clip: Sound;

    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" normalize={-14} />) as TestVideo;
      makeReady(video, 10);
      video.play();
      [clip] = useScene().sounds.getSounds() as Sound[];
    })();

    expect(clip!.gain).toBe(0);
    await flushMicrotasks();

    expect(spy).toHaveBeenCalledWith('clip.mp4', -14, 'integrated');
    expect(clip!.gain).toBe(6);
  });

  it('prefers levelTo over normalize and uses the loudPart mode', async () => {
    const analyzer = useMediaAudioAnalyzer();
    vi.spyOn(analyzer, 'hasAudio').mockResolvedValue(true);
    const spy = vi.spyOn(analyzer, 'computeNormalizeGain').mockResolvedValue(3);

    generatorTest(function* () {
      const video = (
        <TestVideo src="clip.mp4" normalize={-14} levelTo={-16} />
      ) as TestVideo;
      makeReady(video, 10);
      video.play();
    })();

    await flushMicrotasks();

    expect(spy).toHaveBeenCalledWith('clip.mp4', -16, 'loudPart');
  });

  it('discards a stale normalize measurement if the clip changed in the meantime', async () => {
    const analyzer = useMediaAudioAnalyzer();
    vi.spyOn(analyzer, 'hasAudio').mockResolvedValue(true);
    let resolveFirst!: (value: number) => void;
    const spy = vi
      .spyOn(analyzer, 'computeNormalizeGain')
      .mockImplementationOnce(
        () => new Promise(resolve => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce(2);

    let firstClip: Sound;

    generatorTest(function* () {
      const video = (<TestVideo src="clip.mp4" normalize={-14} />) as TestVideo;
      makeReady(video, 10);

      video.play();
      [firstClip] = useScene().sounds.getSounds() as Sound[];
      video.pause();
      video.play();
    })();

    await flushMicrotasks();
    resolveFirst(99);
    await flushMicrotasks();

    // the stale measurement must not overwrite the now-unrelated first clip
    expect(firstClip!.gain).toBe(0);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
