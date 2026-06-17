import type {Logger, Sound} from '@canvas-commons/core';
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
  /** Surfaces decode failures in the editor log. */
  logger: Logger;
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
 * browser.
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
  // The master track mixes in last, at playback rate 1.
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

  const urls = new Set(entries.map(entry => entry.audio));
  const buffers = new Map(
    await Promise.all(
      [...urls].map(
        async url => [url, await decode(ctx, url, options.logger)] as const,
      ),
    ),
  );

  let scheduled = 0;
  for (const entry of entries) {
    const buffer = buffers.get(entry.audio);
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
  // Summing every source at the destination mixes them without normalization.
  return ctx.startRendering();
}

async function decode(
  ctx: BaseAudioContext,
  url: string,
  logger: Logger,
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn(
        `WebCodecs: could not fetch audio "${url}" (${response.status}).`,
      );
      return null;
    }
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch (error) {
    logger.warn({
      message: `WebCodecs: could not decode audio "${url}".`,
      remarks: String(error),
    });
    return null;
  }
}
