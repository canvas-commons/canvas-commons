/**
 * Vertical metrics of a paragraph's items, and the box of a line built from
 * them. The line walker reads no number here: a tall line must not reach the
 * break pass.
 */
import {canvasFontSize, resolveLineHeight} from './font';
import type {ParagraphItems} from './paragraphItems';
import type {ParagraphMeasurer, ParagraphMetrics} from './preparedParagraph';

/** What a baseline needs of one font. */
export type FontBox = {
  readonly ascent: number;
  readonly descent: number;
};

/** Vertical metrics of one paragraph, item by item. */
export type ParagraphVerticalMetrics = {
  /** Line box a line with no item of its own takes, from the first tuple. */
  readonly lineHeight: number;
  /** Line box each item asks for, from the font size of its own tuple. */
  readonly lineHeights: readonly number[];
  readonly ascents: readonly number[];
  readonly descents: readonly number[];
};

/** A half-open range of items, as a line holds them. */
export type ItemRange = {
  readonly start: number;
  readonly end: number;
};

/**
 * Read the font box and the line height of every item's metric tuple. A
 * percentage line height resolves against the font size of the tuple, so a
 * larger font asks for a larger line; a pixel line height is the same for all.
 *
 * @example
 * ```ts
 * const vertical = readVerticalMetrics(items, [metrics], '120%', measurer);
 * ```
 */
export function readVerticalMetrics(
  items: ParagraphItems,
  metrics: readonly ParagraphMetrics[],
  lineHeight: number | string,
  measurer: ParagraphMeasurer,
): ParagraphVerticalMetrics {
  const boxes = metrics.map(one => measurer.measureFontBox(one));
  const heights = metrics.map(one =>
    resolveLineHeight(lineHeight, canvasFontSize(one.font)),
  );
  const count = items.owners.length;
  const ascents = new Array<number>(count);
  const descents = new Array<number>(count);
  const lineHeights = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const owner = items.owners[i];
    ascents[i] = boxes[owner].ascent;
    descents[i] = boxes[owner].descent;
    lineHeights[i] = heights[owner];
  }
  return {lineHeight: heights[0], lineHeights, ascents, descents};
}

/**
 * Box height of one line: the tallest line height the items on it ask for,
 * grown by an inline box that is taller still.
 *
 * @example
 * ```ts
 * const height = lineBoxHeight(items, vertical, {start: 0, end: 4});
 * ```
 */
export function lineBoxHeight(
  items: ParagraphItems,
  vertical: ParagraphVerticalMetrics,
  range: ItemRange,
): number {
  if (range.end <= range.start) return vertical.lineHeight;
  let height = 0;
  for (let i = range.start; i < range.end; i++) {
    height = Math.max(height, vertical.lineHeights[i]);
    if (items.kinds[i] === 'inline-box') {
      height = Math.max(height, items.boxHeights[i]);
    }
  }
  return height;
}

/** Space a line box leaves above and below one font's own box. */
function halfLeading(height: number, box: FontBox): number {
  return (height - (box.ascent + box.descent)) / 2;
}

/** The taller of two items: the taller line first, then the taller ink. */
function isTaller(
  vertical: ParagraphVerticalMetrics,
  index: number,
  than: number,
): boolean {
  if (vertical.lineHeights[index] !== vertical.lineHeights[than]) {
    return vertical.lineHeights[index] > vertical.lineHeights[than];
  }
  return (
    vertical.ascents[index] + vertical.descents[index] >
    vertical.ascents[than] + vertical.descents[than]
  );
}

/**
 * Baseline every item of one line sits on, measured from the top of its box.
 * The item that asks for the tallest line owns the leading, and the deepest
 * ascent on the line decides how far down the baseline falls, so text of two
 * sizes shares one baseline.
 *
 * @example
 * ```ts
 * const baseline = lineBaselineOffset(vertical, {start: 0, end: 4}, height);
 * ```
 */
export function lineBaselineOffset(
  vertical: ParagraphVerticalMetrics,
  range: ItemRange,
  height: number,
): number {
  if (range.end <= range.start) return height / 2;
  let ascent = 0;
  let tallest = range.start;
  for (let i = range.start; i < range.end; i++) {
    ascent = Math.max(ascent, vertical.ascents[i]);
    if (isTaller(vertical, i, tallest)) tallest = i;
  }
  return (
    halfLeading(height, {
      ascent: vertical.ascents[tallest],
      descent: vertical.descents[tallest],
    }) + ascent
  );
}
