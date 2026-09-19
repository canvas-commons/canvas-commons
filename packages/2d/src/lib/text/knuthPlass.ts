import type {PreparedTextWithSegments} from '@chenglou/pretext';

/**
 * Optimal (Knuth-Plass-style) line breaker over a pretext
 * `PreparedTextWithSegments`. Adapted from
 * https://github.com/chenglou/pretext-demos/blob/main/justification-comparison.js
 *
 * Scores candidate line breaks via a cubic ratio + river/tight/hyphen
 * penalties, then runs dynamic programming to find the cheapest path through
 * the break-point graph.
 */

/**
 * The soft-hyphen character (U+00AD). Invisible in most editors.
 */
export const SOFT_HYPHEN = '­';
const RIVER_THRESHOLD = 1.5;
const INFEASIBLE_SPACE_RATIO = 0.4;
const TIGHT_SPACE_RATIO = 0.65;
/** Same fit tolerance as pretext's greedy pass, so float noise cannot fail a line. */
const LINE_FIT_EPSILON = 0.005;

type BreakCandidate = {
  segIndex: number;
  kind: 'start' | 'space' | 'soft-hyphen' | 'end';
};

type LineStats = {
  wordWidth: number;
  spaceCount: number;
  naturalWidth: number;
  trailingMarker: 'none' | 'soft-hyphen';
};

export type KnuthPlassLine = {
  text: string;
  width: number;
  isLast: boolean;
  /**
   * Exclusive end segment index of this line in the prepared segments,
   * including a terminating hard-break segment.
   */
  endSegmentIndex: number;
};

export type KnuthPlassOptions = {
  normalSpaceWidth: number;
  hyphenWidth: number;
  /**
   * Whether the renderer will justify these lines. Only a justified line may
   * plan spaces shrunk below their normal width.
   */
  justified: boolean;
};

function isSpaceText(text: string): boolean {
  return text.length > 0 && text.trim().length === 0;
}

/** Overflow in pixels past `maxWidth`, then badness among paths that tie. */
type Cost = {
  overflow: number;
  badness: number;
};

/** Whether `a` beats `b`: less overflow, or equal overflow and less badness. */
function isBetter(a: Cost, b: Cost): boolean {
  return a.overflow !== b.overflow
    ? a.overflow < b.overflow
    : a.badness < b.badness;
}

function addCost(a: Cost, b: Cost): Cost {
  return {overflow: a.overflow + b.overflow, badness: a.badness + b.badness};
}

/**
 * Pixels past `maxWidth` as the renderer draws the line: at natural width for
 * the last line and for unjustified text, otherwise with its spaces at the
 * shrink limit.
 */
function lineOverflow(
  stats: LineStats,
  maxWidth: number,
  normalSpaceWidth: number,
  isLast: boolean,
  justified: boolean,
): number {
  const drawnWidth =
    isLast || !justified
      ? stats.naturalWidth
      : stats.wordWidth +
        stats.spaceCount * normalSpaceWidth * INFEASIBLE_SPACE_RATIO;
  const overflow = drawnWidth - maxWidth;
  return overflow > LINE_FIT_EPSILON ? overflow : 0;
}

/** Ranks lines that already fit; never called on an overflowing line. */
function lineBadness(
  stats: LineStats,
  maxWidth: number,
  normalSpaceWidth: number,
): number {
  if (stats.spaceCount <= 0) {
    const slack = maxWidth - stats.wordWidth;
    return slack * slack * 10;
  }

  const justifiedSpace = (maxWidth - stats.wordWidth) / stats.spaceCount;
  const ratio = (justifiedSpace - normalSpaceWidth) / normalSpaceWidth;
  const absRatio = Math.abs(ratio);
  const badness = absRatio * absRatio * absRatio * 1000;

  const riverExcess = justifiedSpace / normalSpaceWidth - RIVER_THRESHOLD;
  const riverPenalty =
    riverExcess > 0 ? 5000 + riverExcess * riverExcess * 10000 : 0;

  const tightThreshold = normalSpaceWidth * TIGHT_SPACE_RATIO;
  const tightPenalty =
    justifiedSpace < tightThreshold
      ? 3000 +
        (tightThreshold - justifiedSpace) *
          (tightThreshold - justifiedSpace) *
          10000
      : 0;

  const hyphenPenalty = stats.trailingMarker === 'soft-hyphen' ? 50 : 0;
  return badness + riverPenalty + tightPenalty + hyphenPenalty;
}

