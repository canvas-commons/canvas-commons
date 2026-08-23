export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function highShelfCoefficients(
  gainDb: number,
  q: number,
  centerFrequency: number,
  sampleRate: number,
): BiquadCoefficients {
  const a = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * centerFrequency) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const sqrtA = Math.sqrt(a);

  const b0 = a * (a + 1 + (a - 1) * cosw0 + 2 * sqrtA * alpha);
  const b1 = -2 * a * (a - 1 + (a + 1) * cosw0);
  const b2 = a * (a + 1 + (a - 1) * cosw0 - 2 * sqrtA * alpha);
  const a0 = a + 1 - (a - 1) * cosw0 + 2 * sqrtA * alpha;
  const a1 = 2 * (a - 1 - (a + 1) * cosw0);
  const a2 = a + 1 - (a - 1) * cosw0 - 2 * sqrtA * alpha;

  return {b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0};
}

function highPassCoefficients(
  q: number,
  centerFrequency: number,
  sampleRate: number,
): BiquadCoefficients {
  const w0 = (2 * Math.PI * centerFrequency) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);

  const b0 = (1 + cosw0) / 2;
  const b1 = -(1 + cosw0);
  const b2 = (1 + cosw0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha;

  return {b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0};
}

function applyBiquad(
  samples: Float32Array,
  coefficients: BiquadCoefficients,
): Float32Array {
  const {b0, b1, b2, a1, a2} = coefficients;
  const output = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return output;
}

/**
 * Apply the two-stage K-weighting pre-filter (ITU-R BS.1770) to a single
 * channel of audio.
 *
 * @remarks
 * Models the acoustic effects of the human head (high shelf) followed by a
 * high-pass filter approximating the equal-loudness contour roll-off at low
 * frequencies.
 */
export function kWeight(
  samples: Float32Array,
  sampleRate: number,
): Float32Array {
  const shelf = highShelfCoefficients(4.0, Math.SQRT1_2, 1500, sampleRate);
  const highPass = highPassCoefficients(0.5, 38, sampleRate);
  return applyBiquad(applyBiquad(samples, shelf), highPass);
}

/** Channel weights per ITU-R BS.1770 (mono/stereo/up to 5 channels). */
const CHANNEL_GAINS = [1.0, 1.0, 1.0, 1.41, 1.41];

const ABSOLUTE_THRESHOLD_LUFS = -70;
const RELATIVE_THRESHOLD_OFFSET_LU = -10;

function meanSquare(samples: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += samples[i] * samples[i];
  }
  return sum / (end - start);
}

function blockLoudnessLufs(weightedPower: number): number {
  return -0.691 + 10 * Math.log10(weightedPower);
}

interface LoudnessBlock {
  /** Per-channel mean square power for this block. */
  power: number[];
  /** K-weighted, channel-summed loudness of this block in LUFS. */
  loudness: number;
}

function computeBlocks(
  channels: Float32Array[],
  sampleRate: number,
  blockSeconds: number,
  stepSeconds: number,
): LoudnessBlock[] {
  if (channels.length === 0 || channels[0].length === 0) {
    return [];
  }

  const weighted = channels.map(channel => kWeight(channel, sampleRate));
  const blockSize = Math.round(blockSeconds * sampleRate);
  const step = Math.round(stepSeconds * sampleRate);
  const totalSamples = weighted[0].length;

  const blocks: LoudnessBlock[] = [];
  for (let start = 0; start + blockSize <= totalSamples; start += step) {
    const end = start + blockSize;
    const power = weighted.map(channel => meanSquare(channel, start, end));
    const weightedSum = power.reduce(
      (sum, p, i) => sum + (CHANNEL_GAINS[i] ?? 1.0) * p,
      0,
    );
    blocks.push({power, loudness: blockLoudnessLufs(weightedSum)});
  }

  return blocks;
}

function gatedAveragePower(
  blocks: LoudnessBlock[],
  channelCount: number,
): number[] {
  if (blocks.length === 0) {
    return new Array(channelCount).fill(0);
  }

  const average = new Array(channelCount).fill(0);
  for (const block of blocks) {
    for (let i = 0; i < channelCount; i++) {
      average[i] += block.power[i];
    }
  }
  return average.map(sum => sum / blocks.length);
}

