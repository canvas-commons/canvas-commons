/**
 * The greedy break pass: one walk that produces every line of a paragraph.
 *
 * A line is tested against the free segment of the band it will occupy, at
 * the height it will have, so an exclusion, an over-wide unit and a hyphen are
 * all inputs to the one choice. Nothing here corrects a break afterwards.
 */
import type {TextExclusion} from '../partials/types';
import type {ChunkHeights} from './lineBands';
import {
  heightsThrough,
  openingHeight,
  readChunkHeights,
  readParagraphBands,
} from './lineBands';
import type {ItemRange, ParagraphVerticalMetrics} from './lineMetrics';
import {lineBoxHeight} from './lineMetrics';
import {lineSpanItemRange, measureLineSpan} from './lineSpan';
import type {
  ParagraphChunk,
  ParagraphCursor,
  ParagraphItems,
} from './paragraphItems';
import type {
  LineBreakCursor,
  LineBreakOptions,
} from './pretext-derived/lineBreak';
import {
  normalizePreparedLineStart,
  offersInternalBreaks,
  stepPreparedLineGeometryFromChunk,
} from './pretext-derived/lineBreak';
import type {Interval} from './wrapGeometry';

/** What happens to a unit wider than the line, as CSS `overflow-wrap`. */
export type OverflowWrapMode = 'normal' | 'anywhere';

export type BreakConstraints = {
  /** Width of the content box; `Infinity` when nothing forces a break. */
  readonly maxWidth: number;
  /** False breaks only at hard breaks. */
  readonly textWrap: boolean;
  readonly overflowWrap: OverflowWrapMode;
  /** Shapes the text flows around, in the paragraph's own space. */
  readonly exclusions: readonly TextExclusion[];
  readonly vertical: ParagraphVerticalMetrics;
};

export type BrokenLine = {
  readonly start: ParagraphCursor;
  readonly end: ParagraphCursor;
  /** Items the line box covers, which is what its height is read from. */
  readonly items: ItemRange;
  /** Width the line paints, hyphen and letter spacing included. */
  readonly width: number;
  /** Free horizontal segment of the band the line was broken in. */
  readonly segment: Interval;
  readonly height: number;
  readonly top: number;
  /**
   * True when the hard break that closes the chunk ends the line, whatever
   * stands in front of it. Such a line is never justified.
   */
  readonly endsOnHardBreak: boolean;
};

/** Whether the line that stops at `end` takes the chunk's hard break. */
export function endsChunkOnHardBreak(
  chunk: ParagraphChunk,
  end: ParagraphCursor,
): boolean {
  return (
    chunk.consumedEndSegmentIndex > chunk.endSegmentIndex &&
    end.segmentIndex >= chunk.endSegmentIndex
  );
}

export type BrokenParagraph = {
  readonly lines: readonly BrokenLine[];
  /** Right edge of the widest placed line. */
  readonly width: number;
  /** Bottom of the last line, skipped bands included. */
  readonly height: number;
};

/**
 * Break one paragraph into lines.
 *
 * @example
 * ```ts
 * const broken = breakParagraph(items, {
 *   maxWidth: 240,
 *   textWrap: true,
 *   overflowWrap: 'normal',
 *   exclusions: [],
 *   vertical,
 * });
 * ```
 */
export function breakParagraph(
  items: ParagraphItems,
  constraints: BreakConstraints,
): BrokenParagraph {
  const {exclusions, maxWidth, vertical} = constraints;
  const wraps = constraints.textWrap && Number.isFinite(maxWidth);
  const base: Interval = {left: 0, right: wraps ? maxWidth : Infinity};
  const banded = wraps && exclusions.length > 0;
  const bands = banded ? readParagraphBands(exclusions, base) : null;
  const emergencyBreaks = constraints.overflowWrap === 'anywhere';
  const internalBreaks = offersInternalBreaks(items);
  const uniformHeights =
    !banded ||
    vertical.lineHeights.every(
      (height, index) =>
        height === vertical.lineHeights[0] && items.boxHeights[index] <= height,
    );

  const lines: BrokenLine[] = [];
  const cursor: LineBreakCursor = {segmentIndex: 0, graphemeIndex: 0};
  const heights = new Map<number, ChunkHeights>();
  let top = 0;
  let width = 0;

  for (;;) {
    const chunkIndex = normalizePreparedLineStart(items, cursor);
    if (chunkIndex < 0) break;
    const start: ParagraphCursor = {
      segmentIndex: cursor.segmentIndex,
      graphemeIndex: cursor.graphemeIndex,
    };
    const chunk = items.chunks[chunkIndex];

    let segment = base;
    let placeIn: (height: number) => Interval = () => segment;
    let bandAt: LineBreakOptions['bandAt'];
    let limit = base.right - base.left;
    if (bands !== null) {
      const chunkHeights =
        heights.get(chunkIndex) ?? readChunkHeights(items, vertical, chunk);
      heights.set(chunkIndex, chunkHeights);
      const reaching = heightsThrough(chunkHeights, start.segmentIndex);
      const opened = bands.openAt(
        top,
        openingHeight(items, chunk, start, emergencyBreaks, reaching),
      );
      top = opened.top;
      segment = opened.segment;

      const fixed = bands.bandOf(segment.left, segment);
      limit = fixed.width;
      if (uniformHeights) {
        if (fixed.hardEdge) bandAt = () => fixed;
      } else {
        placeIn = height => bands.slotAt(top, segment.left, height);
        bandAt = (index: number, consumesHardBreak: boolean) =>
          bands.bandOf(
            segment.left,
            placeIn(reaching(index, consumesHardBreak)),
          );
      }
    }

    const upstream =
      bandAt === undefined &&
      emergencyBreaks &&
      segment.left === 0 &&
      !internalBreaks;
    const options: LineBreakOptions | undefined = upstream
      ? undefined
      : {bandAt, emergencyBreaks, originLeft: segment.left, internalBreaks};

    const walked = stepPreparedLineGeometryFromChunk(
      items,
      cursor,
      chunkIndex,
      limit,
      options,
    );
    if (walked === null) break;

    const end: ParagraphCursor = {
      segmentIndex: cursor.segmentIndex,
      graphemeIndex: cursor.graphemeIndex,
    };
    const span = {start, end};
    const range = lineSpanItemRange(span);
    const paint = measureLineSpan(items, span, segment.left);
    const height = lineBoxHeight(items, vertical, range);
    const placed = placeIn(height);
    lines.push({
      start,
      end,
      items: range,
      width: paint,
      segment: placed,
      height,
      top,
      endsOnHardBreak: endsChunkOnHardBreak(chunk, end),
    });
    width = Math.max(width, placed.left + paint);
    top += height;
  }

  return {lines, width, height: top};
}
