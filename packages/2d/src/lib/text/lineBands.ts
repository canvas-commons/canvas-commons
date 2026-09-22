/**
 * The free band a candidate line stands in, and the line box heights a band
 * lookup asks for. Both break passes read this module, so a line either pass
 * plans stands in the same slot at the same height.
 */
import type {TextExclusion} from '../partials/types';
import type {ParagraphVerticalMetrics} from './lineMetrics';
import {lineBoxHeight} from './lineMetrics';
import type {
  ParagraphChunk,
  ParagraphCursor,
  ParagraphItems,
} from './paragraphItems';
import type {LineBreakBand} from './pretext-derived/lineBreak';
import {getJoinedGroupEnd} from './pretext-derived/lineBreak';
import type {Interval} from './wrapGeometry';
import {
  carveTextLineSlots,
  getPolygonIntervalForBand,
  getRectIntervalsForBand,
} from './wrapGeometry';

function paddedBottom(exclusion: TextExclusion): number {
  const padding = exclusion.verticalPadding ?? 0;
  if (exclusion.kind === 'rect') {
    return exclusion.y + exclusion.height + padding;
  }
  let bottom = -Infinity;
  for (const point of exclusion.points) {
    bottom = Math.max(bottom, point.y + padding);
  }
  return bottom;
}

/** Below this no exclusion blocks a band, so a free segment always exists. */
function exclusionsBottom(exclusions: readonly TextExclusion[]): number {
  let bottom = 0;
  for (const exclusion of exclusions) {
    bottom = Math.max(bottom, paddedBottom(exclusion));
  }
  return bottom;
}

function blockedIntervals(
  exclusions: readonly TextExclusion[],
  top: number,
  bottom: number,
): Interval[] {
  const blocked: Interval[] = [];
  for (const exclusion of exclusions) {
    const horizontal = exclusion.horizontalPadding ?? 0;
    const vertical = exclusion.verticalPadding ?? 0;
    if (exclusion.kind === 'rect') {
      const rect = {
        x: exclusion.x,
        y: exclusion.y,
        width: exclusion.width,
        height: exclusion.height,
      };
      for (const interval of getRectIntervalsForBand(
        [rect],
        top,
        bottom,
        horizontal,
        vertical,
      )) {
        blocked.push(interval);
      }
      continue;
    }
    const interval = getPolygonIntervalForBand(
      exclusion.points,
      top,
      bottom,
      horizontal,
      vertical,
    );
    if (interval !== null) blocked.push(interval);
  }
  return blocked;
}

function widest(segments: readonly Interval[]): Interval | null {
  let found: Interval | null = null;
  for (const segment of segments) {
    if (
      found === null ||
      segment.right - segment.left > found.right - found.left
    ) {
      found = segment;
    }
  }
  return found;
}

/** The segment a line that starts at `left` runs in, of those still free. */
function holding(segments: readonly Interval[], left: number): Interval | null {
  for (const segment of segments) {
    if (segment.left <= left && segment.right > left) return segment;
  }
  return null;
}

/** Where a line may stand between the shapes a paragraph flows around. */
export type ParagraphBands = {
  /** At or below this every band is free, so no band lookup depends on it. */
  readonly bottom: number;
  /**
   * First band at or below `top` with a free slot, and the widest slot of it.
   * A band with no slot is skipped, and the skipped depth belongs to the
   * paragraph, so the vertical extent counts it.
   */
  openAt(top: number, height: number): {top: number; segment: Interval};
  /** Slot the line that opened at `left` keeps once it is `height` tall. */
  slotAt(top: number, left: number, height: number): Interval;
  /** What a candidate line of that slot has to fit. */
  bandOf(left: number, slot: Interval): LineBreakBand;
};

/**
 * Read the bands a set of exclusions leaves inside `base`.
 *
 * @example
 * ```ts
 * const bands = readParagraphBands(exclusions, {left: 0, right: 240});
 * const opened = bands.openAt(0, 20);
 * ```
 */
export function readParagraphBands(
  exclusions: readonly TextExclusion[],
  base: Interval,
): ParagraphBands {
  const bottom = exclusionsBottom(exclusions);
  const free = (top: number, height: number): Interval[] =>
    carveTextLineSlots(base, blockedIntervals(exclusions, top, top + height));

  return {
    bottom,
    openAt(top: number, height: number) {
      let at = top;
      for (;;) {
        const found = widest(free(at, height));
        if (found !== null) return {top: at, segment: found};
        if (at >= bottom || height <= 0) return {top: at, segment: base};
        at += height;
      }
    },
    slotAt(top: number, left: number, height: number) {
      return holding(free(top, height), left) ?? {left, right: left};
    },
    bandOf(left: number, slot: Interval) {
      return {width: slot.right - left, hardEdge: slot.right < base.right};
    },
  };
}

