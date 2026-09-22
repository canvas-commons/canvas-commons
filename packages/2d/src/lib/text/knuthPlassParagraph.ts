/**
 * The optimal break pass: Knuth-Plass over paragraph items.
 *
 * Every width it scores is the width the line paints, read from the one
 * measure the greedy pass also reads, so no line it plans is drawn wider than
 * it was planned. Glue is rigid unless the renderer will justify the line.
 * Beside an exclusion a line is scored against the band its own height carves,
 * so the plan and the placement agree on where each line stands.
 */
import type {TextExclusion} from '../partials/types';
import type {
  BreakConstraints,
  BrokenLine,
  BrokenParagraph,
  OverflowWrapMode,
} from './breakParagraph';
import {breakParagraph, endsChunkOnHardBreak} from './breakParagraph';
import type {ParagraphBands} from './lineBands';
import {
  heightsThrough,
  openingHeight,
  readChunkHeights,
  readParagraphBands,
} from './lineBands';
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
import type {Interval} from './wrapGeometry';

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
  /** Shapes the text flows around, in the paragraph's own space. */
  readonly exclusions?: readonly TextExclusion[];
  readonly vertical: ParagraphVerticalMetrics;
};

/** Pixels a line passes its band, then how well the lines that fit are spaced. */
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

/**
 * First item of a line that opens after a soft wrap. The whitespace at the
 * wrap belongs to the line before it, which drops it or hangs it past the box,
 * so no line may open on it.
 */
