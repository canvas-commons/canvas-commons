/**
 * One definition of the width a candidate line paints. Every break pass asks
 * this module, so a line a pass plans and a line it emits are the same number.
 */
import type {ItemRange} from './lineMetrics';
import type {
  ParagraphCursor,
  ParagraphItemKind,
  ParagraphItems,
} from './paragraphItems';
import {
  breaksAfter,
  getBreakableFitAdvances,
  getBreakOpportunityFitContribution,
  getDiscretionaryHyphenWidth,
  getLeadingLetterSpacing,
  getLineEndPaintContribution,
  getPartialPaintCorrection,
  getTabAdvance,
  getTerminalLetterSpacing,
  getWholeSegmentFitContribution,
  isDiscretionaryLineEnd,
} from './pretext-derived/lineBreak';

/**
 * Advance a run of `graphemes` glyphs occupies when it is painted. The
 * platform convention is `bare + n x spacing`, so the gap behind the last
 * glyph belongs to the run.
 *
 * @example
 * ```ts
 * const advance = spacedAdvance(measurer.measureAdvance(text, metrics), 3, 2);
 * ```
 */
export function spacedAdvance(
  bare: number,
  graphemes: number,
  letterSpacing: number,
): number {
  return bare + graphemes * letterSpacing;
}

/**
 * Glue at this fraction of its natural width is as tight as a justified line
 * may be drawn. A pass that scores a line before it is placed reads it too.
 */
export const TIGHTEST_GLUE_RATIO = 0.4;

/**
 * Kinds that carry justification slack.
 *
 * @example
 * ```ts
 * const stretches = isJustificationGlue(items.kinds[3]);
 * ```
 */
export function isJustificationGlue(kind: ParagraphItemKind): boolean {
  return kind === 'space' || kind === 'preserved-space';
}

/** Half-open cursor range of one line. */
export type LineSpan = {
  readonly start: ParagraphCursor;
  readonly end: ParagraphCursor;
};

/** Items a line box covers, whole or in part. */
export function lineSpanItemRange(span: LineSpan): ItemRange {
  const last =
    span.end.graphemeIndex > 0
      ? span.end.segmentIndex + 1
      : span.end.segmentIndex;
  return {
    start: span.start.segmentIndex,
    end: Math.max(last, span.start.segmentIndex),
  };
}

/**
 * Item the line ends on. A hard break carries no advance, and the line that
 * consumes it still ends on the text in front of it, so whitespace there
 * hangs as it does at any other line end.
 */
function terminalItem(items: ParagraphItems, end: ParagraphCursor): number {
  let last = end.graphemeIndex > 0 ? end.segmentIndex : end.segmentIndex - 1;
  while (last >= 0 && items.kinds[last] === 'hard-break') last--;
  return last;
}

/**
 * What an item is asked for. An `inner` role is its advance inside the line,
 * `through` the width a break test gives a line that reaches it and goes on,
 * and the two ends the width a line that stops on it has to fit, or paints. A
 * fit role reads the grapheme fit advances of a partly held item; a paint role
 * reads the composed advances that item paints.
 */
type ItemRole =
  'fit-inner' | 'paint-inner' | 'through' | 'fit-end' | 'paint-end';

function paints(role: ItemRole): boolean {
  return role === 'paint-inner' || role === 'paint-end';
}

/** What the item a line ends on has to fit. */
function endContribution(
  items: ParagraphItems,
  kind: ParagraphItemKind,
  index: number,
  leading: number,
): number {
  return breaksAfter(kind)
    ? getBreakOpportunityFitContribution(items, kind, index, leading)
    : getWholeSegmentFitContribution(
        items,
        kind,
        index,
        leading,
        items.widths[index],
      );
}

/** Width and content of the line so far. */
type SpanState = {width: number; hasContent: boolean};

