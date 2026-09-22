/**
 * The optimal break pass: Knuth-Plass over paragraph items.
 *
 * Every width it scores is the width the line paints, read from the one
 * measure the greedy pass also reads, so no line it plans is drawn wider than
 * it was planned. Glue is rigid unless the renderer will justify the line.
 */
import type {
  BreakConstraints,
  BrokenLine,
  BrokenParagraph,
  OverflowWrapMode,
} from './breakParagraph';
import {breakParagraph, endsChunkOnHardBreak} from './breakParagraph';
import type {ParagraphVerticalMetrics} from './lineMetrics';
import {lineBoxHeight} from './lineMetrics';
import type {LineSpan} from './lineSpan';
import {
  isJustificationGlue,
  lineSpanItemRange,
  measureLineSpan,
  measureLineSpanFit,
  measureLineSpansFrom,
  TIGHTEST_GLUE_RATIO,
} from './lineSpan';
import type {
  ParagraphChunk,
  ParagraphCursor,
  ParagraphItems,
} from './paragraphItems';
import {getEngineProfile} from './pretext-derived/engineProfile';
import {
  endsLineLegally,
  internalBreakGraphemes,
  isDiscretionaryLineEnd,
} from './pretext-derived/lineBreak';

const TIGHT_GLUE_RATIO = 0.65;
const RIVER_THRESHOLD = 1.5;
const HYPHEN_PENALTY = 50;

export type OptimalBreakConstraints = {
  /** Width of the content box; no finite width means one line per chunk. */
  readonly maxWidth: number;
  readonly textWrap: boolean;
  readonly overflowWrap: OverflowWrapMode;
  /** True when the renderer justifies every line but the last of a chunk. */
  readonly justify: boolean;
  readonly vertical: ParagraphVerticalMetrics;
};

/** Pixels a line passes the box, then how well the lines that fit are spaced. */
export type LineCost = {
  readonly overflow: number;
  readonly badness: number;
};

/**
 * One place a line of a chunk may stop: an item boundary the break graph
 * offers, or a break an item offers strictly inside itself, which is the stop
 * the greedy walk takes under `internalBreaks`. Only an emergency break splits
 * an item elsewhere, and that break belongs to the greedy pass.
 */
export type BreakCandidate = {
  /** Cursor a line that stops here ends at. */
  readonly end: ParagraphCursor;
  /** Cursor the following line starts at. */
  readonly next: ParagraphCursor;
  /** True when the candidate paints a hyphen. */
  readonly hyphenated: boolean;
};

const ZERO: LineCost = {overflow: 0, badness: 0};

function before(a: ParagraphCursor, b: ParagraphCursor): boolean {
  return (
    a.segmentIndex < b.segmentIndex ||
    (a.segmentIndex === b.segmentIndex && a.graphemeIndex < b.graphemeIndex)
  );
}

/** First item of a line that opens at `segmentIndex`. */
function skipLineStart(
  items: ParagraphItems,
  segmentIndex: number,
  end: number,
): number {
  let index = segmentIndex;
  while (index < end) {
    const kind = items.kinds[index];
    if (
      kind !== 'space' &&
      kind !== 'zero-width-break' &&
      kind !== 'soft-hyphen'
    ) {
      break;
    }
    index++;
  }
  return index;
}

function chunkStart(
  items: ParagraphItems,
  chunk: ParagraphChunk,
): ParagraphCursor {
  return {
    segmentIndex: skipLineStart(
      items,
      chunk.startSegmentIndex,
      chunk.endSegmentIndex,
    ),
    graphemeIndex: 0,
  };
}

/**
 * Every place a line of this chunk may stop, in paragraph order.
 *
 * @example
 * ```ts
 * const stops = lineStops(items, items.chunks[0]);
 * ```
 */
