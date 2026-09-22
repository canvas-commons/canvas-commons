// Copied from @chenglou/pretext 0.0.9, src/line-break.ts, commit
// 8460bf940c50d82be90a396fb0ea2c4e7a2dc6f3, under the MIT license in
// ./LICENSE. Function names and upstream line ranges are in ./UPSTREAM.json,
// which a unit test checks against the installed package.
import type {
  ParagraphCursor,
  ParagraphItemKind,
  ParagraphItems,
} from '../paragraphItems';
import {getEngineProfile} from './engineProfile';

export type LineBreakCursor = {
  segmentIndex: number;
  graphemeIndex: number;
};

/** Free band a candidate line runs in. */
export type LineBreakBand = {
  /** Width the candidate has to fit. */
  readonly width: number;
  /** True when an exclusion, and not the content box, bounds the band. */
  readonly hardEdge: boolean;
};

/** Rules a line needs that upstream, with one width and no exclusion, has not. */
export type LineBreakOptions = {
  /**
   * Band of the candidate line that holds every item through `throughItem`,
   * and the hard break that closes the chunk when `consumesHardBreak`. Asked
   * for before each candidate is tested, so a band that narrows as the line
   * grows taller is the band the emitted line occupies. Absent, `maxWidth`
   * holds for the whole line and no edge is hard.
   */
  readonly bandAt?: (
    throughItem: number,
    consumesHardBreak: boolean,
  ) => LineBreakBand;
  /**
   * False forbids a break at an arbitrary grapheme, so a unit wider than the
   * line stays whole and overflows, and the space behind it hangs on its
   * line: CSS `overflow-wrap: normal`.
   */
  readonly emergencyBreaks?: boolean;
  /**
   * Left edge of the line inside the paragraph. Tab stops stand at multiples
   * of the stop advance from the paragraph origin, so a line that starts
   * beside an exclusion reaches the same stops as one that starts at 0.
   */
  readonly originLeft?: number;
  /**
   * True ends a line at a break the unit in front of it offers inside itself
   * when the line reaches one, so `a www.abc-def.com` in 100 pixels ends at
   * `a www.abc-`. Upstream takes the break behind that unit and leaves `a`
   * alone on the line.
   */
  readonly internalBreaks?: boolean;
};

/**
 * What a grapheme walk does with a candidate the line can no longer hold and
 * no break inside the item answers: break at the grapheme, run on to the next
 * legal break, or report that the item offers the line nothing.
 */
type OverflowRule = 'break' | 'run-on' | 'give-up';

/** What a candidate walk changes, so a walk that finds nothing undoes itself. */
type LineWalkState = {
  lineW: number;
  hasContent: boolean;
  lineEndSegmentIndex: number;
  lineEndGraphemeIndex: number;
  fitLimit: number;
};

type InternalLineVisitor = (
  width: number,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
) => void;

// End cursors consume source. A terminal SHY is not a selected wrap, even
// though it is the final consumed segment. Rendering derives that distinction
// from the endpoint instead of treating every consumed SHY as visible.
export function isDiscretionaryLineEnd(
  kinds: readonly ParagraphItemKind[],
  endSegmentIndex: number,
  endGraphemeIndex: number,
): boolean {
  return (
    endGraphemeIndex === 0 &&
    endSegmentIndex > 0 &&
    endSegmentIndex < kinds.length &&
    kinds[endSegmentIndex - 1] === 'soft-hyphen'
  );
}

function consumesAtLineStart(kind: ParagraphItemKind): boolean {
  return (
    kind === 'space' || kind === 'zero-width-break' || kind === 'soft-hyphen'
  );
}

export function breaksAfter(kind: ParagraphItemKind): boolean {
  return (
    kind === 'space' ||
    kind === 'preserved-space' ||
    kind === 'tab' ||
    kind === 'zero-width-break' ||
    kind === 'soft-hyphen' ||
    kind === 'inline-box'
  );
}

/**
 * Whether a line may end in front of this item. Segmentation puts a boundary
 * where a break is legal, so an item starts a unit unless it carries the
 * break of the text before it: a soft hyphen needs its hyphen painted, and
 * glue holds two items together.
 */
function beginsUnit(kind: ParagraphItemKind): boolean {
  return kind !== 'soft-hyphen' && kind !== 'glue';
}

function normalizeLineStartSegmentIndex(
  prepared: ParagraphItems,
  segmentIndex: number,
  endSegmentIndex = prepared.widths.length,
): number {
  while (segmentIndex < endSegmentIndex) {
    const kind = prepared.kinds[segmentIndex];
    if (!consumesAtLineStart(kind)) break;
    segmentIndex++;
  }
  return segmentIndex;
}

export function getTabAdvance(
  lineWidth: number,
  tabStopAdvance: number,
): number {
  if (tabStopAdvance <= 0) return 0;

  const remainder = lineWidth % tabStopAdvance;
  if (Math.abs(remainder) <= 1e-6) return tabStopAdvance;
  return tabStopAdvance - remainder;
}

function rendersGraphemes(kind: ParagraphItemKind): boolean {
  return (
    kind !== 'zero-width-break' &&
    kind !== 'soft-hyphen' &&
    kind !== 'hard-break'
  );
}

/** Last item on the line that rendered a glyph, or -1 when there is none. */
function getPrecedingRenderingIndex(
  prepared: ParagraphItems,
  lineStartSegmentIndex: number,
  segmentIndex: number,
): number {
  for (let i = segmentIndex - 1; i >= lineStartSegmentIndex; i--) {
    if (rendersGraphemes(prepared.kinds[i])) return i;
  }
  return -1;
}

/** Letter spacing of the last item that rendered a glyph on the line. */
function getPrecedingLetterSpacing(
  prepared: ParagraphItems,
  lineStartSegmentIndex: number,
  segmentIndex: number,
): number {
  const preceding = getPrecedingRenderingIndex(
    prepared,
    lineStartSegmentIndex,
    segmentIndex,
  );
  return prepared.letterSpacings[preceding < 0 ? segmentIndex : preceding];
}

/**
 * Width a soft hyphen adds to the line it ends. The hyphen is drawn in the
 * soft hyphen's own styling, and only the gap in front of it belongs to the
 * glyph before it; upstream stores the width with the hyphen's own spacing on
 * both sides.
 */
export function getDiscretionaryHyphenWidth(
  prepared: ParagraphItems,
  lineStartSegmentIndex: number,
  segmentIndex: number,
): number {
  const parts = getDiscretionaryHyphenParts(
    prepared,
    lineStartSegmentIndex,
    segmentIndex,
  );
  return parts.leading + parts.hyphen;
}

/**
 * The same width, split where it is painted: `leading` is the gap the glyph
 * before the hyphen owns, `hyphen` the hyphen's own platform advance. A pen
 * that paints the hyphen stands past the gap, not inside it.
 *
 * @example
 * ```ts
 * const {leading, hyphen} = getDiscretionaryHyphenParts(items, 0, 3);
 * ```
 */
export function getDiscretionaryHyphenParts(
  prepared: ParagraphItems,
  lineStartSegmentIndex: number,
  segmentIndex: number,
): {leading: number; hyphen: number} {
  const preceding = getPrecedingRenderingIndex(
    prepared,
    lineStartSegmentIndex,
    segmentIndex,
  );
  const width = prepared.discretionaryHyphenWidths[segmentIndex];
  return preceding < 0
    ? {leading: 0, hyphen: width}
    : {
        leading: prepared.letterSpacings[preceding],
        hyphen: width - prepared.letterSpacings[segmentIndex],
      };
}