/** Whether the line holds content with the item from grapheme `from` on. */
function holdsContentAfter(
  items: ParagraphItems,
  state: SpanState,
  index: number,
  from: number,
): boolean {
  const kind = items.kinds[index];
  if (kind === 'soft-hyphen' || kind === 'hard-break') return state.hasContent;
  if (from > 0) {
    return (
      state.hasContent || getBreakableFitAdvances(items, index).length > from
    );
  }
  return true;
}

/**
 * Width of the line with one more item on it. `from` is the first grapheme
 * the line holds of that item, `to` the first it does not, or -1 for all of
 * them.
 */
function itemAdvance(
  items: ParagraphItems,
  state: SpanState,
  lineStart: number,
  index: number,
  from: number,
  to: number,
  role: ItemRole,
  originLeft: number,
): number {
  const kind = items.kinds[index];
  if (kind === 'soft-hyphen' || kind === 'hard-break') return state.width;
  const leading = getLeadingLetterSpacing(
    items,
    state.hasContent,
    lineStart,
    index,
  );

  if (from > 0 || to >= 0) {
    const row = getBreakableFitAdvances(items, index);
    const until = to < 0 ? row.length : to;
    let content = state.hasContent;
    let width = state.width;
    for (let g = from; g < until; g++) {
      const gap = content
        ? g === from
          ? leading
          : items.letterSpacings[index]
        : 0;
      width += row[g] + gap;
      content = true;
    }
    // Inside an item every candidate carries the gap behind its last glyph,
    // which a whole item carries in its line-end advance.
    const trailing =
      role === 'fit-inner' || paints(role) ? 0 : items.letterSpacings[index];
    const shaped = paints(role)
      ? getPartialPaintCorrection(items, index, from, to)
      : 0;
    return width + trailing + shaped;
  }

  if (kind === 'tab') {
    const advance = getTabAdvance(
      originLeft + state.width + leading,
      items.tabStopAdvances[index],
    );
    let contribution: number;
    switch (role) {
      case 'through':
        contribution = getWholeSegmentFitContribution(
          items,
          kind,
          index,
          leading,
          advance,
        );
        break;
      case 'fit-end':
        contribution = getBreakOpportunityFitContribution(
          items,
          kind,
          index,
          leading,
        );
        break;
      default:
        contribution = leading + advance;
    }
    return state.width + contribution;
  }

  let contribution: number;
  switch (role) {
    case 'through':
      contribution = getWholeSegmentFitContribution(
        items,
        kind,
        index,
        leading,
        items.widths[index],
      );
      break;
    case 'fit-end':
      contribution = endContribution(items, kind, index, leading);
      break;
    case 'paint-end':
      contribution = getLineEndPaintContribution(
        items,
        kind,
        index,
        leading,
        items.widths[index],
      );
      break;
    default:
      contribution = leading + items.widths[index];
  }
  return state.width + contribution;
}

/** Put one more item on the line `state` measures. */
function advanceState(
  items: ParagraphItems,
  state: SpanState,
  lineStart: number,
  index: number,
  from: number,
  role: ItemRole,
  originLeft: number,
): void {
  const width = itemAdvance(
    items,
    state,
    lineStart,
    index,
    from,
    -1,
    role,
    originLeft,
  );
  state.hasContent = holdsContentAfter(items, state, index, from);
  state.width = width;
}

/**
 * Running measure of the lines that open at one cursor. Asking for a line
 * carries the items in front of it forward, so a pass that tests every
 * candidate end of one line start pays for each item once.
 */
export type LineSpanMeasure = {
  /** Width a break test compares with the free width, ends ascending. */
  fitTo(end: ParagraphCursor): number;
  /** Width the line paints, ends ascending. */
  paintTo(end: ParagraphCursor): number;
};

/**
 * Measure the lines that open at `start`, one after another, with ends that
 * ascend. A caller that needs one width alone calls {@link measureLineSpan}.
 *
 * @example
 * ```ts
 * const measure = measureLineSpansFrom(items, chunkStart);
 * const fit = measure.fitTo({segmentIndex: 4, graphemeIndex: 0});
 * ```
 */