/**
 * Tallest value of a half-open range, in constant time for every query after
 * one build. The table holds the maximum of every power-of-two span, so two
 * overlapping spans cover any range.
 */
function rangeMaxima(
  values: readonly number[],
): (from: number, to: number) => number {
  const levels: number[][] = [[...values]];
  for (let span = 1; span * 2 <= values.length; span *= 2) {
    const previous = levels[levels.length - 1];
    const level: number[] = [];
    for (let i = 0; i + span * 2 <= values.length; i++) {
      level.push(Math.max(previous[i], previous[i + span]));
    }
    levels.push(level);
  }
  return (from: number, to: number) => {
    const level = 31 - Math.clz32(to - from);
    const covering = levels[level];
    return Math.max(covering[from], covering[to - (1 << level)]);
  };
}

/** Line boxes of one chunk: its items, and the hard break that closes it. */
export type ChunkHeights = {
  readonly start: number;
  readonly end: number;
  /** Line box of a line that holds no item of the chunk. */
  readonly empty: number;
  /** Tallest line box of a half-open item range, counted from `start`. */
  readonly tallest: (from: number, to: number) => number;
  readonly closing: number;
  readonly consumed: boolean;
};

/**
 * Read the line box every item of a chunk asks for.
 *
 * @example
 * ```ts
 * const heights = readChunkHeights(items, vertical, items.chunks[0]);
 * ```
 */
export function readChunkHeights(
  items: ParagraphItems,
  vertical: ParagraphVerticalMetrics,
  chunk: ParagraphChunk,
): ChunkHeights {
  const values: number[] = [];
  for (let i = chunk.startSegmentIndex; i < chunk.endSegmentIndex; i++) {
    values.push(lineBoxHeight(items, vertical, {start: i, end: i + 1}));
  }
  return {
    start: chunk.startSegmentIndex,
    end: chunk.endSegmentIndex,
    empty: vertical.lineHeight,
    tallest:
      values.length === 0 ? () => vertical.lineHeight : rangeMaxima(values),
    closing: lineBoxHeight(items, vertical, {
      start: chunk.endSegmentIndex,
      end: chunk.consumedEndSegmentIndex,
    }),
    consumed: chunk.consumedEndSegmentIndex > chunk.endSegmentIndex,
  };
}

/**
 * Box height of every line a chunk can end at: `through(index)` is the height
 * of the line that holds the items from `start` through `index`, and the hard
 * break that closes the chunk when it takes that too. The answer is the same
 * whenever it is asked, so a candidate that is tested and dropped leaves the
 * heights of the candidates before it alone.
 *
 * @example
 * ```ts
 * const reaching = heightsThrough(heights, start.segmentIndex);
 * ```
 */
export function heightsThrough(
  heights: ChunkHeights,
  start: number,
): (index: number, consumesHardBreak: boolean) => number {
  return (index: number, consumesHardBreak: boolean) => {
    const last = Math.min(Math.max(index, start), heights.end - 1);
    const held =
      last < start
        ? heights.empty
        : heights.tallest(start - heights.start, last + 1 - heights.start);
    return consumesHardBreak && heights.consumed
      ? Math.max(held, heights.closing)
      : held;
  };
}

/**
 * Line box the opening unit of a line takes. That unit is the least the line
 * can hold: it stays whole whatever the band leaves, so the line opens in a
 * band that already fits it. A unit that ends the chunk carries the hard
 * break that closes it; one that a break inside it can cut does not.
 *
 * @example
 * ```ts
 * const opening = openingHeight(items, chunk, start, false, reaching);
 * ```
 */
export function openingHeight(
  items: ParagraphItems,
  chunk: ParagraphChunk,
  start: ParagraphCursor,
  emergencyBreaks: boolean,
  reaching: (index: number, consumesHardBreak: boolean) => number,
): number {
  const first = start.segmentIndex;
  if (chunk.endSegmentIndex <= first) return reaching(first, true);
  const groupEnd = emergencyBreaks
    ? first + 1
    : getJoinedGroupEnd(items, first, chunk.endSegmentIndex);
  let last = groupEnd - 1;
  for (let i = first; i < groupEnd; i++) {
    if (items.breakablePreferredBreaks[i] !== null) {
      last = i;
      break;
    }
  }
  const cut =
    last < groupEnd - 1 ||
    (emergencyBreaks && (items.breakableFitAdvances[last]?.length ?? 0) > 1);
  return reaching(last, !cut && last + 1 >= chunk.endSegmentIndex);
}