function skipWrappedWhiteSpace(
  items: ParagraphItems,
  segmentIndex: number,
  end: number,
): number {
  let index = skipLineStart(items, segmentIndex, end);
  while (index < end) {
    const kind = items.kinds[index];
    if (kind !== 'preserved-space' && kind !== 'tab') break;
    index = skipLineStart(items, index + 1, end);
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
        segmentIndex: skipWrappedWhiteSpace(
          items,
          i + 1,
          chunk.endSegmentIndex,
        ),
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
  limit: number,
): number {
  const factor = (limit - (natural - glue.width)) / glue.width;
  const ratio = Math.abs(factor - 1);
  const mean = glue.width / glue.count;

  const river = factor - RIVER_THRESHOLD;
  const riverPenalty = river > 0 ? 5000 + river * river * 10000 : 0;
  const tight = mean * (TIGHT_GLUE_RATIO - factor);
  const tightPenalty = tight > 0 ? 3000 + tight * tight * 10000 : 0;
  return ratio * ratio * ratio * 1000 + riverPenalty + tightPenalty;
}

/**
 * What one candidate line costs against the free width it stands in. A line
 * that passes that width is ranked by how far it passes it; a line that fits
 * is ranked by its spacing. The last line of a chunk is free, and only while
 * it fits.
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
    constraints.maxWidth,
    constraints.justify,
    isLast,
  );
}

function costOf(
  natural: number,
  glue: {width: number; count: number},
  hyphenated: boolean,
  limit: number,
  justify: boolean,
  isLast: boolean,
): LineCost {
  const justified = justify && !isLast && glue.width > 0;
  const drawn = justified
    ? natural - glue.width * (1 - TIGHTEST_GLUE_RATIO)
    : natural;
  const slack = limit - drawn;
  if (slack < -getEngineProfile().lineFitEpsilon) {
    return {overflow: -slack, badness: 0};
  }
  if (isLast) return ZERO;

  const badness = justified
    ? spacingBadness(natural, glue, limit)
    : (limit - natural) * (limit - natural) * 10;
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

/** Where one planned line stands. */
type PlannedLine = {
  readonly span: LineSpan;
  /** Left edge the line opens at, which its tab stops are measured from. */
  readonly left: number;
  /** Free slot of the band the line occupies at its own height. */
  readonly segment: Interval;
  readonly top: number;
  readonly height: number;
  /** True when the hard break that closes the chunk ends the line. */
  readonly endsOnHardBreak: boolean;
};

/** The free width a candidate line of one band has. */
type LineGeometry = {
  readonly segment: Interval;
  readonly limit: number;
};

/** Top a line opens at once blocked bands are skipped, and its left edge. */
type OpenedLine = {
  readonly top: number;
  readonly left: number;
};

/**
 * Where the lines of one chunk may stand. A line's band follows from the top
 * it opens at and the height of the items it holds, so the search carries the
 * top as part of its state and asks this for the rest.
 */
type ChunkPlacer = {
  /** What a continuation depends on: the top, until every band below is free. */
  key(top: number): string;
  open(top: number, start: ParagraphCursor): OpenedLine;
  /** Box height of a candidate line, from the items it holds. */
  heightOf(span: LineSpan): number;
  geometry(opened: OpenedLine, height: number): LineGeometry;
};

function chunkPlacer(
  items: ParagraphItems,
  constraints: OptimalBreakConstraints,
  chunk: ParagraphChunk,
  bands: ParagraphBands | null,
  base: Interval,
): ChunkPlacer {
  const emergencyBreaks = constraints.overflowWrap === 'anywhere';
  const heights = readChunkHeights(items, constraints.vertical, chunk);
  const heightOf = (span: LineSpan): number =>
    lineBoxHeight(items, constraints.vertical, lineSpanItemRange(span));

  if (bands === null) {
    const unbanded: LineGeometry = {
      segment: base,
      limit: base.right - base.left,
    };
    return {
      key: () => '',
      open: top => ({top, left: base.left}),
      heightOf,
      geometry: () => unbanded,
    };
  }

  const memo = new Map<string, LineGeometry>();
  return {
    key: (top: number) => (top >= bands.bottom ? '' : `${top}`),
    open: (top: number, start: ParagraphCursor) => {
      const reaching = heightsThrough(heights, start.segmentIndex);
      const opened = bands.openAt(
        top,
        openingHeight(items, chunk, start, emergencyBreaks, reaching),
      );
      return {top: opened.top, left: opened.segment.left};
    },
    heightOf,
    geometry: (opened: OpenedLine, height: number) => {
      const key = `${opened.top}|${opened.left}|${height}`;
      const found = memo.get(key);
      if (found !== undefined) return found;
      const segment = bands.slotAt(opened.top, opened.left, height);
      const band = bands.bandOf(opened.left, segment);
      const geometry = {segment, limit: band.width};
      memo.set(key, geometry);
      return geometry;
    },
  };
}

/** A partial plan: what it costs, and the line that closed it. */
type PlanNode = {
  readonly top: number;
  readonly cost: LineCost;
  readonly lines: number;
  readonly previous: PlanNode | null;
  readonly line: PlannedLine | null;
};

/** The lines a chunk is broken into, what they cost, and where they end. */
type ChunkPlan = {
  readonly lines: PlannedLine[];
  readonly cost: LineCost;
  readonly bottom: number;
};

function prefers(node: PlanNode, than: PlanNode | undefined): boolean {
  if (than === undefined) return true;
  return (
    isBetter(node.cost, than.cost) ||
    (isSameCost(node.cost, than.cost) && node.lines < than.lines)
  );
}

/** {@link prefers}, asked before the node that would win is built. */
function wins(
  overflow: number,
  badness: number,
  lines: number,
  than: PlanNode | undefined,
): boolean {
  if (than === undefined) return true;
  if (overflow !== than.cost.overflow) return overflow < than.cost.overflow;
  if (badness !== than.cost.badness) return badness < than.cost.badness;
  return lines < than.lines;
}

function planChunk(
  items: ParagraphItems,
  candidates: readonly BreakCandidate[],
  constraints: OptimalBreakConstraints,
  start: ParagraphCursor,
  glue: GlueTotals,
  placer: ChunkPlacer,
  from: number,
  chunk: ParagraphChunk,
): ChunkPlan | null {
  const starts: ParagraphCursor[] = [start, ...candidates.map(one => one.next)];
  const count = candidates.length;
  const epsilon = getEngineProfile().lineFitEpsilon;
  const prunes = !hasNegativeAdvance(items);
  const reached: Map<string, PlanNode>[] = [];
  for (let i = 0; i < count; i++) reached.push(new Map<string, PlanNode>());
  const opening: PlanNode = {
    top: from,
    cost: ZERO,
    lines: 0,
    previous: null,
    line: null,
  };

  for (let at = 0; at < count; at++) {
    const open: Iterable<PlanNode> =
      at === 0 ? [opening] : reached[at - 1].values();
    for (const node of open) {
      if (!Number.isFinite(node.cost.overflow)) continue;
      const opened = placer.open(node.top, starts[at]);
      const measure = measureLineSpansFrom(items, starts[at], opened.left);
      let splitInside = false;
      let firstStop = -1;

      for (let to = at; to < count; to++) {
        const candidate = candidates[to];
        if (before(starts[at], candidate.end)) {
          const span = {start: starts[at], end: candidate.end};
          const height = placer.heightOf(span);
          const {segment, limit} = placer.geometry(opened, height);
          const fit = measure.fitTo(candidate.end);
          const hyphenated = isDiscretionaryLineEnd(
            items.kinds,
            candidate.end.segmentIndex,
            candidate.end.graphemeIndex,
          );
          // The hyphen is painted, so the break is only legal where the
          // whole of it stands inside the band the line runs in.
          if (!hyphenated || fit <= limit + epsilon) {
            if (firstStop < 0) firstStop = to;
            const cost = costOf(
              fit,
              lineGlue(glue, span),
              hyphenated,
              limit,
              constraints.justify,
              to === count - 1,
            );
            // A line that passes its band holds one unit, as the greedy walk
            // has it: the walk never appends to a line that already overflows,
            // and a longer one only paints further into the shape.
            const isolates = cost.overflow === 0 || to === firstStop;
            const overflow = node.cost.overflow + cost.overflow;
            const badness = node.cost.badness + cost.badness;
            const lines = node.lines + 1;
            const bottom = opened.top + height;
            const key = placer.key(bottom);
            if (
              isolates &&
              wins(overflow, badness, lines, reached[to].get(key))
            ) {
              reached[to].set(key, {
                top: bottom,
                cost: {overflow, badness},
                lines,
                previous: node,
                line: {
                  span,
                  left: opened.left,
                  segment,
                  top: opened.top,
                  height,
                  endsOnHardBreak: endsChunkOnHardBreak(chunk, span.end),
                },
              });
            }
            // A line drawn this far past its band loses to its own split at an
            // inner break, and no longer line of this start is narrower: the
            // fit measure only grows as the line does, and the band only
            // narrows, unless the line ends on a hyphen it would not pay or an
            // item takes width off it.
            if (
              prunes &&
              to < count - 1 &&
              splitInside &&
              !candidate.hyphenated &&
              cost.overflow > limit
            ) {
              break;
            }
          }
        }
        splitInside ||= !candidate.hyphenated;
      }
    }
  }

  let best: PlanNode | undefined;
  for (const node of reached[count - 1].values()) {
    if (Number.isFinite(node.cost.overflow) && prefers(node, best)) best = node;
  }
  if (best === undefined) return null;

  const lines: PlannedLine[] = [];
  for (
    let node: PlanNode | null = best;
    node?.line != null;
    node = node.previous
  ) {
    lines.push(node.line);
  }
  lines.reverse();
  return {lines, cost: best.cost, bottom: best.top};
}

function greedy(
  items: ParagraphItems,
  constraints: OptimalBreakConstraints,
): BrokenParagraph {
  const greedyConstraints: BreakConstraints = {
    maxWidth: constraints.maxWidth,
    textWrap: constraints.textWrap,
    overflowWrap: constraints.overflowWrap,
    exclusions: constraints.exclusions ?? [],
    vertical: constraints.vertical,
  };
  return breakParagraph(items, greedyConstraints);
}

/** The one line an empty hard-break chunk opens. */
function placeEmptyChunk(
  placer: ChunkPlacer,
  top: number,
  span: LineSpan,
  chunk: ParagraphChunk,
): PlannedLine {
  const opened = placer.open(top, span.start);
  const height = placer.heightOf(span);
  return {
    span,
    left: opened.left,
    segment: placer.geometry(opened, height).segment,
    top: opened.top,
    height,
    endsOnHardBreak: endsChunkOnHardBreak(chunk, span.end),
  };
}

function assemble(
  items: ParagraphItems,
  planned: readonly PlannedLine[],
  bottom: number,
): BrokenParagraph {
  const lines: BrokenLine[] = [];
  let width = 0;
  for (const line of planned) {
    const paint = measureLineSpan(items, line.span, line.left);
    lines.push({
      start: line.span.start,
      end: line.span.end,
      items: lineSpanItemRange(line.span),
      width: paint,
      segment: line.segment,
      height: line.height,
      top: line.top,
      endsOnHardBreak: line.endsOnHardBreak,
    });
    width = Math.max(width, line.segment.left + paint);
  }
  return {lines, width, height: bottom};
}

/**
 * Break one paragraph into the lines of least total cost. Under
 * `overflow-wrap: anywhere` a paragraph no plan of whole units fits takes the
 * greedy pass instead, because only a grapheme break can hold it, and so does
 * a paragraph whose bands leave no legal plan at all.
 *
 * @example
 * ```ts
 * const broken = breakParagraphOptimally(items, {
 *   maxWidth: 240,
 *   textWrap: true,
 *   overflowWrap: 'normal',
 *   justify: false,
 *   exclusions: [],
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

  const exclusions = constraints.exclusions ?? [];
  const base: Interval = {left: 0, right: constraints.maxWidth};
  const bands =
    exclusions.length > 0 ? readParagraphBands(exclusions, base) : null;
  const glue = readGlueTotals(items);
  const planned: PlannedLine[] = [];
  let top = 0;

  for (const chunk of items.chunks) {
    const start = chunkStart(items, chunk);
    const placer = chunkPlacer(items, constraints, chunk, bands, base);
    if (chunk.startSegmentIndex === chunk.endSegmentIndex) {
      const line = placeEmptyChunk(
        placer,
        top,
        {
          start,
          end: {segmentIndex: chunk.consumedEndSegmentIndex, graphemeIndex: 0},
        },
        chunk,
      );
      planned.push(line);
      top = line.top + line.height;
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
      placer,
      top,
      chunk,
    );
    if (plan === null) return greedy(items, constraints);
    if (constraints.overflowWrap === 'anywhere' && plan.cost.overflow > 0) {
      return greedy(items, constraints);
    }
    planned.push(...plan.lines);
    top = plan.bottom;
  }

  return assemble(items, planned, top);
}
