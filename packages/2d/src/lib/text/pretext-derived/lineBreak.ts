// Copied from @chenglou/pretext 0.0.9, src/line-break.ts, commit
// 8460bf940c50d82be90a396fb0ea2c4e7a2dc6f3, under the MIT license in
// ./LICENSE. Function names and upstream line ranges are in ./UPSTREAM.json,
// which a unit test checks against the installed package.
import type {ParagraphItems} from '../paragraphItems';
import {getEngineProfile} from './engineProfile';
import type {SegmentBreakKind} from './segmentBreakKind';

export type LineBreakCursor = {
  segmentIndex: number;
  graphemeIndex: number;
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
  kinds: readonly SegmentBreakKind[],
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

function consumesAtLineStart(kind: SegmentBreakKind): boolean {
  return (
    kind === 'space' || kind === 'zero-width-break' || kind === 'soft-hyphen'
  );
}

function breaksAfter(kind: SegmentBreakKind): boolean {
  return (
    kind === 'space' ||
    kind === 'preserved-space' ||
    kind === 'tab' ||
    kind === 'zero-width-break' ||
    kind === 'soft-hyphen'
  );
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

function getTabAdvance(lineWidth: number, tabStopAdvance: number): number {
  if (tabStopAdvance <= 0) return 0;

  const remainder = lineWidth % tabStopAdvance;
  if (Math.abs(remainder) <= 1e-6) return tabStopAdvance;
  return tabStopAdvance - remainder;
}

function rendersGraphemes(kind: SegmentBreakKind): boolean {
  return (
    kind !== 'zero-width-break' &&
    kind !== 'soft-hyphen' &&
    kind !== 'hard-break'
  );
}

/** Letter spacing of the last item that rendered a glyph on the line. */
function getPrecedingLetterSpacing(
  prepared: ParagraphItems,
  lineStartSegmentIndex: number,
  segmentIndex: number,
): number {
  for (let i = segmentIndex - 1; i >= lineStartSegmentIndex; i--) {
    if (rendersGraphemes(prepared.kinds[i])) {
      return prepared.letterSpacings[i];
    }
  }
  return prepared.letterSpacings[segmentIndex];
}

/** Letter spacing of the gap before an item, owned by the glyph before it. */
function getLeadingLetterSpacing(
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

function getWholeSegmentFitContribution(
  prepared: ParagraphItems,
  kind: SegmentBreakKind,
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

function getBreakOpportunityFitContribution(
  prepared: ParagraphItems,
  kind: SegmentBreakKind,
  segmentIndex: number,
  leadingSpacing: number,
): number {
  const segmentContribution =
    kind === 'tab' ? 0 : prepared.lineEndFitAdvances[segmentIndex];
  return getLineEndContribution(leadingSpacing, segmentContribution);
}

function getLineEndPaintContribution(
  prepared: ParagraphItems,
  kind: SegmentBreakKind,
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
function getBreakableFitAdvances(
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

function getTerminalLetterSpacing(
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
): number | null {
  return walkPreparedComplexLines(
    prepared,
    cursor,
    chunkIndex,
    maxWidth,
    undefined,
    1,
  ).lastLineWidth;
}

function walkPreparedComplexLines(
  prepared: ParagraphItems,
  cursor: LineBreakCursor,
  chunkIndex: number,
  maxWidth: number,
  onLine?: InternalLineVisitor,
  lineLimit = Number.POSITIVE_INFINITY,
): {lineCount: number; lastLineWidth: number | null} {
  const {widths, kinds, breakableFitAdvances, breakablePreferredBreaks} =
    prepared;
  const engineProfile = getEngineProfile();
  const lineFitEpsilon = engineProfile.lineFitEpsilon;
  const fitLimit = maxWidth + lineFitEpsilon;

  let lineStartSegmentIndex: number;
  let lineStartGraphemeIndex: number;
  let lineW: number;
  let hasContent: boolean;
  let lineEndSegmentIndex: number;
  let lineEndGraphemeIndex: number;
  let pendingBreakSegmentIndex: number;
  let pendingBreakFitWidth: number;
  let pendingBreakPaintWidth: number;
  let pendingBreakKind: SegmentBreakKind | null;

  function getCurrentLinePaintWidth(): number {
    return pendingBreakKind === 'soft-hyphen' &&
      pendingBreakSegmentIndex === lineEndSegmentIndex &&
      lineEndGraphemeIndex === 0
      ? pendingBreakPaintWidth
      : lineW;
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
    kind: SegmentBreakKind,
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
    pendingBreakKind = kind;
  }

  function appendBreakableSegmentFrom(
    segmentIndex: number,
    startGraphemeIndex: number,
  ): number | null {
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
          return finishLine();
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
    pendingBreakKind = null;

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
            ? getTabAdvance(lineW + leadingSpacing, prepared.tabStopAdvances[i])
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
          if (hasContent) {
            lineEndSegmentIndex = i + 1;
            lineEndGraphemeIndex = 0;
            if (i + 1 < chunk.endSegmentIndex) {
              // The stored width carries the hyphen's own spacing on both
              // sides; the gap before it belongs to the glyph before it.
              const hyphenWidth =
                prepared.discretionaryHyphenWidths[i] +
                (getPrecedingLetterSpacing(prepared, lineStartSegmentIndex, i) -
                  prepared.letterSpacings[i]);
              pendingBreakSegmentIndex = i + 1;
              pendingBreakFitWidth = lineW + hyphenWidth;
              pendingBreakPaintWidth = lineW + hyphenWidth;
              pendingBreakKind = kind;
            }
          }
          continue;
        }

        if (!hasContent) {
          if (startGraphemeIndex > 0) {
            const line = appendBreakableSegmentFrom(i, startGraphemeIndex);
            if (line !== null) {
              lineWidth = line;
              break lineLoop;
            }
          } else if (
            fitAdvance > fitLimit &&
            breakableFitAdvances[i] !== null
          ) {
            const line = appendBreakableSegmentFrom(i, 0);
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
        if (newFitW > fitLimit) {
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

          if (breakAfter && currentBreakFitWidth <= fitLimit) {
            appendWholeSegment(i, advance);
            lineWidth = finishLine(i + 1, 0, currentBreakPaintWidth);
            break lineLoop;
          }

          if (
            pendingBreakSegmentIndex >= 0 &&
            pendingBreakFitWidth <= fitLimit
          ) {
            if (
              lineEndSegmentIndex > pendingBreakSegmentIndex ||
              (lineEndSegmentIndex === pendingBreakSegmentIndex &&
                lineEndGraphemeIndex > 0)
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

export function stepPreparedLineGeometryFromChunk(
  prepared: ParagraphItems,
  cursor: LineBreakCursor,
  chunkIndex: number,
  maxWidth: number,
): number | null {
  if (prepared.simpleLineWalkFastPath) {
    return stepPreparedSimpleLineGeometry(prepared, cursor, maxWidth);
  }

  return stepPreparedChunkLineGeometry(prepared, cursor, chunkIndex, maxWidth);
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