export function lineStops(
  items: ParagraphItems,
  chunk: ParagraphChunk,
): BreakCandidate[] {
  const candidates: BreakCandidate[] = [];
  for (let i = chunk.startSegmentIndex; i < chunk.endSegmentIndex; i++) {
    for (const at of internalBreakGraphemes(items, i)) {
      const inside = {segmentIndex: i, graphemeIndex: at};
      candidates.push({end: inside, next: inside, hyphenated: false});
    }
    if (i + 1 >= chunk.endSegmentIndex) continue;
    if (!endsLineLegally(items, i + 1, 0)) continue;
    candidates.push({
      end: {segmentIndex: i + 1, graphemeIndex: 0},
      next: {
        segmentIndex: skipLineStart(items, i + 1, chunk.endSegmentIndex),
        graphemeIndex: 0,
      },
      hyphenated: isDiscretionaryLineEnd(items.kinds, i + 1, 0),
    });
  }
  const end = {
    segmentIndex: chunk.consumedEndSegmentIndex,
    graphemeIndex: 0,
  };
  candidates.push({end, next: end, hyphenated: false});

  // Two boundaries that open the same line are one break. The later one is
  // what the greedy walk reports, because it consumes the space it dropped.
  const kept: BreakCandidate[] = [];
  for (const candidate of candidates) {
    const last = kept[kept.length - 1];
    if (
      last !== undefined &&
      last.next.segmentIndex === candidate.next.segmentIndex &&
      last.next.graphemeIndex === candidate.next.graphemeIndex
    ) {
      kept[kept.length - 1] = candidate;
      continue;
    }
    kept.push(candidate);
  }
  return kept;
}

/** Glue of every prefix of the paragraph, so a line reads its own in one step. */
type GlueTotals = {
  readonly width: readonly number[];
  readonly count: readonly number[];
};

function readGlueTotals(items: ParagraphItems): GlueTotals {
  const width: number[] = [0];
  const count: number[] = [0];
  items.kinds.forEach((kind, index) => {
    const glue = isJustificationGlue(kind);
    width.push(width[index] + (glue ? items.widths[index] : 0));
    count.push(count[index] + (glue ? 1 : 0));
  });
  return {width, count};
}

/** Natural width of the glue a justified line stretches, and its count. */
function lineGlue(
  totals: GlueTotals,
  span: LineSpan,
): {width: number; count: number} {
  const last =
    span.end.graphemeIndex > 0
      ? span.end.segmentIndex
      : span.end.segmentIndex - 1;
  const from = span.start.segmentIndex;
  const to = Math.max(last, from);
  return {
    width: totals.width[to] - totals.width[from],
    count: totals.count[to] - totals.count[from],
  };
}

/** How far a justified line's glue is from its natural width. */
function spacingBadness(
  natural: number,
  glue: {width: number; count: number},
  maxWidth: number,
): number {
  const factor = (maxWidth - (natural - glue.width)) / glue.width;
  const ratio = Math.abs(factor - 1);
  const mean = glue.width / glue.count;

  const river = factor - RIVER_THRESHOLD;
  const riverPenalty = river > 0 ? 5000 + river * river * 10000 : 0;
  const tight = mean * (TIGHT_GLUE_RATIO - factor);
  const tightPenalty = tight > 0 ? 3000 + tight * tight * 10000 : 0;
  return ratio * ratio * ratio * 1000 + riverPenalty + tightPenalty;
}

/**
 * What one candidate line costs. A line that passes the box is ranked by how
 * far it passes it; a line that fits is ranked by its spacing. The last line
 * of a chunk is free, and only while it fits.
 *
 * @example
 * ```ts
 * const cost = lineSpanCost(items, span, constraints, false);
 * ```
 */
export function lineSpanCost(
  items: ParagraphItems,
  span: LineSpan,
  constraints: OptimalBreakConstraints,
  isLast: boolean,
): LineCost {
  return costOf(
    measureLineSpanFit(items, span),
    lineGlue(readGlueTotals(items), span),
    isDiscretionaryLineEnd(
      items.kinds,
      span.end.segmentIndex,
      span.end.graphemeIndex,
    ),
    constraints,
    isLast,
  );
}

