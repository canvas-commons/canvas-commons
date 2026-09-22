/**
 * One paragraph of several metric tuples, as one item list.
 *
 * The normalized text is prepared once per distinct tuple. The preparations
 * agree item for item, so they merge; an item that holds a metric seam or an
 * inline box inside it is refined into pieces that each take their numbers
 * from the preparation that owns them. A refined seam is joined, so it offers
 * the line walker no break the unrefined item did not already have, and takes
 * none away: a cut that lands on a break the item already offered keeps it. An
 * inline box joins nothing, because a line may break on either side of it.
 */
import type {
  InlineObject,
  ParagraphContent,
  RunMetrics,
  WhiteSpaceMode,
} from './paragraphContent';
import type {
  ItemHandleRange,
  ParagraphChunk,
  ParagraphItemKind,
  ParagraphItems,
} from './paragraphItems';
import type {
  ParagraphMeasurer,
  ParagraphMetrics,
  PreparedParagraph,
  WordBreakMode,
} from './preparedParagraph';
import {
  composedGraphemeAdvances,
  slicePaintAdvances,
} from './preparedParagraph';
import {segment} from './segmenter';

/** What every preparation of one paragraph holds constant. */
export type ParagraphShape = {
  readonly whiteSpace: WhiteSpaceMode;
  readonly wordBreak: WordBreakMode;
  /** Metrics of a paragraph whose runs contribute no character. */
  readonly metrics: RunMetrics;
};

export type MixedParagraph = {
  /** One preparation per distinct metric tuple, in first-use order. */
  readonly preparations: readonly PreparedParagraph[];
  readonly items: ParagraphItems;
};

/**
 * Pretext has no `pre-line` mode. The text is collapsed before it gets here,
 * so `pre-wrap` keeps what is left of it unchanged. A space at a line end is
 * therefore preserved where CSS would drop it.
 */
function preparationWhiteSpace(
  mode: WhiteSpaceMode,
): ParagraphMetrics['whiteSpace'] {
  return mode === 'normal' ? 'normal' : 'pre-wrap';
}

function fail(reason: string): never {
  throw new Error(`Paragraph preparations disagree: ${reason}.`);
}

