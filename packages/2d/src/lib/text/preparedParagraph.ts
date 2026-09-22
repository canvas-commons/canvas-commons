import type {PrepareOptions, PreparedTextWithSegments} from '@chenglou/pretext';
import {prepareWithSegments} from '@chenglou/pretext';
import {sharedMeasurementContext} from '../utils/measurement';
import {canvasFontSize} from './font';
import type {ParagraphChunk, ParagraphItems} from './paragraphItems';
import {wholeSegmentRange} from './paragraphItems';
import {correctEmojiAdvance} from './pretext-derived/emojiCorrection';
import type {SegmentBreakKind} from './pretext-derived/segmentBreakKind';
import {isSegmentBreakKind} from './pretext-derived/segmentBreakKind';
import {segment} from './segmenter';

export type WhiteSpaceMode = NonNullable<PrepareOptions['whiteSpace']>;
export type WordBreakMode = NonNullable<PrepareOptions['wordBreak']>;

/** Everything one preparation measures against. */
export type ParagraphMetrics = {
  readonly font: string;
  readonly whiteSpace: WhiteSpaceMode;
  readonly wordBreak: WordBreakMode;
  readonly letterSpacing: number;
};

/**
 * One paragraph measured in one metric tuple: the items the line walker reads,
 * and the pretext handle that materializes a line range of them.
 */
export type PreparedParagraph = {
  /** Normalized text the item source ranges index into. */
  readonly text: string;
  readonly metrics: ParagraphMetrics;
  readonly items: ParagraphItems;
  readonly handle: PreparedTextWithSegments;
};

/**
 * Where paragraph measurements come from. Canvas measurement is the only
 * implementation; a test can supply another.
 */
export interface ParagraphMeasurer {
  prepare(text: string, metrics: ParagraphMetrics): PreparedParagraph;
  /** Advance of a piece of text, with no letter spacing applied. */
  measureAdvance(text: string, metrics: ParagraphMetrics): number;
  /** Font box of a metric tuple, above and below the baseline. */
  measureFontBox(metrics: ParagraphMetrics): {ascent: number; descent: number};
}

/** The measured fields the items are read from, as plain data. */
export type PreparedFields = {
  readonly segments: readonly string[];
  readonly kinds: readonly string[];
  readonly widths: readonly number[];
  readonly lineEndFitAdvances: readonly number[];
  readonly lineEndPaintAdvances: readonly number[];
  readonly breakableFitAdvances: readonly (readonly number[] | null)[];
  readonly breakablePreferredBreaks: readonly (readonly number[] | null)[];
  readonly spacingGraphemeCounts: readonly number[];
  readonly letterSpacing: number;
  readonly discretionaryHyphenWidth: number;
  readonly tabStopAdvance: number;
  readonly simpleLineWalkFastPath: boolean;
  readonly chunks: readonly ParagraphChunk[];
};

function fail(reason: string): never {
  throw new Error(`Prepared text has an unexpected shape: ${reason}.`);
}

function checkNumbers(
  name: string,
  values: readonly number[],
  length: number,
): void {
  if (!Array.isArray(values)) fail(`${name} is not an array`);
  if (values.length !== length) {
    fail(`${name} has ${values.length} entries, not ${length}`);
  }
  for (let i = 0; i < length; i++) {
    if (typeof values[i] !== 'number' || !Number.isFinite(values[i])) {
      fail(`${name} holds ${String(values[i])}`);
    }
  }
}

function checkFitRows(
  rows: readonly (readonly number[] | null)[],
  length: number,
): void {
  if (!Array.isArray(rows)) fail('breakableFitAdvances is not an array');
  if (rows.length !== length) {
    fail(`breakableFitAdvances has ${rows.length} entries, not ${length}`);
  }
  for (let i = 0; i < length; i++) {
    const row = rows[i];
    if (row === null) continue;
    if (!Array.isArray(row)) fail('breakableFitAdvances holds a non-array row');
    if (row.length === 0) fail('breakableFitAdvances holds an empty row');
    for (let g = 0; g < row.length; g++) {
      if (typeof row[g] !== 'number' || !Number.isFinite(row[g])) {
        fail(`breakableFitAdvances holds ${String(row[g])}`);
      }
    }
  }
}

/** A preferred break is a grapheme end of the row it belongs to. */
function checkPreferredBreaks(
  rows: readonly (readonly number[] | null)[],
  fitRows: readonly (readonly number[] | null)[],
  length: number,
): void {
  if (!Array.isArray(rows)) fail('breakablePreferredBreaks is not an array');
  if (rows.length !== length) {
    fail(`breakablePreferredBreaks has ${rows.length} entries, not ${length}`);
  }
  for (let i = 0; i < length; i++) {
    const row = rows[i];
    if (row === null) continue;
    if (!Array.isArray(row)) {
      fail('breakablePreferredBreaks holds a non-array row');
    }
    const fitRow = fitRows[i];
    if (fitRow === null) {
      fail(`breakablePreferredBreaks row ${i} has no grapheme advances`);
    }
    let previous = 0;
    for (const value of row) {
      if (!Number.isInteger(value) || value <= previous) {
        fail(`breakablePreferredBreaks row ${i} holds ${String(value)}`);
      }
      if (value > fitRow.length) {
        fail(`breakablePreferredBreaks row ${i} ends past ${fitRow.length}`);
      }
      previous = value;
    }
  }
}