function costOf(
  natural: number,
  glue: {width: number; count: number},
  hyphenated: boolean,
  constraints: OptimalBreakConstraints,
  isLast: boolean,
): LineCost {
  const {maxWidth, justify} = constraints;
  const justified = justify && !isLast && glue.width > 0;
  const drawn = justified
    ? natural - glue.width * (1 - TIGHTEST_GLUE_RATIO)
    : natural;
  const slack = maxWidth - drawn;
  if (slack < -getEngineProfile().lineFitEpsilon) {
    return {overflow: -slack, badness: 0};
  }
  if (isLast) return ZERO;

  const badness = justified
    ? spacingBadness(natural, glue, maxWidth)
    : (maxWidth - natural) * (maxWidth - natural) * 10;
  return {overflow: 0, badness: badness + (hyphenated ? HYPHEN_PENALTY : 0)};
}

function isBetter(a: LineCost, b: LineCost): boolean {
  return a.overflow !== b.overflow
    ? a.overflow < b.overflow
    : a.badness < b.badness;
}

function isSameCost(a: LineCost, b: LineCost): boolean {
  return a.overflow === b.overflow && a.badness === b.badness;
}

/**
 * Whether an item or a seam can take width off the line it stands on. Only
 * then can a longer line cost less than a shorter one, which is what the
 * search's early exit assumes it cannot.
 */
function hasNegativeAdvance(items: ParagraphItems): boolean {
  return (
    items.widths.some(width => width < 0) ||
    items.letterSpacings.some(spacing => spacing < 0) ||
    items.lineEndFitAdvances.some(advance => advance < 0)
  );
}

/** One planned line, with the chunk whose hard break may close it. */
type PlannedLine = {
  readonly span: LineSpan;
  readonly chunk: ParagraphChunk;
};

/** The lines a chunk is broken into, and what they cost together. */
type ChunkPlan = {
  readonly spans: LineSpan[];
  readonly cost: LineCost;
};

const INFEASIBLE: LineCost = {overflow: Infinity, badness: Infinity};

function planChunk(
  items: ParagraphItems,
  candidates: readonly BreakCandidate[],
  constraints: OptimalBreakConstraints,
  start: ParagraphCursor,
  glue: GlueTotals,
): ChunkPlan {
  const starts: ParagraphCursor[] = [start, ...candidates.map(one => one.next)];
  const count = candidates.length;
  const total: LineCost[] = new Array<LineCost>(count).fill(INFEASIBLE);
  const openedAt: number[] = new Array<number>(count).fill(-1);
  const lineCounts: number[] = new Array<number>(count).fill(0);
  const prunes = !hasNegativeAdvance(items);

  for (let at = 0; at < count; at++) {
    const previous = at === 0 ? ZERO : total[at - 1];
    if (!Number.isFinite(previous.overflow)) continue;
    const lines = (at === 0 ? 0 : lineCounts[at - 1]) + 1;
    const measure = measureLineSpansFrom(items, starts[at]);
    let splitInside = false;

    for (let to = at; to < count; to++) {
      const candidate = candidates[to];
      if (before(starts[at], candidate.end)) {
        const span = {start: starts[at], end: candidate.end};
        const fit = measure.fitTo(candidate.end);
        // The hyphen is painted, so a candidate that hangs it past the free
        // width is no candidate at all, which is the greedy walk's rule.
        if (
          candidate.hyphenated &&
          fit > constraints.maxWidth + getEngineProfile().lineFitEpsilon
        ) {
          splitInside ||= !candidate.hyphenated;
          continue;
        }
        const cost = costOf(
          fit,
          lineGlue(glue, span),
          isDiscretionaryLineEnd(
            items.kinds,
            candidate.end.segmentIndex,
            candidate.end.graphemeIndex,
          ),
          constraints,
          to === count - 1,
        );
        const sum = {
          overflow: previous.overflow + cost.overflow,
          badness: previous.badness + cost.badness,
        };
        if (
          isBetter(sum, total[to]) ||
          (isSameCost(sum, total[to]) && lines < lineCounts[to])
        ) {
          total[to] = sum;
          openedAt[to] = at;
          lineCounts[to] = lines;
        }
        // A line drawn this far past the box loses to its own split at an
        // inner break, and no longer line of this start is narrower: the fit
        // measure only grows as the line does, unless the line ends on a
        // hyphen it would not pay or an item takes width off it.
        if (
          prunes &&
          to < count - 1 &&
          splitInside &&
          !candidate.hyphenated &&
          cost.overflow > constraints.maxWidth
        ) {
          break;
        }
      }
      splitInside ||= !candidate.hyphenated;
    }
  }

  const chosen: number[] = [];
  for (let at = count - 1; at >= 0;) {
    chosen.push(at);
    const opened = openedAt[at];
    if (opened <= 0) break;
    at = opened - 1;
  }
  chosen.reverse();
  return {
    spans: chosen.map(at => ({
      start: starts[openedAt[at]],
      end: candidates[at].end,
    })),
    cost: total[count - 1],
  };
}

