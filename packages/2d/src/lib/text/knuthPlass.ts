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

const SOFT_HYPHEN = '­';
const HUGE_BADNESS = 1e8;
const RIVER_THRESHOLD = 1.5;
const INFEASIBLE_SPACE_RATIO = 0.4;
const TIGHT_SPACE_RATIO = 0.65;

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
};

export type KnuthPlassOptions = {
  normalSpaceWidth: number;
  hyphenWidth: number;
};

function isSpaceText(text: string): boolean {
  return text.length > 0 && text.trim().length === 0;
}

function lineBadness(
  stats: LineStats,
  maxWidth: number,
  normalSpaceWidth: number,
  isLast: boolean,
): number {
  if (isLast) {
    if (stats.wordWidth > maxWidth) return HUGE_BADNESS;
    return 0;
  }

  if (stats.spaceCount <= 0) {
    const slack = maxWidth - stats.wordWidth;
    if (slack < 0) return HUGE_BADNESS;
    return slack * slack * 10;
  }

  const justifiedSpace = (maxWidth - stats.wordWidth) / stats.spaceCount;
  if (justifiedSpace < 0) return HUGE_BADNESS;
  if (justifiedSpace < normalSpaceWidth * INFEASIBLE_SPACE_RATIO) {
    return HUGE_BADNESS;
  }

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
  const widths = prepared.widths;
  const segmentCount = segments.length;
  if (segmentCount === 0) return [];

  const candidates: BreakCandidate[] = [{segIndex: 0, kind: 'start'}];
  for (let i = 0; i < segmentCount; i++) {
    const text = segments[i];
    if (text === SOFT_HYPHEN) {
      if (i + 1 < segmentCount) {
        candidates.push({segIndex: i + 1, kind: 'soft-hyphen'});
      }
      continue;
    }
    if (isSpaceText(text) && i + 1 < segmentCount) {
      candidates.push({segIndex: i + 1, kind: 'space'});
    }
  }
  candidates.push({segIndex: segmentCount, kind: 'end'});

  const prefix = buildSegmentPrefix(segments, widths);
  const count = candidates.length;
  const dp: number[] = new Array(count).fill(Infinity);
  const previous: number[] = new Array(count).fill(-1);
  dp[0] = 0;

  for (let to = 1; to < count; to++) {
    const isLast = candidates[to].kind === 'end';
    for (let from = to - 1; from >= 0; from--) {
      if (!isFinite(dp[from])) continue;
      const stats = getLineStats(
        segments,
        prefix,
        candidates,
        from,
        to,
        opts.hyphenWidth,
        opts.normalSpaceWidth,
      );
      // The end candidate must always be reachable: skipping it on width
      // grounds would orphan the trailing tokens during reconstruction.
      if (!isLast && stats.naturalWidth > maxWidth * 2) break;
      const total =
        dp[from] + lineBadness(stats, maxWidth, opts.normalSpaceWidth, isLast);
      if (total < dp[to]) {
        dp[to] = total;
        previous[to] = from;
      }
    }
  }

  if (count > 1 && previous[count - 1] === -1) {
    previous[count - 1] = count - 2;
    dp[count - 1] = isFinite(dp[count - 2]) ? dp[count - 2] : 0;
  }

  const breakIndices: number[] = [];
  let cur = count - 1;
  while (cur > 0) {
    if (previous[cur] === -1) {
      cur--;
      continue;
    }
    breakIndices.push(cur);
    cur = previous[cur];
  }
  breakIndices.reverse();

  const lines: KnuthPlassLine[] = [];
  let from = 0;
  for (let i = 0; i < breakIndices.length; i++) {
    const to = breakIndices[i];
    const isLast = candidates[to].kind === 'end';
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
      built.trailingMarker === 'soft-hyphen' && !isLast ? '-' : '';
    lines.push({
      text: built.text + trailing,
      width: stats.naturalWidth,
      isLast,
    });
    from = to;
  }
  return lines;
}