function checkKinds(
  kinds: readonly string[],
  length: number,
): SegmentBreakKind[] {
  if (!Array.isArray(kinds)) fail('kinds is not an array');
  if (kinds.length !== length) {
    fail(`kinds has ${kinds.length} entries, not ${length}`);
  }
  const checked = new Array<SegmentBreakKind>(length);
  for (let i = 0; i < length; i++) {
    const kind = kinds[i];
    if (!isSegmentBreakKind(kind)) fail(`kinds holds ${String(kind)}`);
    checked[i] = kind;
  }
  return checked;
}

function checkChunks(
  chunks: readonly ParagraphChunk[],
  length: number,
): readonly ParagraphChunk[] {
  if (!Array.isArray(chunks)) fail('chunks is not an array');
  let consumed = 0;
  for (const chunk of chunks) {
    if (
      !Number.isInteger(chunk.startSegmentIndex) ||
      !Number.isInteger(chunk.endSegmentIndex) ||
      !Number.isInteger(chunk.consumedEndSegmentIndex)
    ) {
      fail(`chunk ${JSON.stringify(chunk)} has a non-integer bound`);
    }
    if (
      chunk.startSegmentIndex !== consumed ||
      chunk.endSegmentIndex < chunk.startSegmentIndex ||
      chunk.consumedEndSegmentIndex < chunk.endSegmentIndex ||
      chunk.consumedEndSegmentIndex > length
    ) {
      fail(`chunk ${JSON.stringify(chunk)} does not continue at ${consumed}`);
    }
    consumed = chunk.consumedEndSegmentIndex;
  }
  if (consumed !== length) {
    fail(`chunks cover ${consumed} of ${length} items`);
  }
  return chunks;
}

/**
 * Advance every grapheme of `text` adds to the prefix in front of it, measured
 * in one shaping of the whole text.
 *
 * @example
 * ```ts
 * const row = composedGraphemeAdvances('AV-', text => measure(text));
 * ```
 */
export function composedGraphemeAdvances(
  text: string,
  measureAdvance: (text: string) => number,
): number[] {
  const row: number[] = [];
  let previous = 0;
  for (const grapheme of segment(text, 'grapheme')) {
    const upTo = measureAdvance(
      text.slice(0, grapheme.index + grapheme.segment.length),
    );
    row.push(upTo - previous);
    previous = upTo;
  }
  return row;
}

/**
 * Measure the advance a slice of a text paints, shaped as that slice alone,
 * addressed by grapheme. Each answer is taken once and kept.
 *
 * @example
 * ```ts
 * const paintAdvanceOf = slicePaintAdvances(of, text => measure(text));
 * ```
 */
export function slicePaintAdvances(
  textOf: (index: number) => string,
  measureAdvance: (text: string, index: number) => number,
): (index: number, from: number, to: number) => number {
  const boundaries = new Map<number, number[]>();
  const measured = new Map<string, number>();
  return (index, from, to) => {
    const key = `${index}:${from}:${to}`;
    const found = measured.get(key);
    if (found !== undefined) return found;
    const text = textOf(index);
    let offsets = boundaries.get(index);
    if (offsets === undefined) {
      offsets = segment(text, 'grapheme').map(one => one.index);
      offsets.push(text.length);
      boundaries.set(index, offsets);
    }
    const at = (grapheme: number) =>
      offsets[Math.min(Math.max(grapheme, 0), offsets.length - 1)];
    const advance = measureAdvance(text.slice(at(from), at(to)), index);
    measured.set(key, advance);
    return advance;
  };
}

/**
 * Read measured fields into our own items. A prepared handle satisfies
 * `PreparedFields`; this fails loudly when the fields stop holding what the
 * walker reads. `measureAdvance` measures the paragraph's own font, which the
 * composed grapheme advances a slice paints are read from.
 *
 * @example
 * ```ts
 * const {items} = readParagraphItems(handle, 0, text => measure(text));
 * ```
 */
