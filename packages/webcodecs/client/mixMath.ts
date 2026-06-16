/** Decibels to a linear amplitude factor. */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Seconds to seek into the source before playback.
 *
 * @remarks
 * For a negative offset (the sound started before the render window) skip
 * `|offset| * realPlaybackRate` source-seconds so output time 0 lines up.
 */
export function sourceOffset(
  start: number | undefined,
  offset: number,
  realPlaybackRate: number,
): number {
  let trimmed = start ?? 0;
  if (offset < 0) {
    trimmed -= offset * realPlaybackRate;
  }
  return trimmed;
}

/** Output start time in seconds; negative offsets start at 0. */
export function startWhen(offset: number): number {
  return offset > 0 ? offset : 0;
}

/**
 * Source-seconds to play. `end` is in source time; `srcOffset` already folds in
 * the negative-offset seek. Never negative.
 */
export function playDuration(
  end: number | undefined,
  srcOffset: number,
  bufferDuration: number,
): number {
  const limit =
    end !== undefined ? end - srcOffset : bufferDuration - srcOffset;
  return Math.max(0, limit);
}

/** Total mixed length in samples, capped to the video duration. */
export function totalLengthSamples(
  durationFrames: number,
  fps: number,
  sampleRate: number,
): number {
  return Math.max(1, Math.ceil((durationFrames / fps) * sampleRate));
}