function lineCost(
  stats: LineStats,
  maxWidth: number,
  normalSpaceWidth: number,
  isLast: boolean,
  justified: boolean,
): Cost {
  const overflow = lineOverflow(
    stats,
    maxWidth,
    normalSpaceWidth,
    isLast,
    justified,
  );
  if (overflow > 0 || isLast) {
    // Overflow outranks badness, and the last line is never justified.
    return {overflow, badness: 0};
  }
  return {overflow: 0, badness: lineBadness(stats, maxWidth, normalSpaceWidth)};
}

type SegmentPrefix = {
  wordWidth: Float64Array;
  spaceCount: Int32Array;
};

function buildSegmentPrefix(
  segments: readonly string[],
  widths: readonly number[],
): SegmentPrefix {
  const n = segments.length;
  const wordWidth = new Float64Array(n + 1);
  const spaceCount = new Int32Array(n + 1);
  let runningWidth = 0;
  let runningSpaces = 0;
  for (let i = 0; i < n; i++) {
    const text = segments[i];
    if (text !== SOFT_HYPHEN) {
      if (isSpaceText(text)) {
        runningSpaces++;
      } else {
        runningWidth += widths[i];
      }
    }
    wordWidth[i + 1] = runningWidth;
    spaceCount[i + 1] = runningSpaces;
  }
  return {wordWidth, spaceCount};
}

function getLineStats(
  segments: readonly string[],
  prefix: SegmentPrefix,
  candidates: readonly BreakCandidate[],
  fromCandidate: number,
  toCandidate: number,
  hyphenWidth: number,
  normalSpaceWidth: number,
): LineStats {
  const from = candidates[fromCandidate].segIndex;
  const to = candidates[toCandidate].segIndex;
  const trailingMarker: 'none' | 'soft-hyphen' =
    candidates[toCandidate].kind === 'soft-hyphen' ? 'soft-hyphen' : 'none';

  let wordWidth = prefix.wordWidth[to] - prefix.wordWidth[from];
  let spaceCount = prefix.spaceCount[to] - prefix.spaceCount[from];

  if (to > from && isSpaceText(segments[to - 1])) {
    spaceCount--;
  }

  if (trailingMarker === 'soft-hyphen') {
    wordWidth += hyphenWidth;
  }

  return {
    wordWidth,
    spaceCount,
    naturalWidth: wordWidth + spaceCount * normalSpaceWidth,
    trailingMarker,
  };
}

function buildLineText(
  segments: readonly string[],
  candidates: readonly BreakCandidate[],
  fromCandidate: number,
  toCandidate: number,
): {text: string; trailingMarker: 'none' | 'soft-hyphen'} {
  const from = candidates[fromCandidate].segIndex;
  const to = candidates[toCandidate].segIndex;
  const trailingMarker: 'none' | 'soft-hyphen' =
    candidates[toCandidate].kind === 'soft-hyphen' ? 'soft-hyphen' : 'none';

  let text = '';
  for (let i = from; i < to; i++) {
    const seg = segments[i];
    if (seg === SOFT_HYPHEN) continue;
    text += seg;
  }
  text = text.replace(/\s+$/, '');
  return {text, trailingMarker};
}