export function measureLineSpansFrom(
  items: ParagraphItems,
  start: ParagraphCursor,
  originLeft = 0,
): LineSpanMeasure {
  // One running state each: a partly held item fits on what its graphemes
  // measure apart and paints what the item composes, so the two diverge. Each
  // is carried forward only when it is asked for.
  const fitState: SpanState = {width: 0, hasContent: false};
  const paintState: SpanState = {width: 0, hasContent: false};
  let fitIndex = start.segmentIndex;
  let paintIndex = start.segmentIndex;
  // Greatest width a prefix of the line has to fit: the walk tests every item
  // it appends as though the line ended there.
  let peak = 0;
  const firstGrapheme = (index: number) =>
    index === start.segmentIndex ? start.graphemeIndex : 0;

  const measure = (end: ParagraphCursor, fits: boolean): number => {
    const last = terminalItem(items, end);
    if (fits) {
      for (; fitIndex < last; fitIndex++) {
        const from = firstGrapheme(fitIndex);
        peak = Math.max(
          peak,
          itemAdvance(
            items,
            fitState,
            start.segmentIndex,
            fitIndex,
            from,
            -1,
            'through',
            originLeft,
          ),
        );
        advanceState(
          items,
          fitState,
          start.segmentIndex,
          fitIndex,
          from,
          'fit-inner',
          originLeft,
        );
      }
    } else {
      for (; paintIndex < last; paintIndex++) {
        advanceState(
          items,
          paintState,
          start.segmentIndex,
          paintIndex,
          firstGrapheme(paintIndex),
          'paint-inner',
          originLeft,
        );
      }
    }

    const partialEnd = end.graphemeIndex > 0;
    const state = fits ? fitState : paintState;
    let width = state.width;
    if (last >= start.segmentIndex) {
      width = itemAdvance(
        items,
        state,
        start.segmentIndex,
        last,
        last === start.segmentIndex ? start.graphemeIndex : 0,
        partialEnd ? end.graphemeIndex : -1,
        fits ? 'fit-end' : 'paint-end',
        originLeft,
      );
    }

    if (
      isDiscretionaryLineEnd(items.kinds, end.segmentIndex, end.graphemeIndex)
    ) {
      width += getDiscretionaryHyphenWidth(
        items,
        start.segmentIndex,
        end.segmentIndex - 1,
      );
    }

    if (!fits) {
      return (
        width +
        getTerminalLetterSpacing(
          items,
          start.segmentIndex,
          start.graphemeIndex,
          end.segmentIndex,
          end.graphemeIndex,
        )
      );
    }

    return Math.max(peak, width);
  };

  return {
    fitTo: end => measure(end, true),
    paintTo: end => measure(end, false),
  };
}

/**
 * Width the line paints: item advances with the gap of a seam charged to the
 * glyph before it, the hyphen of a discretionary end, and a trailing
 * collapsible space dropped. `originLeft` is the left edge of the line inside
 * the paragraph, which the tab stops of the line stand at multiples of.
 *
 * @example
 * ```ts
 * const width = measureLineSpan(items, {
 *   start: {segmentIndex: 0, graphemeIndex: 0},
 *   end: {segmentIndex: 4, graphemeIndex: 0},
 * });
 * ```
 */
export function measureLineSpan(
  items: ParagraphItems,
  span: LineSpan,
  originLeft = 0,
): number {
  return measureLineSpansFrom(items, span.start, originLeft).paintTo(span.end);
}

/**
 * Width a break pass tests against the line's free width: the widest a
 * candidate of the line has to be, which the walk tests item by item. It
 * differs from the painted width in what hangs past the edge: a preserved
 * space, a tab stop and the gap behind the last glyph.
 *
 * @example
 * ```ts
 * const fits = measureLineSpanFit(items, span) <= maxWidth;
 * ```
 */
export function measureLineSpanFit(
  items: ParagraphItems,
  span: LineSpan,
  originLeft = 0,
): number {
  return measureLineSpansFrom(items, span.start, originLeft).fitTo(span.end);
}
