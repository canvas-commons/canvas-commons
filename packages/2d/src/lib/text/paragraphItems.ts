import type {SegmentBreakKind} from './pretext-derived/segmentBreakKind';

/**
 * Break behavior of an item. `inline-box` is ours: an atomic box of a given
 * width and height, which breaks like a replaced element. A line may end on a
 * box and a line may start on one, whatever the text it is glued to.
 */
export type ParagraphItemKind = SegmentBreakKind | 'inline-box';

/** One hard-break chunk: the line walker restarts at every chunk. */
export type ParagraphChunk = {
  readonly startSegmentIndex: number;
  readonly endSegmentIndex: number;
  readonly consumedEndSegmentIndex: number;
};

/** Cursor into the preparation that measured an item. */
export type ParagraphCursor = {
  readonly segmentIndex: number;
  readonly graphemeIndex: number;
};

/**
 * Half-open cursor range of one item inside the preparation that measured it.
 * A cursor addresses whole graphemes, so an item that starts or ends inside
 * one names the UTF-16 units of that grapheme it does not hold.
 */
export type ItemHandleRange = {
  readonly start: ParagraphCursor;
  readonly end: ParagraphCursor;
  /** UTF-16 units to drop from the front of the materialized range. */
  readonly startTrim: number;
  /** UTF-16 units to drop from the back of the materialized range. */
  readonly endTrim: number;
};

/** Cursor range of a whole prepared segment. */
export function wholeSegmentRange(segmentIndex: number): ItemHandleRange {
  return {
    start: {segmentIndex, graphemeIndex: 0},
    end: {segmentIndex: segmentIndex + 1, graphemeIndex: 0},
    startTrim: 0,
    endTrim: 0,
  };
}

/**
 * The items of one paragraph, as parallel readonly arrays the line walker
 * reads. The arrays are the same length and index `i` always names the same
 * item.
 */
export type ParagraphItems = {
  /** Break behavior of each item. */
  readonly kinds: readonly ParagraphItemKind[];

  /**
   * True when an item continues the one before it with no break between them.
   * A seam that exists only because the metrics change is joined, so refining
   * an item offers the line walker no new break. An inline box is never
   * joined, on either side.
   */
  readonly joinsPrevious: readonly boolean[];

  /** Index of the preparation each item was measured in. */
  readonly owners: readonly number[];

  /** Box height of an `inline-box` item, else zero. */
  readonly boxHeights: readonly number[];

  /** Half-open range of each item in the normalized paragraph text. */
  readonly sourceStarts: readonly number[];
  readonly sourceEnds: readonly number[];

  /**
   * Cursor range of an item in the preparation that measured it, which is
   * what materializing a line range of that preparation reads. An item that is
   * a sub-range of a prepared segment keeps the grapheme bounds here.
   */
  readonly handleRangeOf: (index: number) => ItemHandleRange;

  /** Natural advance of each item, inside a line. */
  readonly widths: readonly number[];

  /** Advance each item contributes when the line ends on it, for fitting. */
  readonly lineEndFitAdvances: readonly number[];

  /** Advance each item contributes when the line ends on it, for painting. */
  readonly lineEndPaintAdvances: readonly number[];

  /** Per-grapheme fit advances of a breakable item, else `null`. */
  readonly breakableFitAdvances: readonly (readonly number[] | null)[];

  /**
   * Advance the graphemes `[from, to)` of an item paint, shaped as that slice
   * alone. The fit advances measure each grapheme apart, so they leave out the
   * kerning inside a slice; this is what the slice draws.
   */
  readonly paintAdvanceOf: (index: number, from: number, to: number) => number;

  /** Preferred grapheme break ends inside a breakable item, else `null`. */
  readonly breakablePreferredBreaks: readonly (readonly number[] | null)[];

  /**
   * Rendered grapheme count of each item, for the letter-spacing gaps. Zero
   * when the item carries no letter spacing, because no rule reads it then.
   */
  readonly spacingGraphemeCounts: readonly number[];

  /** Letter spacing of each item. */
  readonly letterSpacings: readonly number[];

  /** Visible hyphen width of each item, when a soft hyphen ends the line. */
  readonly discretionaryHyphenWidths: readonly number[];

  /** Absolute advance between tab stops, for each tab item. */
  readonly tabStopAdvances: readonly number[];

  /** True when no item needs the chunked walk: plain text, no letter spacing. */
  readonly simpleLineWalkFastPath: boolean;

  readonly chunks: readonly ParagraphChunk[];
};