/** Letter spacing of the gap before an item, owned by the glyph before it. */
export function getLeadingLetterSpacing(
  prepared: ParagraphItems,
  hasContent: boolean,
  lineStartSegmentIndex: number,
  segmentIndex: number,
): number {
  return hasContent && rendersGraphemes(prepared.kinds[segmentIndex])
    ? getPrecedingLetterSpacing(prepared, lineStartSegmentIndex, segmentIndex)
    : 0;
}

function getLineEndContribution(
  leadingSpacing: number,
  segmentContribution: number,
): number {
  return segmentContribution === 0 ? 0 : leadingSpacing + segmentContribution;
}

function getTabTrailingLetterSpacing(
  prepared: ParagraphItems,
  segmentIndex: number,
): number {
  return prepared.letterSpacings[segmentIndex] !== 0 &&
    prepared.spacingGraphemeCounts[segmentIndex] > 0
    ? prepared.letterSpacings[segmentIndex]
    : 0;
}

export function getWholeSegmentFitContribution(
  prepared: ParagraphItems,
  kind: ParagraphItemKind,
  segmentIndex: number,
  leadingSpacing: number,
  segmentWidth: number,
): number {
  const segmentContribution =
    kind === 'tab'
      ? segmentWidth + getTabTrailingLetterSpacing(prepared, segmentIndex)
      : prepared.lineEndFitAdvances[segmentIndex];
  return getLineEndContribution(leadingSpacing, segmentContribution);
}

export function getBreakOpportunityFitContribution(
  prepared: ParagraphItems,
  kind: ParagraphItemKind,
  segmentIndex: number,
  leadingSpacing: number,
): number {
  const segmentContribution =
    kind === 'tab' ? 0 : prepared.lineEndFitAdvances[segmentIndex];
  return getLineEndContribution(leadingSpacing, segmentContribution);
}

export function getLineEndPaintContribution(
  prepared: ParagraphItems,
  kind: ParagraphItemKind,
  segmentIndex: number,
  leadingSpacing: number,
  segmentWidth: number,
): number {
  const segmentContribution =
    kind === 'tab' ? segmentWidth : prepared.lineEndPaintAdvances[segmentIndex];
  return getLineEndContribution(leadingSpacing, segmentContribution);
}

/** Inside an item the gap before a grapheme belongs to the one before it. */
function getBreakableGraphemeAdvance(
  prepared: ParagraphItems,
  segmentIndex: number,
  baseAdvance: number,
): number {
  return baseAdvance + prepared.letterSpacings[segmentIndex];
}

function getBreakableCandidateFitWidth(
  prepared: ParagraphItems,
  segmentIndex: number,
  candidatePaintWidth: number,
): number {
  return prepared.letterSpacings[segmentIndex] === 0
    ? candidatePaintWidth
    : candidatePaintWidth + prepared.letterSpacings[segmentIndex];
}

// A caller reaches a breakable item only after it reads the row as present.
export function getBreakableFitAdvances(
  prepared: ParagraphItems,
  segmentIndex: number,
): readonly number[] {
  const fitAdvances = prepared.breakableFitAdvances[segmentIndex];
  if (fitAdvances === null) {
    throw new Error(`Item ${segmentIndex} has no grapheme advances.`);
  }
  return fitAdvances;
}

/**
 * What the graphemes `[from, to)` of an item paint beyond the fit advances of
 * those graphemes: the slice is shaped whole, so it keeps the kerning a row
 * measured grapheme by grapheme leaves out. `to` of -1 reaches the item's end.
 *
 * @example
 * ```ts
 * const paint = fit + getPartialPaintCorrection(items, 3, 0, 3);
 * ```
 */
export function getPartialPaintCorrection(
  prepared: ParagraphItems,
  segmentIndex: number,
  from: number,
  to: number,
): number {
  const row = prepared.breakableFitAdvances[segmentIndex];
  if (row === null) return 0;
  const until = to < 0 ? row.length : to;
  if (from === 0 && until === row.length) return 0;
  let apart = 0;
  for (let g = from; g < until; g++) apart += row[g];
  return prepared.paintAdvanceOf(segmentIndex, from, until) - apart;
}