function greedy(
  items: ParagraphItems,
  constraints: OptimalBreakConstraints,
): BrokenParagraph {
  const greedyConstraints: BreakConstraints = {
    maxWidth: constraints.maxWidth,
    textWrap: constraints.textWrap,
    overflowWrap: constraints.overflowWrap,
    exclusions: [],
    vertical: constraints.vertical,
  };
  return breakParagraph(items, greedyConstraints);
}

function placeSpans(
  items: ParagraphItems,
  spans: readonly PlannedLine[],
  constraints: OptimalBreakConstraints,
): BrokenParagraph {
  const segment = {left: 0, right: constraints.maxWidth};
  const lines: BrokenLine[] = [];
  let top = 0;
  let width = 0;
  for (const {span, chunk} of spans) {
    const range = lineSpanItemRange(span);
    const paint = measureLineSpan(items, span);
    const height = lineBoxHeight(items, constraints.vertical, range);
    lines.push({
      start: span.start,
      end: span.end,
      items: range,
      width: paint,
      segment,
      height,
      top,
      endsOnHardBreak: endsChunkOnHardBreak(chunk, span.end),
    });
    width = Math.max(width, paint);
    top += height;
  }
  return {lines, width, height: top};
}

/**
 * Break one paragraph into the lines of least total cost. Under
 * `overflow-wrap: anywhere` a paragraph no plan of whole units fits takes the
 * greedy pass instead, because only a grapheme break can hold it.
 *
 * @example
 * ```ts
 * const broken = breakParagraphOptimally(items, {
 *   maxWidth: 240,
 *   textWrap: true,
 *   overflowWrap: 'normal',
 *   justify: false,
 *   vertical,
 * });
 * ```
 */
export function breakParagraphOptimally(
  items: ParagraphItems,
  constraints: OptimalBreakConstraints,
): BrokenParagraph {
  if (!constraints.textWrap || !Number.isFinite(constraints.maxWidth)) {
    return greedy(items, constraints);
  }

  const glue = readGlueTotals(items);
  const spans: PlannedLine[] = [];
  for (const chunk of items.chunks) {
    const start = chunkStart(items, chunk);
    if (chunk.startSegmentIndex === chunk.endSegmentIndex) {
      spans.push({
        span: {
          start,
          end: {segmentIndex: chunk.consumedEndSegmentIndex, graphemeIndex: 0},
        },
        chunk,
      });
      continue;
    }
    // A chunk of markers alone opens no line, as the greedy walk has it.
    if (start.segmentIndex >= chunk.endSegmentIndex) continue;
    const plan = planChunk(
      items,
      lineStops(items, chunk),
      constraints,
      start,
      glue,
    );
    if (constraints.overflowWrap === 'anywhere' && plan.cost.overflow > 0) {
      return greedy(items, constraints);
    }
    for (const span of plan.spans) spans.push({span, chunk});
  }

  return placeSpans(items, spans, constraints);
}
