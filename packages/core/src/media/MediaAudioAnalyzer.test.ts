import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MediaAudioAnalyzer} from './MediaAudioAnalyzer';

function stubFetchOk(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
}

function stubAudioContext(
  decode: () => Promise<AudioBuffer> | AudioBuffer,
): void {
  vi.stubGlobal(
    'AudioContext',
    class {
      public decodeAudioData = vi.fn(async () => decode());
    },
  );
}

function fakeAudioBuffer(peak = 0.5): AudioBuffer {
  const data = new Float32Array(48000);
  if (peak !== 0) {
    data[0] = peak;
    data[1] = -peak;
  }
  return {
    numberOfChannels: 1,
    sampleRate: 48000,
    duration: 1,
    length: data.length,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe('MediaAudioAnalyzer.hasAudio', () => {
  beforeEach(() => {
    stubFetchOk();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports true when the source has an audible audio track', async () => {
    stubAudioContext(() => fakeAudioBuffer(0.5));
    const analyzer = new MediaAudioAnalyzer();
    expect(await analyzer.hasAudio('with-audio.mp4')).toBe(true);
  });

  it('reports false when the source has no decodable audio track', async () => {
    stubAudioContext(() => {
      throw new Error('no audio');
    });
    const analyzer = new MediaAudioAnalyzer();
    expect(await analyzer.hasAudio('no-audio.mp4')).toBe(false);
  });

  it('reports false for a decodable but silent audio track', async () => {
    stubAudioContext(() => fakeAudioBuffer(0));
    const analyzer = new MediaAudioAnalyzer();
    expect(await analyzer.hasAudio('silent-track.mp4')).toBe(false);
  });

  it('reports false for a near-silent (noise-floor) audio track', async () => {
    stubAudioContext(() => fakeAudioBuffer(0.0002));
    const analyzer = new MediaAudioAnalyzer();
    expect(await analyzer.hasAudio('noise-floor.mp4')).toBe(false);
  });

  it('reports false when the source cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ok: false, status: 404})),
    );
    stubAudioContext(() => fakeAudioBuffer());
    const analyzer = new MediaAudioAnalyzer();
    expect(await analyzer.hasAudio('missing.mp4')).toBe(false);
  });

  it('decodes each source only once across repeated hasAudio calls', async () => {
    const decode = vi.fn(async () => fakeAudioBuffer());
    vi.stubGlobal(
      'AudioContext',
      class {
        public decodeAudioData = decode;
      },
    );
    const analyzer = new MediaAudioAnalyzer();

    await analyzer.hasAudio('clip.mp4');
    await analyzer.hasAudio('clip.mp4');

    expect(decode).toHaveBeenCalledTimes(1);
  });
});
