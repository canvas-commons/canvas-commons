import type {Sound} from '@canvas-commons/core';
import {
  dbToGain,
  playDuration,
  sourceOffset,
  startWhen,
  totalLengthSamples,
} from './mixMath';

export interface MixOptions {
  /** The project's master audio track URL, or `null`. */
  master: string | null;
  /** Offset (seconds) of the master track relative to the render range start. */
  masterOffset: number;
  /** Per-scene sounds collected by the renderer. */
  sounds: Sound[];
  /** Render length in frames. */
  durationFrames: number;
  fps: number;
  sampleRate: number;
  channels: number;
}

interface MixEntry {
  audio: string;
  offset: number;
  realPlaybackRate: number;
  start?: number;
  end?: number;
  gain?: number;
}

/**
 * Render the project's audio to a single {@link AudioBuffer} entirely in the
 * browser, mirroring the ffmpeg exporter's filtergraph so the mix is identical.
 * See the package `AGENTS.md` for the filter-by-filter parity table.
 *
 * @returns the mixed buffer, or `null` if there is nothing to mix.
 */
export async function mixProjectAudio(
  options: MixOptions,
): Promise<AudioBuffer | null> {
  const entries: MixEntry[] = options.sounds.map(sound => ({
    audio: sound.audio,
    offset: sound.offset,
    realPlaybackRate: sound.realPlaybackRate,
    start: sound.start,
    end: sound.end,
    gain: sound.gain,
  }));
  // ffmpeg appends the master track last, at playback rate 1.
  if (options.master) {
    entries.push({
      audio: options.master,
      offset: options.masterOffset,
      realPlaybackRate: 1,
    });
  }
  if (entries.length === 0) {
    return null;
  }

  const length = totalLengthSamples(
    options.durationFrames,
    options.fps,
    options.sampleRate,
  );
  const ctx = new OfflineAudioContext(
    options.channels,
    length,
    options.sampleRate,
  );

  // Decode each distinct file once.
  const cache = new Map<string, Promise<AudioBuffer | null>>();
  const load = (url: string) => {
    let pending = cache.get(url);
    if (!pending) {
      pending = decode(ctx, url);
      cache.set(url, pending);
    }
    return pending;
  };
  const buffers = await Promise.all(entries.map(entry => load(entry.audio)));

  let scheduled = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const buffer = buffers[i];
    if (!buffer) {
      continue;
    }

    const srcOffset = sourceOffset(
      entry.start,
      entry.offset,
      entry.realPlaybackRate,
    );
    if (srcOffset >= buffer.duration) {
      continue;
    }
    const duration = playDuration(entry.end, srcOffset, buffer.duration);
    if (duration <= 0) {
      continue;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // asetrate + aresample: change speed and pitch together.
    source.playbackRate.value = entry.realPlaybackRate;

    if (entry.gain) {
      const gain = ctx.createGain();
      gain.gain.value = dbToGain(entry.gain);
      source.connect(gain).connect(ctx.destination);
    } else {
      source.connect(ctx.destination);
    }

    source.start(startWhen(entry.offset), srcOffset, duration);
    scheduled++;
  }

  if (scheduled === 0) {
    return null;
  }
  // Summing at the destination is the `amix` (normalize=0) equivalent.
  return ctx.startRendering();
}

async function decode(
  ctx: BaseAudioContext,
  url: string,
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(
        `[canvas-commons/webcodecs] could not fetch audio "${url}" (${response.status})`,
      );
      return null;
    }
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch (error) {
    console.warn(
      `[canvas-commons/webcodecs] could not decode audio "${url}":`,
      error,
    );
    return null;
  }
}
