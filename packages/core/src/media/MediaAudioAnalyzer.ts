import {useLogger, viaProxy} from '../utils';

interface DecodedAudio {
  channels: Float32Array[];
  sampleRate: number;
  peakAmplitude: number;
}

interface CacheEntry {
  decoded: Promise<DecodedAudio | null>;
}

/**
 * Peak amplitude below which an audio track is treated as effectively silent
 * (no audible signal). Chosen well above typical dither/noise floors (~-90 dB)
 * but below any real content, so muxed-in silent audio tracks are ignored.
 */
const SILENCE_PEAK_THRESHOLD = 0.001;

/**
 * Decodes media audio sources and reports whether they carry audible audio,
 * caching results by source URL so repeated timeline recalculations of the
 * same `Video` clip don't re-fetch/re-decode the file.
 */
export class MediaAudioAnalyzer {
  private readonly cache = new Map<string, CacheEntry>();
  private context: AudioContext | null = null;

  public constructor() {
    if (import.meta.hot) {
      import.meta.hot.on(
        'canvas-commons:assets',
        ({urls}: {urls: string[]}) => {
          for (const url of urls) {
            this.cache.delete(url);
          }
        },
      );
    }
  }

  private entryFor(source: string): CacheEntry {
    let entry = this.cache.get(source);
    if (!entry) {
      entry = {decoded: this.decode(source)};
      this.cache.set(source, entry);
    }
    return entry;
  }

  /**
   * Determine whether a source has an audible audio track.
   *
   * @remarks
   * Returns `false` both when the source has no decodable audio track (e.g. a
   * video encoded without an audio stream) and when the track carries no
   * audible signal (e.g. a muxed-in silent audio stream), since neither
   * should produce a waveform in the timeline.
   *
   * @param source - URL of the audio/video file to inspect.
   */
  public async hasAudio(source: string): Promise<boolean> {
    const decoded = await this.entryFor(source).decoded;
    return decoded !== null && decoded.peakAmplitude >= SILENCE_PEAK_THRESHOLD;
  }

  private getContext(): AudioContext {
    this.context ??= new AudioContext();
    return this.context;
  }

  private async decode(source: string): Promise<DecodedAudio | null> {
    let response: Response;
    try {
      response = await fetch(viaProxy(source));
    } catch (e: any) {
      useLogger().warn({
        message: `Could not fetch audio for analysis: "${source}".`,
        remarks: String(e),
      });
      return null;
    }
    if (!response.ok) {
      useLogger().warn(
        `Could not fetch audio for analysis: "${source}" (${response.status}).`,
      );
      return null;
    }

    const buffer = await response.arrayBuffer();
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await this.getContext().decodeAudioData(buffer);
    } catch {
      // No decodable audio track (e.g. a video with no audio stream).
      return null;
    }

    const channels: Float32Array[] = [];
    let peakAmplitude = 0;
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      const channel = audioBuffer.getChannelData(i);
      channels.push(channel);
      for (let s = 0; s < channel.length; s++) {
        const magnitude = Math.abs(channel[s]);
        if (magnitude > peakAmplitude) {
          peakAmplitude = magnitude;
        }
      }
    }

    return {channels, sampleRate: audioBuffer.sampleRate, peakAmplitude};
  }
}

let SharedAnalyzer: MediaAudioAnalyzer | null = null;

/**
 * Get the shared {@link MediaAudioAnalyzer} instance.
 *
 * @remarks
 * Shared across the whole app so the decode cache is reused between e.g.
 * `Video` nodes and any UI that inspects a clip's audio.
 */
export function useMediaAudioAnalyzer(): MediaAudioAnalyzer {
  SharedAnalyzer ??= new MediaAudioAnalyzer();
  return SharedAnalyzer;
}
