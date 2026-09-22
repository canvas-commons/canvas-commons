/**
 * Whether a laid-out paragraph fits a box, and by how much it misses.
 *
 * Vertical fit is the sum of the line boxes. Horizontal fit is every paint
 * call against the free segment its line was broken in, so a call a paint seam
 * shapes on its own is measured as it is painted. Glyph ink outside those
 * extents is permitted, as in CSS.
 */
import type {ParagraphItems} from './paragraphItems';
import type {PlacedParagraph} from './placeParagraph';
import {paintCalls} from './placeParagraph';
import type {ParagraphMetrics} from './preparedParagraph';

/** Rounding slack, so an exact fit is never lost to floating point. */
export const FIT_TOLERANCE = 1e-6;

/** Ink a paragraph must lay out, split by what a font size multiplies. */
export type ParagraphInk = {
  /** Advance that follows the font size. */
  readonly scalable: number;
  /** Advance that keeps its own size, which an inline box holds. */
  readonly fixed: number;
};

/**
 * Ink no line may hang or collapse, so every layout has to find room for it.
 * Whitespace, a tab and the breaks are left out: a line end discards them, and
 * a tab reaches its stop from wherever the line stands.
 *
 * @example
 * ```ts
 * const ink = paragraphInk(items);
 * ```
 */
export function paragraphInk(items: ParagraphItems): ParagraphInk {
  let scalable = 0;
  let fixed = 0;
  for (let i = 0; i < items.kinds.length; i++) {
    const kind = items.kinds[i];
    if (kind === 'inline-box') fixed += items.widths[i];
    else if (kind === 'text' || kind === 'glue') scalable += items.widths[i];
  }
  return {scalable, fixed};
}

/**
 * Fewest lines a wrapped paragraph of `ink` can take in a box `width` wide.
 * A line holds at most `width` of ink, so no break pass can use fewer, and a
 * hard break only adds more.
 *
 * @example
 * ```ts
 * const floor = leastLineCount(paragraphInk(items).scalable, 240);
 * ```
 */
export function leastLineCount(ink: number, width: number): number {
  if (!(width > 0) || !Number.isFinite(width) || ink <= 0) return 1;
  return Math.max(1, Math.ceil(ink / width));
}

export type FitBox = {
  readonly width: number;
  readonly height: number;
};

/**
 * How far a placed paragraph reaches past its box, in pixels. At or below
 * {@link FIT_TOLERANCE} the paragraph fits.
 *
 * @example
 * ```ts
 * const fits = paragraphFitMiss(items, placed, metrics, seams, box) <= FIT_TOLERANCE;
 * ```
 */
export function paragraphFitMiss(
  items: ParagraphItems,
  placed: PlacedParagraph,
  metrics: readonly ParagraphMetrics[],
  seams: readonly number[],
  box: FitBox,
): number {
  let miss = placed.height - box.height;
  for (const call of paintCalls(items, placed, metrics, seams)) {
    const {segment} = call.line;
    const right = Number.isFinite(segment.right) ? segment.right : box.width;
    const {penX, advance} = call.anchor;
    miss = Math.max(miss, segment.left - penX, penX + advance - right);
  }
  return miss;
}
