/**
 * One preparation, read at a smaller size.
 *
 * An outline font reports advances proportional to its size, so a paragraph
 * prepared once at the cap answers any smaller size by arithmetic: every
 * advance is multiplied, the box and the fit tolerances are not, and an inline
 * box keeps its native size because a child is not text. A hinted or bitmap
 * face is not proportional, and `slack` reads the same paragraph at the
 * narrowest advances that error allows, so a caller can tell a rejection it
 * may trust from one it must check.
 */
import {canvasFontSize, resolveLineHeight, scaleCanvasFont} from './font';
import type {ParagraphVerticalMetrics} from './lineMetrics';
import type {ParagraphItemKind, ParagraphItems} from './paragraphItems';
import type {AdvanceMeasurer, ParagraphMetrics} from './preparedParagraph';

/** The parts of a cap preparation a scaled read replaces. */
export type ScaledParagraph = {
  readonly items: ParagraphItems;
  readonly metrics: readonly ParagraphMetrics[];
  readonly vertical: ParagraphVerticalMetrics;
  /** Reads advances of the cap preparation, multiplied by the scale. */
  readonly measurer: AdvanceMeasurer;
};

/** The cap preparation a reader is built over. */
export type ScaledParagraphSource = {
  readonly items: ParagraphItems;
  readonly metrics: readonly ParagraphMetrics[];
  readonly vertical: ParagraphVerticalMetrics;
  /** The declared line height, so a pixel one stays put as the size falls. */
  readonly lineHeight: number | string;
  readonly measurer: AdvanceMeasurer;
};

/**
 * Read the cap preparation at `scale`. `slack` is the fraction of its own
 * magnitude each advance gives back, so `ADVANCE_SCALE_ERROR` reads the
 * narrowest paragraph the model's own error allows.
 */
export type ScaledParagraphReader = (
  scale: number,
  slack: number,
) => ScaledParagraph;

/**
 * Widest measured gap between an advance and its share of the cap's, as a
 * fraction. Outline faces at whole pixel sizes show none; a hinted or bitmap
 * face steps instead of scaling, and the widest step measured across the
 * surveyed faces is six percent of the advance.
 */
export const ADVANCE_SCALE_ERROR = 0.06;

/**
 * Whether narrowing every advance by {@link ADVANCE_SCALE_ERROR} really gives
 * the narrowest paragraph the model allows. A tab reaches the next stop from
 * wherever the line stands, and an inline box keeps its own width, so neither
 * narrows with the text and a rejection of such a paragraph proves nothing.
 *
 * @example
 * ```ts
 * const final = advanceBoundHolds(items) && missAt(scale, ADVANCE_SCALE_ERROR) > 0;
 * ```
 */
export function advanceBoundHolds(items: ParagraphItems): boolean {
  return items.kinds.every(kind => kind !== 'tab' && kind !== 'inline-box');
}

/** The advance at `scale`, narrowed by `slack` to bound the model's error. */
function scaleOne(value: number, scale: number, slack: number): number {
  const scaled = value * scale;
  return scaled - Math.abs(scaled) * slack;
}

function scaleAdvances(
  values: readonly number[],
  kinds: readonly ParagraphItemKind[],
  scale: number,
  slack: number,
): number[] {
  return values.map((value, index) =>
    kinds[index] === 'inline-box' ? value : scaleOne(value, scale, slack),
  );
}

function scaleRows(
  rows: readonly (readonly number[] | null)[],
  scale: number,
  slack: number,
): (readonly number[] | null)[] {
  return rows.map(row =>
    row === null ? null : row.map(one => scaleOne(one, scale, slack)),
  );
}

function scaleItems(
  items: ParagraphItems,
  scale: number,
  slack: number,
): ParagraphItems {
  const {kinds} = items;
  return {
    ...items,
    widths: scaleAdvances(items.widths, kinds, scale, slack),
    lineEndFitAdvances: scaleAdvances(
      items.lineEndFitAdvances,
      kinds,
      scale,
      slack,
    ),
    lineEndPaintAdvances: scaleAdvances(
      items.lineEndPaintAdvances,
      kinds,
      scale,
      slack,
    ),
    breakableFitAdvances: scaleRows(items.breakableFitAdvances, scale, slack),
    paintAdvanceOf: (index, from, to) =>
      kinds[index] === 'inline-box'
        ? items.paintAdvanceOf(index, from, to)
        : scaleOne(items.paintAdvanceOf(index, from, to), scale, slack),
    letterSpacings: items.letterSpacings.map(one =>
      scaleOne(one, scale, slack),
    ),
    discretionaryHyphenWidths: items.discretionaryHyphenWidths.map(one =>
      scaleOne(one, scale, slack),
    ),
    tabStopAdvances: items.tabStopAdvances.map(one =>
      scaleOne(one, scale, slack),
    ),
  };
}

/**
 * Vertical metrics at the scaled size. A percentage line height follows the
 * font size of its own tuple; a pixel one does not move, and neither does the
 * box an inline child asks for.
 */
function scaleVertical(
  items: ParagraphItems,
  metrics: readonly ParagraphMetrics[],
  source: ParagraphVerticalMetrics,
  lineHeight: number | string,
  scale: number,
): ParagraphVerticalMetrics {
  const heights = metrics.map(one =>
    resolveLineHeight(lineHeight, canvasFontSize(one.font) * scale),
  );
  return {
    lineHeight: heights[0],
    lineHeights: items.owners.map(owner => heights[owner]),
    ascents: source.ascents.map(one => one * scale),
    descents: source.descents.map(one => one * scale),
  };
}

/**
 * Read one prepared paragraph at any smaller size without measuring again.
 * Every answer the cap preparation gives is taken once and shared by every
 * scale, so a downward scan measures each distinct slice one time.
 *
 * @example
 * ```ts
 * const read = scaledParagraphReader({items, metrics, vertical, lineHeight, measurer});
 * const half = read(0.5, 0);
 * ```
 */
export function scaledParagraphReader(
  source: ScaledParagraphSource,
): ScaledParagraphReader {
  const bare = new Map<string, number>();
  const capOf = new Map<ParagraphMetrics, ParagraphMetrics>();

  return (scale, slack) => {
    const metrics = source.metrics.map(one => {
      const scaled: ParagraphMetrics = {
        ...one,
        font: scaleCanvasFont(one.font, scale),
        letterSpacing: scaleOne(one.letterSpacing, scale, slack),
      };
      capOf.set(scaled, one);
      return scaled;
    });
    return {
      metrics,
      items: scaleItems(source.items, scale, slack),
      vertical: scaleVertical(
        source.items,
        source.metrics,
        source.vertical,
        source.lineHeight,
        scale,
      ),
      measurer: {
        measureAdvance(text, asked) {
          const cap = capOf.get(asked);
          if (cap === undefined) {
            return source.measurer.measureAdvance(text, asked);
          }
          const key = `${cap.font}\0${cap.letterSpacing}\0${text}`;
          let found = bare.get(key);
          if (found === undefined) {
            found = source.measurer.measureAdvance(text, cap);
            bare.set(key, found);
          }
          return scaleOne(found, scale, slack);
        },
      },
    };
  };
}