function getNextPreferredBreakIndex(
  preferredBreaks: readonly number[],
  preferredBreakIndex: number,
  graphemeEnd: number,
): number {
  let lo = preferredBreakIndex;
  if (lo >= preferredBreaks.length || preferredBreaks[lo] >= graphemeEnd) {
    return lo;
  }

  // Simple batch walking carries the next boundary. The shared complex loop
  // and public continuations seek instead of rescanning every prior cut.
  let hi = preferredBreaks.length;
  lo++;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (preferredBreaks[mid] < graphemeEnd) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Whether an item offers a break strictly inside itself, which is a break no
 * item boundary carries.
 *
 * @example
 * ```ts
 * const hyphenated = offersInternalBreak(items, 3);
 * ```
 */
export function offersInternalBreak(
  prepared: ParagraphItems,
  index: number,
): boolean {
  return internalBreakGraphemes(prepared, index).length > 0;
}

/**
 * Grapheme ends a line may stop at strictly inside an item, in order. A break
 * at the item's own end is the boundary behind it and is not one of these.
 *
 * @example
 * ```ts
 * const inside = internalBreakGraphemes(items, 3);
 * ```
 */
export function internalBreakGraphemes(
  prepared: ParagraphItems,
  index: number,
): readonly number[] {
  const breaks = prepared.breakablePreferredBreaks[index];
  const advances = prepared.breakableFitAdvances[index];
  if (breaks === null || advances === null) return [];
  return breaks.filter(at => at > 0 && at < advances.length);
}

/**
 * Whether any item of the paragraph offers a break inside itself, which is
 * what turns {@link LineBreakOptions.internalBreaks} on for a pass.
 *
 * @example
 * ```ts
 * const internalBreaks = offersInternalBreaks(items);
 * ```
 */
export function offersInternalBreaks(prepared: ParagraphItems): boolean {
  return prepared.kinds.some((_, index) =>
    offersInternalBreak(prepared, index),
  );
}

/** Whether a line that ends here ends on a break the item offers inside it. */
function endsAtPreferredBreak(
  prepared: ParagraphItems,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): boolean {
  const index = endGraphemeIndex === 0 ? endSegmentIndex - 1 : endSegmentIndex;
  const breaks = prepared.breakablePreferredBreaks[index] ?? null;
  if (breaks === null) return false;
  const at =
    endGraphemeIndex === 0
      ? (prepared.breakableFitAdvances[index]?.length ?? -1)
      : endGraphemeIndex;
  return breaks.includes(at);
}

/** Whether a line that ends at this cursor ends where a break is legal. */
export function endsLineLegally(
  prepared: ParagraphItems,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): boolean {
  if (endGraphemeIndex > 0) {
    return endsAtPreferredBreak(prepared, endSegmentIndex, endGraphemeIndex);
  }
  if (endSegmentIndex <= 0) return false;
  // Nothing follows a hard break on its line.
  if (prepared.kinds[endSegmentIndex - 1] === 'hard-break') return true;
  if (breaksAfter(prepared.kinds[endSegmentIndex - 1])) return true;
  if (endSegmentIndex >= prepared.kinds.length) return true;
  return (
    !prepared.joinsPrevious[endSegmentIndex] &&
    beginsUnit(prepared.kinds[endSegmentIndex])
  );
}

/** End of the run of items joined to the one at `index`, exclusive. */
export function getJoinedGroupEnd(
  prepared: ParagraphItems,
  index: number,
  limit: number,
): number {
  let end = index + 1;
  while (end < limit && prepared.joinsPrevious[end]) end++;
  return end;
}

export function getTerminalLetterSpacing(
  prepared: ParagraphItems,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): number {
  if (endGraphemeIndex > 0) {
    return prepared.spacingGraphemeCounts[endSegmentIndex] > 0
      ? prepared.letterSpacings[endSegmentIndex]
      : 0;
  }

  if (
    isDiscretionaryLineEnd(prepared.kinds, endSegmentIndex, endGraphemeIndex)
  ) {
    return 0;
  }

  for (let i = endSegmentIndex - 1; i >= startSegmentIndex; i--) {
    const kind = prepared.kinds[i];
    if (
      kind === 'space' ||
      kind === 'zero-width-break' ||
      kind === 'hard-break' ||
      kind === 'soft-hyphen'
    ) {
      continue;
    }

    if (i === startSegmentIndex && startGraphemeIndex > 0) {
      return prepared.letterSpacings[i];
    }

    return prepared.spacingGraphemeCounts[i] > 0
      ? prepared.letterSpacings[i]
      : 0;
  }

  return 0;
}

function finalizeLinePaintWidth(
  prepared: ParagraphItems,
  width: number,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): number {
  return (
    width +
    getTerminalLetterSpacing(
      prepared,
      startSegmentIndex,
      startGraphemeIndex,
      endSegmentIndex,
      endGraphemeIndex,
    )
  );
}

function findChunkIndexForStart(
  prepared: ParagraphItems,
  segmentIndex: number,
): number {
  let lo = 0;
  let hi = prepared.chunks.length;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (segmentIndex < prepared.chunks[mid].consumedEndSegmentIndex) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  return lo < prepared.chunks.length ? lo : -1;
}

function normalizeLineStartInChunk(
  prepared: ParagraphItems,
  chunkIndex: number,
  cursor: LineBreakCursor,
): number {
  let segmentIndex = cursor.segmentIndex;
  if (cursor.graphemeIndex > 0) return chunkIndex;

  // Consumed-only chunks can occur consecutively. Normalize through each of
  // them before entering the walker, while keeping actual empty hard-break
  // chunks observable as empty lines.
  for (
    let currentChunkIndex = chunkIndex;
    currentChunkIndex < prepared.chunks.length;
    currentChunkIndex++
  ) {
    const chunk = prepared.chunks[currentChunkIndex];
    if (
      chunk.startSegmentIndex === chunk.endSegmentIndex &&
      segmentIndex === chunk.startSegmentIndex
    ) {
      cursor.segmentIndex = segmentIndex;
      cursor.graphemeIndex = 0;
      return currentChunkIndex;
    }

    if (segmentIndex < chunk.startSegmentIndex) {
      segmentIndex = chunk.startSegmentIndex;
    }
    segmentIndex = normalizeLineStartSegmentIndex(
      prepared,
      segmentIndex,
      chunk.endSegmentIndex,
    );
    if (segmentIndex < chunk.endSegmentIndex) {
      cursor.segmentIndex = segmentIndex;
      cursor.graphemeIndex = 0;
      return currentChunkIndex;
    }

    if (chunk.consumedEndSegmentIndex >= prepared.widths.length) return -1;
    segmentIndex = chunk.consumedEndSegmentIndex;
    cursor.segmentIndex = segmentIndex;
    cursor.graphemeIndex = 0;
  }
  return -1;
}

// Mutates `cursor` to the next renderable line start and returns its chunk index.
export function normalizePreparedLineStart(
  prepared: ParagraphItems,
  cursor: LineBreakCursor,
): number {
  if (cursor.segmentIndex >= prepared.widths.length) return -1;

  const chunkIndex = findChunkIndexForStart(prepared, cursor.segmentIndex);
  if (chunkIndex < 0) return -1;
  return normalizeLineStartInChunk(prepared, chunkIndex, cursor);
}

function normalizeLineStartChunkIndexFromHint(
  prepared: ParagraphItems,
  chunkIndex: number,
  cursor: LineBreakCursor,
): number {
  if (cursor.segmentIndex >= prepared.widths.length) return -1;

  let nextChunkIndex = chunkIndex;
  while (
    nextChunkIndex < prepared.chunks.length &&
    cursor.segmentIndex >=
      prepared.chunks[nextChunkIndex].consumedEndSegmentIndex
  ) {
    nextChunkIndex++;
  }
  if (nextChunkIndex >= prepared.chunks.length) return -1;
  return normalizeLineStartInChunk(prepared, nextChunkIndex, cursor);
}

export function countPreparedLines(
  prepared: ParagraphItems,
  maxWidth: number,
): number {
  return walkPreparedLinesRaw(prepared, maxWidth);
}

function walkPreparedLinesSimple(
  prepared: ParagraphItems,
  maxWidth: number,
  onLine?: InternalLineVisitor,
): number {
  const {widths, kinds, breakableFitAdvances, breakablePreferredBreaks} =
    prepared;
  if (widths.length === 0) return 0;

  const engineProfile = getEngineProfile();
  const lineFitEpsilon = engineProfile.lineFitEpsilon;
  const fitLimit = maxWidth + lineFitEpsilon;

  let lineCount = 0;
  let lineW = 0;
  let hasContent = false;
  let lineStartSegmentIndex = 0;
  let lineStartGraphemeIndex = 0;
  let lineEndSegmentIndex = 0;
  let lineEndGraphemeIndex = 0;
  let pendingBreakSegmentIndex = -1;
  let pendingBreakPaintWidth = 0;

  function clearPendingBreak(): void {
    pendingBreakSegmentIndex = -1;
    pendingBreakPaintWidth = 0;
  }

  function emitCurrentLine(
    endSegmentIndex = lineEndSegmentIndex,
    endGraphemeIndex = lineEndGraphemeIndex,
    width = lineW,
  ): void {
    lineCount++;
    onLine?.(
      width,
      lineStartSegmentIndex,
      lineStartGraphemeIndex,
      endSegmentIndex,
      endGraphemeIndex,
    );
    lineW = 0;
    hasContent = false;
    clearPendingBreak();
  }

  function startLineAtSegment(segmentIndex: number, width: number): void {
    hasContent = true;
    lineStartSegmentIndex = segmentIndex;
    lineStartGraphemeIndex = 0;
    lineEndSegmentIndex = segmentIndex + 1;
    lineEndGraphemeIndex = 0;
    lineW = width;
  }

  function startLineAtGrapheme(
    segmentIndex: number,
    graphemeIndex: number,
    width: number,
  ): void {
    hasContent = true;
    lineStartSegmentIndex = segmentIndex;
    lineStartGraphemeIndex = graphemeIndex;
    lineEndSegmentIndex = segmentIndex;
    lineEndGraphemeIndex = graphemeIndex + 1;
    lineW = width;
  }

  function appendWholeSegment(segmentIndex: number, width: number): void {
    if (!hasContent) {
      startLineAtSegment(segmentIndex, width);
      return;
    }
    lineW += width;
    lineEndSegmentIndex = segmentIndex + 1;
    lineEndGraphemeIndex = 0;
  }

  function appendBreakableSegmentFrom(
    segmentIndex: number,
    startGraphemeIndex: number,
  ): void {
    const fitAdvances = getBreakableFitAdvances(prepared, segmentIndex);
    const preferredBreaks = breakablePreferredBreaks[segmentIndex] ?? null;
    let preferredBreakIndex =
      preferredBreaks === null
        ? -1
        : getNextPreferredBreakIndex(
            preferredBreaks,
            0,
            startGraphemeIndex + 1,
          );
    let lastPreferredBreakEnd = -1;
    let lastPreferredBreakWidth = 0;

    let g = startGraphemeIndex;
    while (g < fitAdvances.length) {
      const gw = fitAdvances[g];

      if (!hasContent) {
        startLineAtGrapheme(segmentIndex, g, gw);
      } else if (lineW + gw > fitLimit) {
        if (
          preferredBreaks !== null &&
          lastPreferredBreakEnd > startGraphemeIndex
        ) {
          emitCurrentLine(
            segmentIndex,
            lastPreferredBreakEnd,
            lastPreferredBreakWidth,
          );
          g = lastPreferredBreakEnd;
          preferredBreakIndex = getNextPreferredBreakIndex(
            preferredBreaks,
            preferredBreakIndex,
            g + 1,
          );
          lastPreferredBreakEnd = -1;
          lastPreferredBreakWidth = 0;
          continue;
        }
        emitCurrentLine();
        startLineAtGrapheme(segmentIndex, g, gw);
      } else {
        lineW += gw;
        lineEndSegmentIndex = segmentIndex;
        lineEndGraphemeIndex = g + 1;
      }

      const graphemeEnd = g + 1;
      if (
        preferredBreaks !== null &&
        preferredBreaks[preferredBreakIndex] === graphemeEnd
      ) {
        lastPreferredBreakEnd = graphemeEnd;
        lastPreferredBreakWidth = lineW;
        preferredBreakIndex++;
      }
      g++;
    }

    if (
      hasContent &&
      lineEndSegmentIndex === segmentIndex &&
      lineEndGraphemeIndex === fitAdvances.length
    ) {
      lineEndSegmentIndex = segmentIndex + 1;
      lineEndGraphemeIndex = 0;
    }
  }

  let i = 0;
  while (i < widths.length) {
    if (!hasContent) {
      i = normalizeLineStartSegmentIndex(prepared, i);
      if (i >= widths.length) break;
    }

    const w = widths[i];
    const kind = kinds[i];
    const breakAfter = breaksAfter(kind);

    if (!hasContent) {
      if (w > fitLimit && breakableFitAdvances[i] !== null) {
        appendBreakableSegmentFrom(i, 0);
      } else {
        startLineAtSegment(i, w);
      }
      if (breakAfter) {
        pendingBreakSegmentIndex = i + 1;
        pendingBreakPaintWidth = lineW - w;
      }
      i++;
      continue;
    }

    const newW = lineW + w;
    if (newW > fitLimit) {
      if (breakAfter) {
        appendWholeSegment(i, w);
        emitCurrentLine(i + 1, 0, lineW - w);
        i++;
        continue;
      }

      if (pendingBreakSegmentIndex >= 0) {
        if (
          lineEndSegmentIndex > pendingBreakSegmentIndex ||
          (lineEndSegmentIndex === pendingBreakSegmentIndex &&
            lineEndGraphemeIndex > 0)
        ) {
          emitCurrentLine();
          continue;
        }
        emitCurrentLine(pendingBreakSegmentIndex, 0, pendingBreakPaintWidth);
        continue;
      }

      if (w > fitLimit && breakableFitAdvances[i] !== null) {
        emitCurrentLine();
        appendBreakableSegmentFrom(i, 0);
        i++;
        continue;
      }

      emitCurrentLine();
      continue;
    }

    appendWholeSegment(i, w);
    if (breakAfter) {
      pendingBreakSegmentIndex = i + 1;
      pendingBreakPaintWidth = lineW - w;
    }
    i++;
  }

  if (hasContent) emitCurrentLine();
  return lineCount;
}

export function walkPreparedLinesRaw(
  prepared: ParagraphItems,
  maxWidth: number,
  onLine?: InternalLineVisitor,
): number {
  if (prepared.simpleLineWalkFastPath) {
    return walkPreparedLinesSimple(prepared, maxWidth, onLine);
  }
  const cursor: LineBreakCursor = {segmentIndex: 0, graphemeIndex: 0};
  const chunkIndex = normalizePreparedLineStart(prepared, cursor);
  return walkPreparedComplexLines(
    prepared,
    cursor,
    chunkIndex,
    maxWidth,
    onLine,
  ).lineCount;
}

function stepPreparedChunkLineGeometry(
  prepared: ParagraphItems,
  cursor: LineBreakCursor,
  chunkIndex: number,
  maxWidth: number,
  options?: LineBreakOptions,
): number | null {
  return walkPreparedComplexLines(
    prepared,
    cursor,
    chunkIndex,
    maxWidth,
    undefined,
    1,
    options,
  ).lastLineWidth;
}

function walkPreparedComplexLines(
  prepared: ParagraphItems,
  cursor: LineBreakCursor,
  chunkIndex: number,
  maxWidth: number,
  onLine?: InternalLineVisitor,
  lineLimit = Number.POSITIVE_INFINITY,
  options?: LineBreakOptions,
): {lineCount: number; lastLineWidth: number | null} {
  const {widths, kinds, breakableFitAdvances, breakablePreferredBreaks} =
    prepared;
  const engineProfile = getEngineProfile();
  const lineFitEpsilon = engineProfile.lineFitEpsilon;
  const bandAt = options?.bandAt;
  const emergencyBreaks = options?.emergencyBreaks ?? true;
  const originLeft = options?.originLeft ?? 0;
  const internalBreaks = options?.internalBreaks ?? false;
  const overflowRule: OverflowRule = emergencyBreaks ? 'break' : 'run-on';
  let fitLimit = maxWidth + lineFitEpsilon;

  /**
   * Stand in the band of the candidate that holds every item through `index`,
   * and the hard break that closes the chunk when that candidate takes it: a
   * grapheme that completes the last item of a chunk takes it, a grapheme
   * before that one does not.
   */
  function useBandThrough(index: number, consumesHardBreak = false): void {
    if (bandAt === undefined) return;
    const band = bandAt(index, consumesHardBreak);
    fitLimit = band.width + lineFitEpsilon;
  }

  /** Whether this run of items offers a break strictly inside itself. */
  function hasPreferredBreakInside(from: number, to: number): boolean {
    for (let i = from; i < to; i++) {
      if (offersInternalBreak(prepared, i)) return true;
    }
    return false;
  }

  /** Whether a line may end inside this run of items. */
  function mayBreakInside(from: number, to: number): boolean {
    if (emergencyBreaks) return true;
    for (let i = from; i < to; i++) {
      if (breakablePreferredBreaks[i] !== null) return true;
    }
    return false;
  }

  let lineStartSegmentIndex: number;
  let lineStartGraphemeIndex: number;
  let lineW: number;
  let hasContent: boolean;
  let lineEndSegmentIndex: number;
  let lineEndGraphemeIndex: number;
  let pendingBreakSegmentIndex: number;
  let pendingBreakFitWidth: number;
  let pendingBreakPaintWidth: number;
  let pendingBreakFitLimit: number;

  /** Whether the break the line kept still fits the band it was found in. */
  function pendingBreakFits(): boolean {
    return (
      pendingBreakSegmentIndex >= 0 &&
      pendingBreakFitWidth <= pendingBreakFitLimit
    );
  }

  function getCurrentLinePaintWidth(): number {
    if (
      pendingBreakSegmentIndex !== lineEndSegmentIndex ||
      lineEndGraphemeIndex !== 0
    ) {
      return lineW;
    }
    return pendingBreakPaintWidth;
  }

  function finishLine(
    endSegmentIndex = lineEndSegmentIndex,
    endGraphemeIndex = lineEndGraphemeIndex,
    width = getCurrentLinePaintWidth(),
  ): number | null {
    if (!hasContent) return null;
    cursor.segmentIndex = endSegmentIndex;
    cursor.graphemeIndex = endGraphemeIndex;
    return finalizeLinePaintWidth(
      prepared,
      width,
      lineStartSegmentIndex,
      lineStartGraphemeIndex,
      endSegmentIndex,
      endGraphemeIndex,
    );
  }

  function startLineAtSegment(segmentIndex: number, width: number): void {
    hasContent = true;
    lineEndSegmentIndex = segmentIndex + 1;
    lineEndGraphemeIndex = 0;
    lineW = width;
  }

  function startLineAtGrapheme(
    segmentIndex: number,
    graphemeIndex: number,
    width: number,
  ): void {
    hasContent = true;
    lineEndSegmentIndex = segmentIndex;
    lineEndGraphemeIndex = graphemeIndex + 1;
    lineW = width;
  }

  function appendWholeSegment(segmentIndex: number, advance: number): void {
    if (!hasContent) {
      startLineAtSegment(segmentIndex, advance);
      return;
    }
    lineW += advance;
    lineEndSegmentIndex = segmentIndex + 1;
    lineEndGraphemeIndex = 0;
  }

  function updatePendingBreakForWholeSegment(
    kind: ParagraphItemKind,
    breakAfter: boolean,
    segmentIndex: number,
    segmentWidth: number,
    leadingSpacing: number,
    advance: number,
  ): void {
    if (!breakAfter) return;
    const fitAdvance = getBreakOpportunityFitContribution(
      prepared,
      kind,
      segmentIndex,
      leadingSpacing,
    );
    const paintAdvance = getLineEndPaintContribution(
      prepared,
      kind,
      segmentIndex,
      leadingSpacing,
      segmentWidth,
    );
    pendingBreakSegmentIndex = segmentIndex + 1;
    pendingBreakFitWidth = lineW - advance + fitAdvance;
    pendingBreakPaintWidth = lineW - advance + paintAdvance;
    pendingBreakFitLimit = fitLimit;
  }

  function appendBreakableSegmentFrom(
    segmentIndex: number,
    startGraphemeIndex: number,
    endsChunk: boolean,
    onOverflow: OverflowRule,
  ): number | null {
    useBandThrough(segmentIndex);
    const fitAdvances = getBreakableFitAdvances(prepared, segmentIndex);
    const preferredBreaks = breakablePreferredBreaks[segmentIndex] ?? null;
    let preferredBreakIndex =
      preferredBreaks === null
        ? -1
        : getNextPreferredBreakIndex(
            preferredBreaks,
            0,
            startGraphemeIndex + 1,
          );
    let lastPreferredBreakEnd = -1;
    let lastPreferredBreakWidth = 0;

    for (let g = startGraphemeIndex; g < fitAdvances.length; g++) {
      const baseGw = fitAdvances[g];
      if (endsChunk && g === fitAdvances.length - 1) {
        useBandThrough(segmentIndex, true);
      }

      if (!hasContent) {
        startLineAtGrapheme(segmentIndex, g, baseGw);
      } else {
        const gw = getBreakableGraphemeAdvance(prepared, segmentIndex, baseGw);
        const candidatePaintWidth = lineW + gw;
        if (
          getBreakableCandidateFitWidth(
            prepared,
            segmentIndex,
            candidatePaintWidth,
          ) > fitLimit
        ) {
          if (
            preferredBreaks !== null &&
            lastPreferredBreakEnd > startGraphemeIndex
          ) {
            return finishLine(
              segmentIndex,
              lastPreferredBreakEnd,
              lastPreferredBreakWidth,
            );
          }
          // Running on carries the unit to its next legal break, which the
          // test above takes once it is behind us.
          if (onOverflow === 'break') return finishLine();
          if (onOverflow === 'give-up') return null;
        }

        lineW = candidatePaintWidth;
        lineEndSegmentIndex = segmentIndex;
        lineEndGraphemeIndex = g + 1;
      }

      const graphemeEnd = g + 1;
      if (
        preferredBreaks !== null &&
        preferredBreaks[preferredBreakIndex] === graphemeEnd
      ) {
        lastPreferredBreakEnd = graphemeEnd;
        lastPreferredBreakWidth = lineW;
        preferredBreakIndex++;
      }
    }

    if (
      hasContent &&
      lineEndSegmentIndex === segmentIndex &&
      lineEndGraphemeIndex === fitAdvances.length
    ) {
      lineEndSegmentIndex = segmentIndex + 1;
      lineEndGraphemeIndex = 0;
    }
    return null;
  }

  function endsAtLegalBreak(): boolean {
    return endsLineLegally(prepared, lineEndSegmentIndex, lineEndGraphemeIndex);
  }

  /** Upstream ends a full line at its line end; an illegal end may not. */
  function prefersLineEnd(): boolean {
    return emergencyBreaks || endsAtLegalBreak();
  }

  /**
   * Whether a space ends a line an over-wide unit already carried past its
   * band, hanging there as it does after any other line.
   */
  function hangsPastRunOn(kind: ParagraphItemKind): boolean {
    return (
      !emergencyBreaks &&
      (kind === 'space' || kind === 'preserved-space' || kind === 'tab') &&
      lineW > fitLimit
    );
  }

  /** Without an emergency break an over-wide unit runs on to its next break. */
  function runsOn(): boolean {
    if (emergencyBreaks || endsAtLegalBreak()) return false;
    return !pendingBreakFits();
  }

  function captureWalk(): LineWalkState {
    return {
      lineW,
      hasContent,
      lineEndSegmentIndex,
      lineEndGraphemeIndex,
      fitLimit,
    };
  }

  function restoreWalk(saved: LineWalkState): void {
    lineW = saved.lineW;
    hasContent = saved.hasContent;
    lineEndSegmentIndex = saved.lineEndSegmentIndex;
    lineEndGraphemeIndex = saved.lineEndGraphemeIndex;
    fitLimit = saved.fitLimit;
  }

  /**
   * End the line at a break the unit in front of it offers inside itself,
   * when the line reaches one. The unit no longer fits whole, and a break
   * inside it stands further on than the one behind it.
   */
  function stepInternalBreak(
    from: number,
    to: number,
    startGraphemeIndex: number,
    endsChunk: boolean,
  ): number | null {
    if (!internalBreaks) return null;
    if (breakableFitAdvances[from] === null) return null;
    if (!hasPreferredBreakInside(from, to)) return null;
    const saved = captureWalk();
    const line =
      to > from + 1
        ? appendJoinedGroupGraphemesFrom(
            to,
            from,
            startGraphemeIndex,
            endsChunk,
            'give-up',
          )
        : appendBreakableSegmentFrom(
            from,
            startGraphemeIndex,
            endsChunk,
            'give-up',
          );
    if (line !== null) return line;
    restoreWalk(saved);
    return null;
  }

  function getInnerLeadingSpacing(groupStart: number, index: number): number {
    return index === groupStart
      ? 0
      : getPrecedingLetterSpacing(prepared, lineStartSegmentIndex, index);
  }

  function getJoinedGroupWidth(groupStart: number, end: number): number {
    let width = 0;
    for (let i = groupStart; i < end; i++) {
      width += getInnerLeadingSpacing(groupStart, i) + widths[i];
    }
    return width;
  }

  /** What a joined group contributes when the line ends on its last item. */
  function getJoinedGroupEndContribution(
    groupStart: number,
    end: number,
    lineEndAdvances: readonly number[],
  ): number {
    const last = lineEndAdvances[end - 1];
    if (last === 0) return 0;
    return (
      getJoinedGroupWidth(groupStart, end - 1) +
      getInnerLeadingSpacing(groupStart, end - 1) +
      last
    );
  }

  function appendJoinedGroupGraphemesFrom(
    end: number,
    startIndex: number,
    startGraphemeIndex: number,
    endsChunk: boolean,
    onOverflow: OverflowRule,
  ): number | null {
    let lastPreferredBreakItem = -1;
    let lastPreferredBreakEnd = -1;
    let lastPreferredBreakWidth = 0;

    for (let i = startIndex; i < end; i++) {
      // A part of the group stands in the band of what it holds, not of the
      // whole group.
      useBandThrough(i);
      const fitAdvances = getBreakableFitAdvances(prepared, i);
      const preferredBreaks = breakablePreferredBreaks[i] ?? null;
      const firstGraphemeIndex = i === startIndex ? startGraphemeIndex : 0;
      let preferredBreakIndex =
        preferredBreaks === null
          ? -1
          : getNextPreferredBreakIndex(
              preferredBreaks,
              0,
              firstGraphemeIndex + 1,
            );

      for (let g = firstGraphemeIndex; g < fitAdvances.length; g++) {
        const baseGw = fitAdvances[g];
        if (endsChunk && i === end - 1 && g === fitAdvances.length - 1) {
          useBandThrough(i, true);
        }

        if (!hasContent) {
          startLineAtGrapheme(i, g, baseGw);
        } else {
          const gap =
            g === 0 && i > startIndex
              ? getPrecedingLetterSpacing(prepared, lineStartSegmentIndex, i)
              : prepared.letterSpacings[i];
          const candidatePaintWidth = lineW + baseGw + gap;
          if (
            getBreakableCandidateFitWidth(prepared, i, candidatePaintWidth) >
            fitLimit
          ) {
            if (
              lastPreferredBreakEnd > 0 &&
              (lastPreferredBreakItem > startIndex ||
                lastPreferredBreakEnd > startGraphemeIndex)
            ) {
              return finishLine(
                lastPreferredBreakItem,
                lastPreferredBreakEnd,
                lastPreferredBreakWidth,
              );
            }
            if (onOverflow === 'break') return finishLine();
            if (onOverflow === 'give-up') return null;
          }

          lineW = candidatePaintWidth;
          lineEndSegmentIndex = i;
          lineEndGraphemeIndex = g + 1;
        }

        const graphemeEnd = g + 1;
        if (
          preferredBreaks !== null &&
          preferredBreaks[preferredBreakIndex] === graphemeEnd
        ) {
          lastPreferredBreakItem = i;
          lastPreferredBreakEnd = graphemeEnd;
          lastPreferredBreakWidth = lineW;
          preferredBreakIndex++;
        }
      }

      if (
        hasContent &&
        lineEndSegmentIndex === i &&
        lineEndGraphemeIndex === fitAdvances.length
      ) {
        lineEndSegmentIndex = i + 1;
        lineEndGraphemeIndex = 0;
      }
    }
    return null;
  }

  function updatePendingBreakForJoinedGroup(
    kind: ParagraphItemKind,
    groupStart: number,
    end: number,
    leadingSpacing: number,
    advance: number,
  ): void {
    if (!breaksAfter(kind)) return;
    pendingBreakSegmentIndex = end;
    pendingBreakFitWidth =
      lineW -
      advance +
      getLineEndContribution(
        leadingSpacing,
        getJoinedGroupEndContribution(
          groupStart,
          end,
          prepared.lineEndFitAdvances,
        ),
      );
    pendingBreakPaintWidth =
      lineW -
      advance +
      getLineEndContribution(
        leadingSpacing,
        getJoinedGroupEndContribution(
          groupStart,
          end,
          prepared.lineEndPaintAdvances,
        ),
      );
    pendingBreakFitLimit = fitLimit;
  }

  /**
   * Lay out a run of joined items as one unit: the seams inside it exist for
   * measurement, so they offer no break, and the grapheme walk crosses them.
   */
  function stepJoinedGroup(
    groupStart: number,
    end: number,
    endsChunk: boolean,
  ): number | null {
    const kind = kinds[groupStart];
    const startGraphemeIndex =
      groupStart === cursor.segmentIndex ? cursor.graphemeIndex : 0;
    const leadingSpacing = getLeadingLetterSpacing(
      prepared,
      hasContent,
      lineStartSegmentIndex,
      groupStart,
    );
    const width = getJoinedGroupWidth(groupStart, end);
    const advance = leadingSpacing + width;
    const fitAdvance = getLineEndContribution(
      leadingSpacing,
      getJoinedGroupEndContribution(
        groupStart,
        end,
        prepared.lineEndFitAdvances,
      ),
    );

    if (!hasContent) {
      if (
        startGraphemeIndex > 0 ||
        (fitAdvance > fitLimit &&
          breakableFitAdvances[groupStart] !== null &&
          mayBreakInside(groupStart, end))
      ) {
        const line = appendJoinedGroupGraphemesFrom(
          end,
          groupStart,
          startGraphemeIndex,
          endsChunk,
          overflowRule,
        );
        if (line !== null) return line;
      } else {
        startLineAtSegment(end - 1, width);
      }
      updatePendingBreakForJoinedGroup(
        kind,
        groupStart,
        end,
        leadingSpacing,
        advance,
      );
      return null;
    }

    if (lineW + fitAdvance > fitLimit && !runsOn()) {
      const inside = stepInternalBreak(
        groupStart,
        end,
        startGraphemeIndex,
        endsChunk,
      );
      if (inside !== null) return inside;
      if (pendingBreakFits()) {
        if (
          prefersLineEnd() &&
          (lineEndSegmentIndex > pendingBreakSegmentIndex ||
            (lineEndSegmentIndex === pendingBreakSegmentIndex &&
              lineEndGraphemeIndex > 0))
        ) {
          return finishLine();
        }
        return finishLine(pendingBreakSegmentIndex, 0, pendingBreakPaintWidth);
      }
      return finishLine();
    }

    appendWholeSegment(end - 1, advance);
    updatePendingBreakForJoinedGroup(
      kind,
      groupStart,
      end,
      leadingSpacing,
      advance,
    );
    return null;
  }

  let lineCount = 0;
  let lastLineWidth: number | null = null;
  while (chunkIndex >= 0 && lineCount < lineLimit) {
    lineStartSegmentIndex = cursor.segmentIndex;
    lineStartGraphemeIndex = cursor.graphemeIndex;
    lineW = 0;
    hasContent = false;
    lineEndSegmentIndex = cursor.segmentIndex;
    lineEndGraphemeIndex = cursor.graphemeIndex;
    pendingBreakSegmentIndex = -1;
    pendingBreakFitWidth = 0;
    pendingBreakPaintWidth = 0;
    pendingBreakFitLimit = fitLimit;

    const chunk = prepared.chunks[chunkIndex];
    let lineWidth: number | null = null;
    if (chunk.startSegmentIndex === chunk.endSegmentIndex) {
      cursor.segmentIndex = chunk.consumedEndSegmentIndex;
      cursor.graphemeIndex = 0;
      lineWidth = 0;
    } else {
      lineLoop: for (
        let i = cursor.segmentIndex;
        i < chunk.endSegmentIndex;
        i++
      ) {
        const joinedGroupEnd = getJoinedGroupEnd(
          prepared,
          i,
          chunk.endSegmentIndex,
        );
        useBandThrough(
          joinedGroupEnd - 1,
          joinedGroupEnd === chunk.endSegmentIndex,
        );
        if (joinedGroupEnd > i + 1) {
          const line = stepJoinedGroup(
            i,
            joinedGroupEnd,
            joinedGroupEnd === chunk.endSegmentIndex,
          );
          if (line !== null) {
            lineWidth = line;
            break lineLoop;
          }
          i = joinedGroupEnd - 1;
          continue;
        }

        const kind = kinds[i];
        const breakAfter = breaksAfter(kind);
        const startGraphemeIndex =
          i === cursor.segmentIndex ? cursor.graphemeIndex : 0;
        const leadingSpacing = getLeadingLetterSpacing(
          prepared,
          hasContent,
          lineStartSegmentIndex,
          i,
        );
        const w =
          kind === 'tab'
            ? getTabAdvance(
                originLeft + lineW + leadingSpacing,
                prepared.tabStopAdvances[i],
              )
            : widths[i];
        const advance = leadingSpacing + w;
        const fitAdvance = getWholeSegmentFitContribution(
          prepared,
          kind,
          i,
          leadingSpacing,
          w,
        );

        if (kind === 'soft-hyphen' && startGraphemeIndex === 0) {
          const hyphenWidth = getDiscretionaryHyphenWidth(
            prepared,
            lineStartSegmentIndex,
            i,
          );
          // The hyphen is painted, so the break is only legal where the whole
          // of it stands inside the free segment the line runs in.
          if (hasContent && lineW + hyphenWidth <= fitLimit) {
            lineEndSegmentIndex = i + 1;
            lineEndGraphemeIndex = 0;
            if (i + 1 < chunk.endSegmentIndex) {
              pendingBreakSegmentIndex = i + 1;
              pendingBreakFitWidth = lineW + hyphenWidth;
              pendingBreakPaintWidth = lineW + hyphenWidth;
              pendingBreakFitLimit = fitLimit;
            }
          }
          continue;
        }

        const endsChunk = i + 1 === chunk.endSegmentIndex;
        if (!hasContent) {
          if (startGraphemeIndex > 0) {
            const line = appendBreakableSegmentFrom(
              i,
              startGraphemeIndex,
              endsChunk,
              overflowRule,
            );
            if (line !== null) {
              lineWidth = line;
              break lineLoop;
            }
          } else if (
            fitAdvance > fitLimit &&
            breakableFitAdvances[i] !== null &&
            mayBreakInside(i, i + 1)
          ) {
            const line = appendBreakableSegmentFrom(
              i,
              0,
              endsChunk,
              overflowRule,
            );
            if (line !== null) {
              lineWidth = line;
              break lineLoop;
            }
          } else {
            startLineAtSegment(i, w);
          }
          updatePendingBreakForWholeSegment(
            kind,
            breakAfter,
            i,
            w,
            leadingSpacing,
            advance,
          );
          continue;
        }

        const newFitW = lineW + fitAdvance;
        if (newFitW > fitLimit && !runsOn()) {
          const currentBreakFitWidth =
            lineW +
            getBreakOpportunityFitContribution(
              prepared,
              kind,
              i,
              leadingSpacing,
            );
          const currentBreakPaintWidth =
            lineW +
            getLineEndPaintContribution(prepared, kind, i, leadingSpacing, w);

          if (
            breakAfter &&
            (currentBreakFitWidth <= fitLimit || hangsPastRunOn(kind))
          ) {
            appendWholeSegment(i, advance);
            lineWidth = finishLine(i + 1, 0, currentBreakPaintWidth);
            break lineLoop;
          }

          const inside = stepInternalBreak(
            i,
            i + 1,
            startGraphemeIndex,
            endsChunk,
          );
          if (inside !== null) {
            lineWidth = inside;
            break lineLoop;
          }

          if (pendingBreakFits()) {
            if (
              prefersLineEnd() &&
              (lineEndSegmentIndex > pendingBreakSegmentIndex ||
                (lineEndSegmentIndex === pendingBreakSegmentIndex &&
                  lineEndGraphemeIndex > 0))
            ) {
              lineWidth = finishLine();
              break lineLoop;
            }
            lineWidth = finishLine(
              pendingBreakSegmentIndex,
              0,
              pendingBreakPaintWidth,
            );
            break lineLoop;
          }

          lineWidth = finishLine();
          break lineLoop;
        }

        appendWholeSegment(i, advance);
        updatePendingBreakForWholeSegment(
          kind,
          breakAfter,
          i,
          w,
          leadingSpacing,
          advance,
        );
      }

      if (lineWidth === null) {
        lineWidth =
          pendingBreakSegmentIndex === chunk.consumedEndSegmentIndex &&
          lineEndGraphemeIndex === 0
            ? finishLine(
                chunk.consumedEndSegmentIndex,
                0,
                pendingBreakPaintWidth,
              )
            : finishLine(chunk.consumedEndSegmentIndex, 0, lineW);
      }
    }
    if (lineWidth === null) break;
    lastLineWidth = lineWidth;
    lineCount++;
    onLine?.(
      lineWidth,
      lineStartSegmentIndex,
      lineStartGraphemeIndex,
      cursor.segmentIndex,
      cursor.graphemeIndex,
    );
    // A single-line caller owns normalization of the following line.
    if (lineCount < lineLimit) {
      chunkIndex = normalizeLineStartChunkIndexFromHint(
        prepared,
        chunkIndex,
        cursor,
      );
    }
  }
  return {lineCount, lastLineWidth};
}

function stepPreparedSimpleLineGeometry(
  prepared: ParagraphItems,
  cursor: LineBreakCursor,
  maxWidth: number,
): number | null {
  const {widths, kinds, breakableFitAdvances, breakablePreferredBreaks} =
    prepared;
  const engineProfile = getEngineProfile();
  const lineFitEpsilon = engineProfile.lineFitEpsilon;
  const fitLimit = maxWidth + lineFitEpsilon;

  let lineW = 0;
  let hasContent = false;
  let lineEndSegmentIndex = cursor.segmentIndex;
  let lineEndGraphemeIndex = cursor.graphemeIndex;
  let pendingBreakSegmentIndex = -1;
  let pendingBreakPaintWidth = 0;

  for (let i = cursor.segmentIndex; i < widths.length; i++) {
    const kind = kinds[i];
    const breakAfter = breaksAfter(kind);
    const startGraphemeIndex =
      i === cursor.segmentIndex ? cursor.graphemeIndex : 0;
    const breakableFitAdvance = breakableFitAdvances[i];
    const w = widths[i];

    if (!hasContent) {
      if (
        startGraphemeIndex > 0 ||
        (w > fitLimit && breakableFitAdvance !== null)
      ) {
        const fitAdvances = getBreakableFitAdvances(prepared, i);
        const preferredBreaks = breakablePreferredBreaks[i] ?? null;
        let preferredBreakIndex =
          preferredBreaks === null
            ? -1
            : getNextPreferredBreakIndex(
                preferredBreaks,
                0,
                startGraphemeIndex + 1,
              );
        let lastPreferredBreakEnd = -1;
        let lastPreferredBreakWidth = 0;
        const firstGraphemeWidth = fitAdvances[startGraphemeIndex];

        hasContent = true;
        lineW = firstGraphemeWidth;
        lineEndSegmentIndex = i;
        lineEndGraphemeIndex = startGraphemeIndex + 1;
        if (
          preferredBreaks !== null &&
          preferredBreaks[preferredBreakIndex] === lineEndGraphemeIndex
        ) {
          lastPreferredBreakEnd = lineEndGraphemeIndex;
          lastPreferredBreakWidth = lineW;
          preferredBreakIndex++;
        }

        for (let g = startGraphemeIndex + 1; g < fitAdvances.length; g++) {
          const gw = fitAdvances[g];
          if (lineW + gw > fitLimit) {
            if (
              preferredBreaks !== null &&
              lastPreferredBreakEnd > startGraphemeIndex
            ) {
              cursor.segmentIndex = i;
              cursor.graphemeIndex = lastPreferredBreakEnd;
              return lastPreferredBreakWidth;
            }
            cursor.segmentIndex = lineEndSegmentIndex;
            cursor.graphemeIndex = lineEndGraphemeIndex;
            return lineW;
          }
          lineW += gw;
          lineEndSegmentIndex = i;
          lineEndGraphemeIndex = g + 1;
          if (
            preferredBreaks !== null &&
            preferredBreaks[preferredBreakIndex] === lineEndGraphemeIndex
          ) {
            lastPreferredBreakEnd = lineEndGraphemeIndex;
            lastPreferredBreakWidth = lineW;
            preferredBreakIndex++;
          }
        }

        if (
          lineEndSegmentIndex === i &&
          lineEndGraphemeIndex === fitAdvances.length
        ) {
          lineEndSegmentIndex = i + 1;
          lineEndGraphemeIndex = 0;
        }
      } else {
        hasContent = true;
        lineW = w;
        lineEndSegmentIndex = i + 1;
        lineEndGraphemeIndex = 0;
      }
      if (breakAfter) {
        pendingBreakSegmentIndex = i + 1;
        pendingBreakPaintWidth = lineW - w;
      }
      continue;
    }

    if (lineW + w > fitLimit) {
      if (breakAfter) {
        cursor.segmentIndex = i + 1;
        cursor.graphemeIndex = 0;
        return lineW;
      }

      if (pendingBreakSegmentIndex >= 0) {
        if (
          lineEndSegmentIndex > pendingBreakSegmentIndex ||
          (lineEndSegmentIndex === pendingBreakSegmentIndex &&
            lineEndGraphemeIndex > 0)
        ) {
          cursor.segmentIndex = lineEndSegmentIndex;
          cursor.graphemeIndex = lineEndGraphemeIndex;
          return lineW;
        }
        cursor.segmentIndex = pendingBreakSegmentIndex;
        cursor.graphemeIndex = 0;
        return pendingBreakPaintWidth;
      }

      cursor.segmentIndex = lineEndSegmentIndex;
      cursor.graphemeIndex = lineEndGraphemeIndex;
      return lineW;
    }

    lineW += w;
    lineEndSegmentIndex = i + 1;
    lineEndGraphemeIndex = 0;
    if (breakAfter) {
      pendingBreakSegmentIndex = i + 1;
      pendingBreakPaintWidth = lineW - w;
    }
  }

  if (!hasContent) return null;
  cursor.segmentIndex = lineEndSegmentIndex;
  cursor.graphemeIndex = lineEndGraphemeIndex;
  return lineW;
}

/** The fast path holds one width per line and upstream's break rules only. */
export function stepPreparedLineGeometryFromChunk(
  prepared: ParagraphItems,
  cursor: LineBreakCursor,
  chunkIndex: number,
  maxWidth: number,
  options?: LineBreakOptions,
): number | null {
  if (prepared.simpleLineWalkFastPath && options === undefined) {
    return stepPreparedSimpleLineGeometry(prepared, cursor, maxWidth);
  }

  return stepPreparedChunkLineGeometry(
    prepared,
    cursor,
    chunkIndex,
    maxWidth,
    options,
  );
}

export function stepPreparedLineGeometry(
  prepared: ParagraphItems,
  cursor: LineBreakCursor,
  maxWidth: number,
): number | null {
  const chunkIndex = normalizePreparedLineStart(prepared, cursor);
  if (chunkIndex < 0) return null;
  return stepPreparedLineGeometryFromChunk(
    prepared,
    cursor,
    chunkIndex,
    maxWidth,
  );
}

export function measurePreparedLineGeometry(
  prepared: ParagraphItems,
  maxWidth: number,
): {
  lineCount: number;
  maxLineWidth: number;
} {
  if (prepared.widths.length === 0) {
    return {
      lineCount: 0,
      maxLineWidth: 0,
    };
  }

  const cursor: LineBreakCursor = {
    segmentIndex: 0,
    graphemeIndex: 0,
  };
  let lineCount = 0;
  let maxLineWidth = 0;

  if (!prepared.simpleLineWalkFastPath) {
    const chunkIndex = normalizePreparedLineStart(prepared, cursor);
    lineCount = walkPreparedComplexLines(
      prepared,
      cursor,
      chunkIndex,
      maxWidth,
      width => {
        if (width > maxLineWidth) maxLineWidth = width;
      },
    ).lineCount;
    return {lineCount, maxLineWidth};
  }

  for (;;) {
    const lineWidth = stepPreparedLineGeometry(prepared, cursor, maxWidth);
    if (lineWidth === null) {
      return {
        lineCount,
        maxLineWidth,
      };
    }
    lineCount++;
    if (lineWidth > maxLineWidth) maxLineWidth = lineWidth;
  }
}

/** One item, or the part of one, that a chosen line holds. */
export type LinePiece = {
  readonly index: number;
  readonly graphemeStart: number;
  readonly graphemeEnd: number;
  /** True when the piece holds the item's whole source range. */
  readonly whole: boolean;
  /** Gap in front of the piece, owned by the glyph before it. */
  readonly leading: number;
  /** Pen advance of the piece itself, its leading gap excluded. */
  readonly advance: number;
  /** Visible hyphen the piece paints at its right edge, else zero. */
  readonly hyphen: number;
};

export type LinePieces = {
  readonly pieces: readonly LinePiece[];
  /** Gap after the last glyph of the line, which is spacing and not ink. */
  readonly trailing: number;
};

/**
 * Split a chosen line into the pieces it paints, with the advance of each.
 * The rules are the ones the walk used to choose the line, so the pieces sum
 * to the width it reported.
 *
 * @example
 * ```ts
 * const {pieces, trailing} = walkPreparedLinePieces(items, line.start, line.end);
 * ```
 */
export function walkPreparedLinePieces(
  prepared: ParagraphItems,
  start: ParagraphCursor,
  end: ParagraphCursor,
  originLeft = 0,
): LinePieces {
  const pieces: LinePiece[] = [];
  const last = end.graphemeIndex > 0 ? end.segmentIndex : end.segmentIndex - 1;
  const discretionary = isDiscretionaryLineEnd(
    prepared.kinds,
    end.segmentIndex,
    end.graphemeIndex,
  );
  let width = 0;
  let hasContent = false;

  for (let i = start.segmentIndex; i <= last; i++) {
    const kind = prepared.kinds[i];
    const row = prepared.breakableFitAdvances[i];
    const rowLength = row === null ? 0 : row.length;
    const graphemeStart = i === start.segmentIndex ? start.graphemeIndex : 0;
    const graphemeEnd =
      i === last && end.graphemeIndex > 0 ? end.graphemeIndex : rowLength;
    const whole =
      row === null || (graphemeStart === 0 && graphemeEnd === rowLength);

    if (kind === 'soft-hyphen') {
      const parts =
        i === last && discretionary
          ? getDiscretionaryHyphenParts(prepared, start.segmentIndex, i)
          : {leading: 0, hyphen: 0};
      pieces.push({
        index: i,
        graphemeStart,
        graphemeEnd,
        whole,
        leading: parts.leading,
        advance: 0,
        hyphen: parts.hyphen,
      });
      width += parts.leading + parts.hyphen;
      continue;
    }

    const leading = getLeadingLetterSpacing(
      prepared,
      hasContent,
      start.segmentIndex,
      i,
    );
    hasContent = true;

    let advance: number;
    if (row !== null && !whole) {
      advance = getPartialPaintCorrection(
        prepared,
        i,
        graphemeStart,
        graphemeEnd,
      );
      for (let g = graphemeStart; g < graphemeEnd; g++) {
        advance +=
          g > graphemeStart
            ? getBreakableGraphemeAdvance(prepared, i, row[g])
            : row[g];
      }
    } else if (kind === 'tab') {
      advance = getTabAdvance(
        originLeft + width + leading,
        prepared.tabStopAdvances[i],
      );
    } else {
      advance =
        i === last ? prepared.lineEndPaintAdvances[i] : prepared.widths[i];
    }

    const gap = advance === 0 ? 0 : leading;
    pieces.push({
      index: i,
      graphemeStart,
      graphemeEnd,
      whole,
      leading: gap,
      advance,
      hyphen: 0,
    });
    width += gap + advance;
  }

  return {
    pieces,
    trailing: getTerminalLetterSpacing(
      prepared,
      start.segmentIndex,
      start.graphemeIndex,
      end.segmentIndex,
      end.graphemeIndex,
    ),
  };
}