function sameShape(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function checkAgreement(
  base: PreparedParagraph,
  other: PreparedParagraph,
): void {
  if (base.text !== other.text) fail('the normalized text differs');
  const a = base.items;
  const b = other.items;
  if (!sameShape(a.kinds, b.kinds)) fail('the break kinds differ');
  if (!sameShape(a.sourceStarts, b.sourceStarts)) {
    fail('the item ranges differ');
  }
  if (!sameShape(a.sourceEnds, b.sourceEnds)) fail('the item ranges differ');
  if (!sameShape(a.chunks, b.chunks)) fail('the hard-break chunks differ');
  if (!sameShape(a.breakablePreferredBreaks, b.breakablePreferredBreaks)) {
    fail('the preferred breaks differ');
  }
  const rows = (items: ParagraphItems) =>
    items.breakableFitAdvances.map(row => (row === null ? -1 : row.length));
  if (!sameShape(rows(a), rows(b))) fail('the grapheme rows differ');
}

function metricsKey(metrics: RunMetrics): string {
  return `${metrics.letterSpacing}px ${metrics.font}`;
}

/** Graphemes of a segment that carry the letter-spacing gaps after them. */
function countRenderedGraphemes(text: string, kind: ParagraphItemKind): number {
  if (
    kind === 'zero-width-break' ||
    kind === 'soft-hyphen' ||
    kind === 'hard-break'
  ) {
    return 0;
  }
  if (kind === 'tab') return 1;
  return segment(text, 'grapheme').length;
}

function isBlankKind(kind: ParagraphItemKind): boolean {
  return (
    kind === 'space' ||
    kind === 'preserved-space' ||
    kind === 'zero-width-break'
  );
}

type Piece = {
  readonly kind: ParagraphItemKind;
  readonly owner: number;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly box: {width: number; height: number} | null;
};

/** First grapheme boundary at or after `offset`, or `null` past the last one. */
function snapForward(
  graphemeStarts: readonly number[],
  offset: number,
): number | null {
  for (const start of graphemeStarts) {
    if (start >= offset) return start;
  }
  return null;
}

/** Whether anything inside `[start, end)` can cut the segment into pieces. */
function mayRefine<TOwner, TPaint>(
  content: ParagraphContent<TOwner, TPaint>,
  start: number,
  end: number,
): boolean {
  for (const span of content.metricSpans) {
    if (span.start > start && span.start < end) return true;
  }
  for (const object of content.objects) {
    if (object.at >= start && object.at < end) return true;
  }
  return false;
}

/**
 * Offsets inside `[start, end)` where the items must be cut. A metric seam
 * moves forward to a grapheme boundary, so a grapheme keeps the metrics of
 * its first character and no emergency break moves. An object marker is a
 * hard boundary and does not move: it owns exactly its own character.
 */
function refinementOffsets<TOwner, TPaint>(
  content: ParagraphContent<TOwner, TPaint>,
  start: number,
  end: number,
  graphemeStarts: readonly number[],
): number[] {
  const cuts = new Set<number>();
  const keep = (at: number | null) => {
    if (at !== null && at > start && at < end) cuts.add(at);
  };
  for (const span of content.metricSpans) {
    if (span.start > start && span.start < end) {
      keep(snapForward(graphemeStarts, span.start));
    }
  }
  for (const object of content.objects) {
    if (object.at >= start && object.at < end) {
      keep(object.at);
      keep(object.at + 1);
    }
  }
  return [...cuts].sort((a, b) => a - b);
}

/**
 * Cursor range of `[from, to)` inside the segment at `segmentIndex`, with the
 * UTF-16 units of a partly held grapheme named as trims.
 */
function handleRangeOf(
  segmentIndex: number,
  graphemeStarts: readonly number[],
  segmentEnd: number,
  from: number,
  to: number,
): ItemHandleRange {
  const whole: ItemHandleRange = {
    start: {segmentIndex, graphemeIndex: 0},
    end: {segmentIndex: segmentIndex + 1, graphemeIndex: 0},
    startTrim: 0,
    endTrim: 0,
  };
  if (graphemeStarts.length === 0) return whole;
  let first = 0;
  while (
    first + 1 < graphemeStarts.length &&
    graphemeStarts[first + 1] <= from
  ) {
    first++;
  }
  let last = first;
  while (last + 1 < graphemeStarts.length && graphemeStarts[last + 1] < to) {
    last++;
  }
  const past = last + 1;
  const lastEnd =
    past < graphemeStarts.length ? graphemeStarts[past] : segmentEnd;
  return {
    start: {segmentIndex, graphemeIndex: first},
    end:
      past === graphemeStarts.length
        ? {segmentIndex: segmentIndex + 1, graphemeIndex: 0}
        : {segmentIndex, graphemeIndex: past},
    startTrim: from - graphemeStarts[first],
    endTrim: lastEnd - to,
  };
}

/**
 * Grapheme advances of a piece, measured inside the piece alone, so a seam
 * carries no shaping context from text another font paints.
 */
function pieceAdvances(
  text: string,
  metrics: ParagraphMetrics,
  measurer: ParagraphMeasurer,
): number[] {
  return composedGraphemeAdvances(text, one =>
    measurer.measureAdvance(one, metrics),
  );
}

/** Source offsets a segment's own preferred breaks stand at. */
function preferredBreakOffsets(
  segmentBreaks: readonly number[] | null,
  graphemeStarts: readonly number[],
  segmentEnd: number,
): Set<number> {
  const offsets = new Set<number>();
  for (const value of segmentBreaks ?? []) {
    offsets.add(
      value < graphemeStarts.length ? graphemeStarts[value] : segmentEnd,
    );
  }
  return offsets;
}

/** Preferred breaks of a segment, as grapheme ends of one piece of it. */
function piecePreferredBreaks(
  segmentBreaks: readonly number[],
  graphemeStarts: readonly number[],
  segmentEnd: number,
  from: number,
  to: number,
  text: string,
): number[] {
  const endsAt = new Map<number, number>();
  let index = 0;
  for (const grapheme of segment(text, 'grapheme')) {
    index++;
    endsAt.set(from + grapheme.index + grapheme.segment.length, index);
  }
  const breaks: number[] = [];
  for (const value of segmentBreaks) {
    const offset =
      value < graphemeStarts.length ? graphemeStarts[value] : segmentEnd;
    if (offset <= from || offset > to) continue;
    const mapped = endsAt.get(offset);
    if (mapped !== undefined) breaks.push(mapped);
  }
  return breaks;
}

function objectAt<TOwner, TPaint>(
  content: ParagraphContent<TOwner, TPaint>,
  start: number,
  end: number,
): InlineObject<TOwner, TPaint> | null {
  for (const object of content.objects) {
    if (object.at >= start && object.at < end) return object;
  }
  return null;
}

/**
 * Prepare one paragraph in every metric tuple its runs ask for and merge the
 * results into one item list.
 *
 * @example
 * ```ts
 * const mixed = prepareMixedParagraph(content, shape, canvasParagraphMeasurer);
 * walkPreparedLinesRaw(mixed.items, 240, () => {});
 * ```
 */
export function prepareMixedParagraph<TOwner, TPaint>(
  content: ParagraphContent<TOwner, TPaint>,
  shape: ParagraphShape,
  measurer: ParagraphMeasurer,
): MixedParagraph {
  const preparations: PreparedParagraph[] = [];
  const byKey = new Map<string, number>();
  const ownerOfSpan: number[] = [];
  for (const span of content.metricSpans) {
    const key = metricsKey(span.metrics);
    let index = byKey.get(key);
    if (index === undefined) {
      const metrics: ParagraphMetrics = {
        font: span.metrics.font,
        whiteSpace: preparationWhiteSpace(shape.whiteSpace),
        wordBreak: shape.wordBreak,
        letterSpacing: span.metrics.letterSpacing,
      };
      index = preparations.length;
      preparations.push(measurer.prepare(content.text, metrics));
      byKey.set(key, index);
    }
    ownerOfSpan.push(index);
  }
  if (preparations.length === 0) {
    preparations.push(
      measurer.prepare(content.text, {
        font: shape.metrics.font,
        whiteSpace: preparationWhiteSpace(shape.whiteSpace),
        wordBreak: shape.wordBreak,
        letterSpacing: shape.metrics.letterSpacing,
      }),
    );
  }
  const base = preparations[0];
  for (let p = 1; p < preparations.length; p++) {
    checkAgreement(base, preparations[p]);
  }

  const paintAdvancesOf = (
    items: Pick<ParagraphItems, 'sourceStarts' | 'sourceEnds' | 'owners'>,
  ) =>
    slicePaintAdvances(
      index =>
        content.text.slice(items.sourceStarts[index], items.sourceEnds[index]),
      (text, index) =>
        measurer.measureAdvance(
          text,
          preparations[items.owners[index]].metrics,
        ),
    );

  // Nothing cuts an item, so every item is its preparation's own segment.
  if (
    preparations.length === 1 &&
    content.objects.length === 0 &&
    base.text === content.text &&
    base.items.breakablePreferredBreaks.every(
      row => row === null || row.length > 0,
    )
  ) {
    return {
      preparations,
      items: {...base.items, paintAdvanceOf: paintAdvancesOf(base.items)},
    };
  }

  const ownerAt = (offset: number): number => {
    for (let s = content.metricSpans.length - 1; s >= 0; s--) {
      if (content.metricSpans[s].start <= offset) return ownerOfSpan[s];
    }
    return 0;
  };

  const kinds: ParagraphItemKind[] = [];
  const joinsPrevious: boolean[] = [];
  const owners: number[] = [];
  const boxHeights: number[] = [];
  const sourceStarts: number[] = [];
  const sourceEnds: number[] = [];
  const handleRanges: ItemHandleRange[] = [];
  const widths: number[] = [];
  const lineEndFitAdvances: number[] = [];
  const lineEndPaintAdvances: number[] = [];
  const breakableFitAdvances: (readonly number[] | null)[] = [];
  const breakablePreferredBreaks: (readonly number[] | null)[] = [];
  const spacingGraphemeCounts: number[] = [];
  const letterSpacings: number[] = [];
  const discretionaryHyphenWidths: number[] = [];
  const tabStopAdvances: number[] = [];
  const itemStartOfSegment: number[] = [];

  const baseItems = base.items;
  const segmentCount = baseItems.kinds.length;
  let refined = false;
  let boxed = false;

  for (let i = 0; i < segmentCount; i++) {
    itemStartOfSegment.push(kinds.length);
    const start = baseItems.sourceStarts[i];
    const end = baseItems.sourceEnds[i];
    const text = content.text.slice(start, end);
    // Only a segment something cuts needs its grapheme boundaries; a whole
    // item reads its numbers straight out of the preparation that owns it.
    const graphemeStarts = mayRefine(content, start, end)
      ? segment(text, 'grapheme').map(g => start + g.index)
      : [];
    const cuts = refinementOffsets(content, start, end, graphemeStarts);

    const bounds = [start, ...cuts, end];
    const pieces: Piece[] = [];
    for (let b = 0; b + 1 < bounds.length; b++) {
      const from = bounds[b];
      const to = bounds[b + 1];
      const object = objectAt(content, from, to);
      pieces.push({
        kind: object === null ? baseItems.kinds[i] : 'inline-box',
        owner: ownerAt(from),
        sourceStart: from,
        sourceEnd: to,
        box:
          object === null ? null : {width: object.width, height: object.height},
      });
    }
    if (cuts.length > 0) {
      refined = true;
      if (
        baseItems.kinds[i] === 'tab' ||
        baseItems.kinds[i] === 'hard-break' ||
        baseItems.kinds[i] === 'soft-hyphen'
      ) {
        fail(`a ${baseItems.kinds[i]} item cannot be refined`);
      }
    }

    const segmentRow = baseItems.breakableFitAdvances[i];
    const segmentBreaks = baseItems.breakablePreferredBreaks[i];
    // A cut that lands on a break the segment already offered keeps it: the
    // refinement may not take a break away from the line walker.
    const breakOffsets = preferredBreakOffsets(
      segmentBreaks,
      graphemeStarts,
      end,
    );
    for (let p = 0; p < pieces.length; p++) {
      const piece = pieces[p];
      if (piece.box !== null) boxed = true;
      const owned = preparations[piece.owner];
      const spacing = owned.metrics.letterSpacing;
      const pieceText = content.text.slice(piece.sourceStart, piece.sourceEnd);
      const whole = pieces.length === 1 && piece.box === null;
      const rendered = whole
        ? owned.items.spacingGraphemeCounts[i]
        : piece.box !== null
          ? 1
          : countRenderedGraphemes(pieceText, piece.kind);
      const width = whole
        ? owned.items.widths[i]
        : piece.box !== null
          ? piece.box.width
          : measurer.measureAdvance(pieceText, owned.metrics) +
            (rendered > 1 ? (rendered - 1) * spacing : 0);
      const fitBase = isBlankKind(piece.kind) ? 0 : width;

      kinds.push(piece.kind);
      joinsPrevious.push(
        p > 0 &&
          piece.box === null &&
          pieces[p - 1].box === null &&
          !breakOffsets.has(piece.sourceStart),
      );
      owners.push(piece.owner);
      boxHeights.push(piece.box?.height ?? 0);
      sourceStarts.push(piece.sourceStart);
      sourceEnds.push(piece.sourceEnd);
      handleRanges.push(
        handleRangeOf(
          i,
          graphemeStarts,
          end,
          piece.sourceStart,
          piece.sourceEnd,
        ),
      );
      widths.push(width);
      lineEndFitAdvances.push(
        whole
          ? owned.items.lineEndFitAdvances[i]
          : fitBase === 0
            ? 0
            : fitBase + (rendered > 0 ? spacing : 0),
      );
      lineEndPaintAdvances.push(
        whole
          ? owned.items.lineEndPaintAdvances[i]
          : piece.kind === 'space' || piece.kind === 'zero-width-break'
            ? 0
            : width,
      );
      if (piece.box !== null || segmentRow === null) {
        breakableFitAdvances.push(null);
        breakablePreferredBreaks.push(null);
      } else {
        const row = whole
          ? (owned.items.breakableFitAdvances[i] ?? segmentRow)
          : pieceAdvances(pieceText, owned.metrics, measurer);
        breakableFitAdvances.push(row.length === 0 ? null : row);
        const breaks = whole
          ? (segmentBreaks ?? [])
          : piecePreferredBreaks(
              segmentBreaks ?? [],
              graphemeStarts,
              end,
              piece.sourceStart,
              piece.sourceEnd,
              pieceText,
            );
        breakablePreferredBreaks.push(
          row.length === 0 || breaks.length === 0 ? null : breaks,
        );
      }
      spacingGraphemeCounts.push(rendered);
      letterSpacings.push(spacing);
      discretionaryHyphenWidths.push(owned.items.discretionaryHyphenWidths[i]);
      tabStopAdvances.push(owned.items.tabStopAdvances[i]);
    }
  }
  itemStartOfSegment.push(kinds.length);

  const chunks: ParagraphChunk[] = baseItems.chunks.map(chunk => ({
    startSegmentIndex: itemStartOfSegment[chunk.startSegmentIndex],
    endSegmentIndex: itemStartOfSegment[chunk.endSegmentIndex],
    consumedEndSegmentIndex: itemStartOfSegment[chunk.consumedEndSegmentIndex],
  }));

  return {
    preparations,
    items: {
      kinds,
      joinsPrevious,
      owners,
      boxHeights,
      sourceStarts,
      sourceEnds,
      handleRangeOf: index => handleRanges[index],
      widths,
      lineEndFitAdvances,
      lineEndPaintAdvances,
      breakableFitAdvances,
      paintAdvanceOf: paintAdvancesOf({sourceStarts, sourceEnds, owners}),
      breakablePreferredBreaks,
      spacingGraphemeCounts,
      letterSpacings,
      discretionaryHyphenWidths,
      tabStopAdvances,
      simpleLineWalkFastPath:
        !refined &&
        !boxed &&
        preparations.every(one => one.items.simpleLineWalkFastPath),
      chunks,
    },
  };
}