/**
 * Measure the integrated (whole-clip) loudness of an audio buffer, following
 * the two-stage gating algorithm defined in ITU-R BS.1770.
 *
 * @remarks
 * Supports mono and stereo (and up to 5-channel) inputs. `channels` must all
 * have the same length. Uses 400ms blocks with 75% overlap as specified.
 *
 * @param channels - Per-channel PCM samples in the range -1 to 1.
 * @param sampleRate - Sample rate of `channels` in Hz.
 * @returns Integrated loudness in LUFS, or `-Infinity` for silence/empty input.
 */
export function measureIntegratedLufs(
  channels: Float32Array[],
  sampleRate: number,
): number {
  const blocks = computeBlocks(channels, sampleRate, 0.4, 0.1);
  if (blocks.length === 0) {
    return -Infinity;
  }

  const absoluteGated = blocks.filter(
    block => block.loudness >= ABSOLUTE_THRESHOLD_LUFS,
  );
  if (absoluteGated.length === 0) {
    return -Infinity;
  }

  const absoluteAverage = gatedAveragePower(absoluteGated, channels.length);
  const relativeThreshold =
    blockLoudnessLufs(
      absoluteAverage.reduce(
        (sum, p, i) => sum + (CHANNEL_GAINS[i] ?? 1.0) * p,
        0,
      ),
    ) + RELATIVE_THRESHOLD_OFFSET_LU;

  const relativeGated = absoluteGated.filter(
    block => block.loudness > relativeThreshold,
  );
  if (relativeGated.length === 0) {
    return -Infinity;
  }

  const relativeAverage = gatedAveragePower(relativeGated, channels.length);
  return blockLoudnessLufs(
    relativeAverage.reduce(
      (sum, p, i) => sum + (CHANNEL_GAINS[i] ?? 1.0) * p,
      0,
    ),
  );
}

/**
 * Measure a series of short-term loudness values across an audio buffer.
 *
 * @remarks
 * Uses 3s windows stepped by 1s, discarding windows below the absolute
 * silence threshold. Used to find a "loud part" reference point for
 * dynamics-preserving loudness leveling, as opposed to
 * {@link measureIntegratedLufs} which averages the whole clip.
 */
export function measureShortTermLufsSeries(
  channels: Float32Array[],
  sampleRate: number,
): number[] {
  return computeBlocks(channels, sampleRate, 3, 1)
    .map(block => block.loudness)
    .filter(
      loudness => loudness >= ABSOLUTE_THRESHOLD_LUFS && loudness > -Infinity,
    );
}

/** Linear-interpolated percentile (0-100) of a numeric array. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return -Infinity;
  }
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0];
  }
  const rank = (clampPercentile(p) / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function clampPercentile(p: number): number {
  return Math.min(100, Math.max(0, p));
}

/**
 * Measure a "loud part" reference loudness, used as the basis for
 * dynamics-preserving loudness leveling instead of the integrated average.
 *
 * @param channels - Per-channel PCM samples in the range -1 to 1.
 * @param sampleRate - Sample rate of `channels` in Hz.
 * @param referencePercentile - Percentile of the short-term loudness series
 * to use as the reference point.
 */
export function measureLoudPartLufs(
  channels: Float32Array[],
  sampleRate: number,
  referencePercentile = 95,
): number {
  const series = measureShortTermLufsSeries(channels, sampleRate);
  if (series.length === 0) {
    return measureIntegratedLufs(channels, sampleRate);
  }
  return percentile(series, referencePercentile);
}

/**
 * Compute the dB gain to apply so that `measuredLufs` reaches `targetLufs`.
 *
 * @remarks
 * The result is a standard amplitude-domain dB value (matching
 * {@link Sound.gain}), directly usable by the existing gain pipeline in the
 * live preview and both exporters.
 */
export function computeNormalizeGainDb(
  measuredLufs: number,
  targetLufs: number,
): number {
  if (!Number.isFinite(measuredLufs)) {
    return 0;
  }
  return targetLufs - measuredLufs;
}
