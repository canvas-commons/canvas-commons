import type {OverflowWrapMode} from './breakParagraph';
import {measureLineSpanFit} from './lineSpan';
import type {
  ParagraphChunk,
  ParagraphCursor,
  ParagraphItems,
} from './paragraphItems';
import type {LineBreakCursor} from './pretext-derived/lineBreak';
import {
  endsLineLegally,
  getBreakableFitAdvances,
  internalBreakGraphemes,
  isDiscretionaryLineEnd,
  needsInkFit,
  normalizePreparedLineStart,
} from './pretext-derived/lineBreak';

export type MinContentConstraints = {
  /** False breaks only at hard breaks, so a whole line is one unit. */
  readonly textWrap: boolean;
  readonly overflowWrap: OverflowWrapMode;
  /** True fits a line against its ink; see {@link LineBreakOptions.inkFit}. */
  readonly inkFit?: boolean;
};

/** Grapheme ends a line may stop at strictly inside one item. */
function internalStops(
  items: ParagraphItems,
  constraints: MinContentConstraints,
  index: number,
): readonly number[] {
  if (items.breakableFitAdvances[index] === null) return [];
  if (constraints.overflowWrap !== 'anywhere') {
    return internalBreakGraphemes(items, index);
  }
  const row = getBreakableFitAdvances(items, index);
  return Array.from({length: row.length - 1}, (_, at) => at + 1);
}

/**
 * Every cursor a line of this chunk may end at, ascending. An emergency break
 * stands anywhere, an item boundary included, so under `anywhere` a line may
 * end in front of a soft hyphen without painting it.
 */
function* breakStops(
  items: ParagraphItems,
  constraints: MinContentConstraints,
  chunk: ParagraphChunk,
): Generator<ParagraphCursor> {
  const anywhere = constraints.overflowWrap === 'anywhere';
  if (constraints.textWrap) {
    for (let i = chunk.startSegmentIndex; i < chunk.endSegmentIndex; i++) {
      for (const graphemeIndex of internalStops(items, constraints, i)) {
        yield {segmentIndex: i, graphemeIndex};
      }
      if (
        i + 1 < chunk.endSegmentIndex &&
        (anywhere || endsLineLegally(items, i + 1, 0))
      ) {
        yield {segmentIndex: i + 1, graphemeIndex: 0};
      }
    }
  }
  yield {segmentIndex: chunk.consumedEndSegmentIndex, graphemeIndex: 0};
}

function reaches(stop: ParagraphCursor, start: ParagraphCursor): boolean {
  return (
    stop.segmentIndex > start.segmentIndex ||
    (stop.segmentIndex === start.segmentIndex &&
      stop.graphemeIndex > start.graphemeIndex)
  );
}

/** Line start after a break here, or `null` where the paragraph is spent. */
function lineStartAfter(
  items: ParagraphItems,
  stop: ParagraphCursor,
): ParagraphCursor | null {
  const cursor: LineBreakCursor = {
    segmentIndex: stop.segmentIndex,
    graphemeIndex: stop.graphemeIndex,
  };
  if (normalizePreparedLineStart(items, cursor) < 0) return null;
  return {
    segmentIndex: cursor.segmentIndex,
    graphemeIndex: cursor.graphemeIndex,
  };
}

/**
 * Narrowest width the run from `start` to `end` fits in. A hyphen break widens
 * the line it ends, so it is worth taking only where the run it splits is
 * wider still; every other break shortens a line and is always taken.
 */
function runFloor(
  items: ParagraphItems,
  start: ParagraphCursor,
  hyphens: readonly ParagraphCursor[],
  end: ParagraphCursor,
  inkFit: boolean,
): number {
  const fitOf = (from: ParagraphCursor, to: ParagraphCursor): number =>
    measureLineSpanFit(items, {start: from, end: to}, 0, inkFit);
  if (hyphens.length === 0) return fitOf(start, end);

  const stops = [...hyphens, end];
  const starts = [start];
  for (const hyphen of hyphens) {
    starts.push(lineStartAfter(items, hyphen) ?? end);
  }

  // Bottleneck of the breaks taken between `start` and each stop.
  const best: number[] = [];
  for (let to = 0; to < stops.length; to++) {
    let bottleneck = Infinity;
    for (let from = 0; from <= to; from++) {
      if (!reaches(stops[to], starts[from])) continue;
      const behind = from === 0 ? 0 : best[from - 1];
      bottleneck = Math.min(
        bottleneck,
        Math.max(behind, fitOf(starts[from], stops[to])),
      );
    }
    best.push(bottleneck);
  }
  return best[stops.length - 1];
}

/**
 * Narrowest width the lines of a paragraph still fit in: every break the items
 * offer, taken where it helps, leaves one widest line and that is the width.
 *
 * @example
 * ```ts
 * const floor = measureMinContentWidth(items, {
 *   textWrap: true,
 *   overflowWrap: 'normal',
 * });
 * ```
 */
export function measureMinContentWidth(
  items: ParagraphItems,
  constraints: MinContentConstraints,
): number {
  const inkFit = (constraints.inkFit ?? false) && needsInkFit(items);
  const cursor: LineBreakCursor = {segmentIndex: 0, graphemeIndex: 0};
  let widest = 0;

  for (;;) {
    const chunkIndex = normalizePreparedLineStart(items, cursor);
    if (chunkIndex < 0) break;
    const chunk = items.chunks[chunkIndex];
    let start: ParagraphCursor | null = {
      segmentIndex: cursor.segmentIndex,
      graphemeIndex: cursor.graphemeIndex,
    };
    let hyphens: ParagraphCursor[] = [];

    for (const stop of breakStops(items, constraints, chunk)) {
      if (start === null || !reaches(stop, start)) continue;
      if (
        stop.segmentIndex < chunk.consumedEndSegmentIndex &&
        isDiscretionaryLineEnd(
          items.kinds,
          stop.segmentIndex,
          stop.graphemeIndex,
        )
      ) {
        hyphens.push(stop);
        continue;
      }
      widest = Math.max(widest, runFloor(items, start, hyphens, stop, inkFit));
      hyphens = [];
      start = lineStartAfter(items, stop);
    }

    if (chunk.consumedEndSegmentIndex >= items.kinds.length) break;
    cursor.segmentIndex = chunk.consumedEndSegmentIndex;
    cursor.graphemeIndex = 0;
  }

  return widest;
}