export function readParagraphItems(
  handle: PreparedFields,
  letterSpacing: number,
  measureAdvance: (text: string) => number,
): {text: string; items: ParagraphItems} {
  const segments = handle.segments;
  if (!Array.isArray(segments)) fail('segments is not an array');
  const length = segments.length;

  const sourceStarts = new Array<number>(length);
  const sourceEnds = new Array<number>(length);
  let at = 0;
  for (let i = 0; i < length; i++) {
    const segment = segments[i];
    if (typeof segment !== 'string') fail('segments holds a non-string');
    sourceStarts[i] = at;
    at += segment.length;
    sourceEnds[i] = at;
  }

  checkNumbers('widths', handle.widths, length);
  checkNumbers('lineEndFitAdvances', handle.lineEndFitAdvances, length);
  checkNumbers('lineEndPaintAdvances', handle.lineEndPaintAdvances, length);
  checkFitRows(handle.breakableFitAdvances, length);
  checkPreferredBreaks(
    handle.breakablePreferredBreaks,
    handle.breakableFitAdvances,
    length,
  );
  if (typeof handle.simpleLineWalkFastPath !== 'boolean') {
    fail('simpleLineWalkFastPath is not a boolean');
  }
  // An empty text prepares to an empty handle, which carries no spacing.
  if (length > 0 && handle.letterSpacing !== letterSpacing) {
    fail(`letterSpacing is ${handle.letterSpacing}, not ${letterSpacing}`);
  }
  if (!Number.isFinite(handle.discretionaryHyphenWidth)) {
    fail('discretionaryHyphenWidth is not a number');
  }
  if (!Number.isFinite(handle.tabStopAdvance)) {
    fail('tabStopAdvance is not a number');
  }

  // Pretext only counts spacing graphemes when the paragraph has letter
  // spacing; no rule reads a count whose item has none.
  const spacingGraphemeCounts =
    letterSpacing === 0
      ? new Array<number>(length).fill(0)
      : handle.spacingGraphemeCounts;
  checkNumbers('spacingGraphemeCounts', spacingGraphemeCounts, length);

  return {
    text: segments.join(''),
    items: {
      kinds: checkKinds(handle.kinds, length),
      joinsPrevious: new Array<boolean>(length).fill(false),
      owners: new Array<number>(length).fill(0),
      boxHeights: new Array<number>(length).fill(0),
      sourceStarts,
      sourceEnds,
      handleRangeOf: wholeSegmentRange,
      widths: handle.widths,
      lineEndFitAdvances: handle.lineEndFitAdvances,
      lineEndPaintAdvances: handle.lineEndPaintAdvances,
      breakableFitAdvances: handle.breakableFitAdvances,
      paintAdvanceOf: slicePaintAdvances(
        index => segments[index],
        measureAdvance,
      ),
      breakablePreferredBreaks: handle.breakablePreferredBreaks,
      spacingGraphemeCounts,
      letterSpacings: new Array<number>(length).fill(letterSpacing),
      discretionaryHyphenWidths: new Array<number>(length).fill(
        handle.discretionaryHyphenWidth,
      ),
      tabStopAdvances: new Array<number>(length).fill(handle.tabStopAdvance),
      simpleLineWalkFastPath: handle.simpleLineWalkFastPath,
      chunks: checkChunks(handle.chunks, length),
    },
  };
}

/**
 * Measure one normalized paragraph in one metric tuple.
 *
 * @example
 * ```ts
 * const prepared = prepareParagraph('hello world', {
 *   font: '400 16px sans-serif',
 *   whiteSpace: 'normal',
 *   wordBreak: 'normal',
 *   letterSpacing: 0,
 * });
 * walkPreparedLinesRaw(prepared.items, 80, () => {});
 * ```
 */
export function prepareParagraph(
  text: string,
  metrics: ParagraphMetrics,
): PreparedParagraph {
  const handle = prepareWithSegments(text, metrics.font, {
    whiteSpace: metrics.whiteSpace,
    wordBreak: metrics.wordBreak,
    letterSpacing: metrics.letterSpacing,
  });
  const read = readParagraphItems(handle, metrics.letterSpacing, text =>
    measureBareAdvance(text, metrics),
  );
  return {text: read.text, metrics, items: read.items, handle};
}

function measureWith<T>(
  metrics: ParagraphMetrics,
  read: (context: CanvasRenderingContext2D) => T,
  fallback: T,
): T {
  const context = sharedMeasurementContext();
  if (context === null) return fallback;
  context.font = metrics.font;
  context.letterSpacing = '0px';
  return read(context);
}

const EMOJI_PROBE = '\u{1F600}';

/** Canvas advance of `text`, with no letter spacing applied. */
function measureBareAdvance(text: string, metrics: ParagraphMetrics): number {
  return measureWith(
    metrics,
    context =>
      correctEmojiAdvance(
        text,
        context.measureText(text).width,
        () =>
          context.measureText(EMOJI_PROBE).width -
          prepareWithSegments(EMOJI_PROBE, metrics.font).widths[0],
      ),
    0,
  );
}

/** Em-square metrics of a font a canvas reports no usable box for. */
function emSquareBox(font: string): {ascent: number; descent: number} {
  return {ascent: canvasFontSize(font), descent: 0};
}

export const canvasParagraphMeasurer: ParagraphMeasurer = {
  prepare: prepareParagraph,
  measureAdvance: measureBareAdvance,
  measureFontBox(metrics) {
    return measureWith(
      metrics,
      context => {
        const measured = context.measureText('Mg');
        const ascent = measured.fontBoundingBoxAscent;
        const descent = measured.fontBoundingBoxDescent;
        return typeof ascent !== 'number' ||
          typeof descent !== 'number' ||
          !Number.isFinite(ascent + descent) ||
          ascent + descent <= 0
          ? emSquareBox(metrics.font)
          : {ascent, descent};
      },
      emSquareBox(metrics.font),
    );
  },
};