export function knuthPlass(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  opts: KnuthPlassOptions,
): KnuthPlassLine[] {
  const segments = prepared.segments;
  const segmentCount = segments.length;
  if (segmentCount === 0) return [];

  // Hard breaks split chunks, so solve each on its own.
  const prefix = buildSegmentPrefix(segments, prepared.widths);
  const lines: KnuthPlassLine[] = [];
  let chunkStart = 0;
  for (let i = 0; i <= segmentCount; i++) {
    const atEnd = i === segmentCount;
    if (!atEnd && segments[i] !== '\n') continue;
    if (i > chunkStart) {
      lines.push(
        ...solveChunk(segments, prefix, chunkStart, i, maxWidth, opts),
      );
      if (!atEnd) {
        lines[lines.length - 1].endSegmentIndex = i + 1;
      }
    } else if (!atEnd) {
      lines.push({text: '', width: 0, isLast: false, endSegmentIndex: i + 1});
    }
    chunkStart = i + 1;
  }
  if (lines.length > 0) {
    lines[lines.length - 1].isLast = true;
  }
  return lines;
}

function solveChunk(
  segments: readonly string[],
  prefix: SegmentPrefix,
  chunkStart: number,
  chunkEnd: number,
  maxWidth: number,
  opts: KnuthPlassOptions,
): KnuthPlassLine[] {
  const candidates: BreakCandidate[] = [{segIndex: chunkStart, kind: 'start'}];
  for (let i = chunkStart; i < chunkEnd; i++) {
    const text = segments[i];
    if (text === SOFT_HYPHEN) {
      if (i + 1 < chunkEnd) {
        candidates.push({segIndex: i + 1, kind: 'soft-hyphen'});
      }
      continue;
    }
    if (isSpaceText(text) && i + 1 < chunkEnd) {
      candidates.push({segIndex: i + 1, kind: 'space'});
    }
  }
  candidates.push({segIndex: chunkEnd, kind: 'end'});

  const count = candidates.length;
  const dp: Cost[] = new Array(count).fill({
    overflow: Infinity,
    badness: Infinity,
  });
  const previous: number[] = new Array(count).fill(-1);
  dp[0] = {overflow: 0, badness: 0};

  for (let to = 1; to < count; to++) {
    const isLast = candidates[to].kind === 'end';
    let spaceBreakInside = false;
    for (let from = to - 1; from >= 0; from--) {
      if (!isFinite(dp[from].overflow)) continue;
      const stats = getLineStats(
        segments,
        prefix,
        candidates,
        from,
        to,
        opts.hyphenWidth,
        opts.normalSpaceWidth,
      );
      const cost = lineCost(
        stats,
        maxWidth,
        opts.normalSpaceWidth,
        isLast,
        opts.justified,
      );
      const total = addCost(dp[from], cost);
      if (isBetter(total, dp[to])) {
        dp[to] = total;
        previous[to] = from;
      }
      // A span drawn this far past the node loses to its own split at an
      // inner space. A split at a soft hyphen adds the hyphen's width, so it
      // proves nothing. The nearest span is scored before this exit, so every
      // candidate stays reachable.
      if (!isLast && spaceBreakInside && cost.overflow > maxWidth) break;
      spaceBreakInside ||= candidates[from].kind === 'space';
    }
  }

  const breakIndices: number[] = [];
  let cur = count - 1;
  while (cur > 0) {
    breakIndices.push(cur);
    cur = previous[cur];
  }
  breakIndices.reverse();

  const lines: KnuthPlassLine[] = [];
  let from = 0;
  for (let i = 0; i < breakIndices.length; i++) {
    const to = breakIndices[i];
    const isChunkEnd = candidates[to].kind === 'end';
    const stats = getLineStats(
      segments,
      prefix,
      candidates,
      from,
      to,
      opts.hyphenWidth,
      opts.normalSpaceWidth,
    );
    const built = buildLineText(segments, candidates, from, to);
    const trailing =
      built.trailingMarker === 'soft-hyphen' && !isChunkEnd ? '-' : '';
    lines.push({
      text: built.text + trailing,
      width: stats.naturalWidth,
      isLast: false,
      endSegmentIndex: candidates[to].segIndex,
    });
    from = to;
  }
  return lines;
}
