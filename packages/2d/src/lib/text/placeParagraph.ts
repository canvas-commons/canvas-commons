/**
 * The placement pass: the one producer of every text coordinate.
 *
 * Alignment, justification and direction resolve here, against the free
 * segment each line was broken in. Paint, queries, `split`, path text, the
 * tween and node size read the numbers below and do no arithmetic of their
 * own.
 */
import type {TextAlign, VerticalAlign} from '../partials/types';
import type {BrokenParagraph} from './breakParagraph';
import type {ParagraphVerticalMetrics} from './lineMetrics';
import {lineBaselineOffset} from './lineMetrics';
import {
  isJustificationGlue,
  spacedAdvance,
  TIGHTEST_GLUE_RATIO,
} from './lineSpan';
import type {
  ParagraphCursor,
  ParagraphItemKind,
  ParagraphItems,
} from './paragraphItems';
import type {AdvanceMeasurer, ParagraphMetrics} from './preparedParagraph';
import type {ParagraphLevel} from './pretext-derived/bidi';
import {computeBidiLevels} from './pretext-derived/bidi';
import type {LinePiece} from './pretext-derived/lineBreak';
import {walkPreparedLinePieces} from './pretext-derived/lineBreak';
import {segment} from './segmenter';
import type {Interval} from './wrapGeometry';

export type TextDirection = 'ltr' | 'rtl';

/**
 * Where the graphemes of one placed piece sit, measured in the piece's own
 * font. `edges` are the composed prefix edges a query addresses a boundary by;
 * `origins` are the pens the glyphs are painted from, which kerning moves
 * inside those edges.
 */
export type PieceGrid = {
  /** Paragraph text offset of every grapheme boundary, both ends included. */
  readonly offsets: readonly number[];
  /** Composed left edge of every boundary, both ends included. */
  readonly edges: readonly number[];
  /** Pen every grapheme is painted from, one for each. */
  readonly origins: readonly number[];
};

/** One item, or the part of one, at its final place in the block. */
export type PlacedPiece = {
  readonly item: number;
  /** Half-open grapheme range of the item the piece holds. */
  readonly graphemeStart: number;
  readonly graphemeEnd: number;
  /** Half-open range of the normalized paragraph text the piece paints. */
  readonly sourceStart: number;
  readonly sourceEnd: number;
  /** Preparation that measured the piece; its tuple is the piece's font. */
  readonly owner: number;
  /** Left edge of the piece in block space. */
  readonly x: number;
  /** Pen advance from `x`, the gap in front of the piece excluded. */
  readonly advance: number;
  /** Middle of the piece's own extent, which an inline slot centres on. */
  readonly center: number;
  /** Slack justification gave the piece, which is part of `advance`. */
  readonly slack: number;
  /** True for a piece that sits past the segment edge by design. */
  readonly hanging: boolean;
  /** Width of a visible hyphen the piece paints, else zero. */
  readonly hyphen: number;
  /** Left edge of that hyphen, which rtl puts in front of the text. */
  readonly hyphenX: number;
  /** Bidi embedding level the piece was ordered by. */
  readonly level: number;
  /** True when the piece's own glyphs run from its right edge leftwards. */
  readonly rtl: boolean;
};

/**
 * Measurements of the pieces of one placement, each taken on first use and
 * kept for the layout. A whole piece's paint anchor is its own edge and
 * advance, so it is not kept.
 */
class PieceMeasurements {
  private readonly grids = new Map<PlacedPiece, PieceGrid>();
  private readonly anchors = new Map<PlacedPiece, Map<string, PaintAnchor>>();

  public constructor(
    private readonly items: ParagraphItems,
    private readonly options: PlaceOptions,
  ) {}

  public grid(piece: PlacedPiece): PieceGrid {
    let grid = this.grids.get(piece);
    if (grid === undefined) {
      grid = measureGrid(this.options, this.items.kinds[piece.item], piece);
      this.grids.set(piece, grid);
    }
    return grid;
  }

  public anchor(piece: PlacedPiece, from: number, to: number): PaintAnchor {
    if (from === piece.sourceStart && to === piece.sourceEnd) {
      const metrics = this.options.metrics[piece.owner];
      return {
        text: this.options.text.slice(from, to),
        metrics,
        penX: piece.x,
        advance: paintedAdvance(this.items.kinds[piece.item], metrics, piece),
      };
    }
    let anchors = this.anchors.get(piece);
    if (anchors === undefined) {
      anchors = new Map();
      this.anchors.set(piece, anchors);
    }
    const key = `${from}:${to}`;
    let found = anchors.get(key);
    if (found === undefined) {
      found = measureAnchor(this.options, piece, from, to);
      anchors.set(key, found);
    }
    return found;
  }
}

export type PlacedLine = {
  readonly pieces: readonly PlacedPiece[];
  /** Cursors the break pass opened and closed the line at. */
  readonly start: ParagraphCursor;
  readonly end: ParagraphCursor;
  /** Free segment the line was broken in. */
  readonly segment: Interval;
  /** Top of the line box in block space. */
  readonly top: number;
  readonly height: number;
  /** Baseline every piece of the line sits on, in block space. */
  readonly baseline: number;
  /** Middle of the line box in block space. */
  readonly middle: number;
  /** Left edge of the line's ink. */
  readonly left: number;
  /** Ink width: hanging whitespace and the terminal gap are not ink. */
  readonly inkWidth: number;
  /** Gap after the last glyph, which the pen width holds and ink does not. */
  readonly trailing: number;
  /** Width the break pass reported, which the pieces and `trailing` sum to. */
  readonly width: number;
  readonly justified: boolean;
};

export type PlacedParagraph = {
  readonly lines: readonly PlacedLine[];
  /** Direction the paragraph was placed in, which the platform draws in. */
  readonly direction: TextDirection;
  /**
   * Right edge of the widest line's paint, which holds the gap after its last
   * glyph as the platform's own measurement does.
   */
  readonly width: number;
  readonly height: number;
};

export type PlaceOptions = {
  /** The normalized paragraph text the source ranges index into. */
  readonly text: string;
  /** Metric tuple of each preparation, by owner index. */
  readonly metrics: readonly ParagraphMetrics[];
  readonly vertical: ParagraphVerticalMetrics;
  readonly textAlign: TextAlign;
  readonly direction: TextDirection;
  readonly verticalAlign: VerticalAlign;
  readonly blockWidth: number;
  readonly blockHeight: number;
  readonly measurer: AdvanceMeasurer;
};

/** Where a paint call puts its pen, and what it paints. */
export type PaintAnchor = {
  readonly text: string;
  readonly metrics: ParagraphMetrics;
  /** Pen the slice is painted from, so its own kerning ends it at the edge. */
  readonly penX: number;
  /** Advance the slice paints over, in its own shaping. */
  readonly advance: number;
};

const VERTICAL_FACTORS: Record<VerticalAlign, number> = {
  top: 0,
  middle: 0.5,
  bottom: 1,
};

/** Kinds a line discards or hangs when they end it. */
function isWhiteSpace(items: ParagraphItems, index: number): boolean {
  const kind = items.kinds[index];
  return kind === 'space' || kind === 'preserved-space' || kind === 'tab';
}

function alignOffset(
  align: TextAlign,
  direction: TextDirection,
  width: number,
  ink: number,
): number {
  const toEnd = width - ink;
  // CSS Text 3: a line too long for its box is start-aligned.
  if (toEnd < 0) return direction === 'rtl' ? toEnd : 0;
  switch (align) {
    case 'center':
      return toEnd / 2;
    case 'right':
      return toEnd;
    case 'left':
      return 0;
    case 'end':
      return direction === 'rtl' ? 0 : toEnd;
    default:
      return direction === 'rtl' ? toEnd : 0;
  }
}

/** UTF-16 offsets of every grapheme boundary of `text`, both ends included. */
function graphemeOffsets(text: string): number[] {
  const offsets: number[] = [];
  for (const found of segment(text, 'grapheme')) offsets.push(found.index);
  offsets.push(text.length);
  return offsets;
}

/** Paragraph offsets of a piece that is part of its item. */
function partSourceRange(
  items: ParagraphItems,
  options: PlaceOptions,
  piece: LinePiece,
): {start: number; end: number} {
  const start = items.sourceStarts[piece.index];
  const end = items.sourceEnds[piece.index];
  const offsets = graphemeOffsets(options.text.slice(start, end));
  const at = (grapheme: number) =>
    start + offsets[Math.min(grapheme, offsets.length - 1)];
  return {start: at(piece.graphemeStart), end: at(piece.graphemeEnd)};
}

function sourceStartOf(
  items: ParagraphItems,
  options: PlaceOptions,
  piece: LinePiece,
): number {
  return piece.whole
    ? items.sourceStarts[piece.index]
    : partSourceRange(items, options, piece).start;
}

function sourceEndOf(
  items: ParagraphItems,
  options: PlaceOptions,
  piece: LinePiece,
): number {
  return piece.whole
    ? items.sourceEnds[piece.index]
    : partSourceRange(items, options, piece).end;
}

/**
 * First piece of the line's terminal whitespace, which the line discards or
 * hangs. A piece that paints nothing does not end the run, so whitespace
 * behind a soft hyphen or a hard break still counts. A line of nothing but
 * whitespace keeps it, because there is no ink for it to hang off.
 */
function terminalWhiteSpaceStart(
  items: ParagraphItems,
  pieces: readonly LinePiece[],
): number {
  let start = pieces.length;
  for (let p = pieces.length - 1; p >= 0; p--) {
    const piece = pieces[p];
    if (isWhiteSpace(items, piece.index)) {
      start = p;
      continue;
    }
    if (piece.advance === 0 && piece.hyphen === 0) continue;
    return start;
  }
  return pieces.length;
}

/** The pieces of one line laid out, as arrays indexed like the pieces. */
type LaidLine = {
  readonly pieces: readonly LinePiece[];
  readonly xs: number[];
  readonly hyphenXs: number[];
  readonly advances: number[];
  readonly levels: number[];
};

/**
 * Lay the pieces of one line out from zero in logical order, with
 * justification slack already spread over the glue.
 */
function layLine(
  pieces: readonly LinePiece[],
  slacks: readonly number[] | null,
  baseLevel: ParagraphLevel,
): LaidLine {
  const count = pieces.length;
  const laid: LaidLine = {
    pieces,
    xs: new Array<number>(count),
    hyphenXs: new Array<number>(count),
    advances: new Array<number>(count),
    levels: new Array<number>(count).fill(baseLevel),
  };
  let pen = 0;
  for (let p = 0; p < count; p++) {
    const piece = pieces[p];
    const advance = piece.advance + (slacks?.[p] ?? 0);
    pen += piece.leading;
    laid.xs[p] = pen;
    laid.hyphenXs[p] = pen + advance;
    laid.advances[p] = advance;
    pen += advance + piece.hyphen;
  }
  return laid;
}

/**
 * Slack each glue piece of a justified line takes. A line short of its segment
 * shares the gap out evenly; one that passes it draws every glue at the same
 * fraction of its natural width, which is the compression a scoring pass
 * priced, and never tighter than {@link TIGHTEST_GLUE_RATIO}.
 */
function justificationSlack(
  items: ParagraphItems,
  pieces: readonly LinePiece[],
  suffixStart: number,
  ink: number,
  available: number,
): number[] | null {
  const glue: number[] = [];
  let natural = 0;
  for (let p = 0; p < suffixStart; p++) {
    if (!isJustificationGlue(items.kinds[pieces[p].index])) continue;
    glue.push(p);
    natural += pieces[p].advance;
  }
  if (glue.length === 0) return null;
  const slacks = new Array<number>(pieces.length).fill(0);
  const slack = available - ink;
  if (slack > 0) {
    const share = slack / glue.length;
    for (const p of glue) slacks[p] = share;
    return slacks;
  }
  if (slack === 0 || natural <= 0) return null;
  const factor = Math.max(
    TIGHTEST_GLUE_RATIO,
    (available - (ink - natural)) / natural,
  );
  for (const p of glue) slacks[p] = pieces[p].advance * (factor - 1);
  return slacks;
}

/** Mirror the painted extents of `[from, to)` inside `lo` and `hi`. */
function mirrorRange(
  laid: LaidLine,
  from: number,
  to: number,
  lo: number,
  hi: number,
): void {
  for (let p = from; p < to; p++) {
    const hyphenEnd = laid.hyphenXs[p] + laid.pieces[p].hyphen;
    laid.xs[p] = lo + hi - (laid.xs[p] + laid.advances[p]);
    laid.hyphenXs[p] = lo + hi - hyphenEnd;
  }
}

/** No character below this is strong right-to-left or an Arabic number. */
const FIRST_RTL_CHAR_CODE = 0x0590;
const HYPHEN = '\u2010';

/**
 * Set the bidi level of each piece of a line: the level of its first character
 * when the line's text is resolved at the block's own level, as the platform
 * resolves one draw of that text. An ltr line with no character from
 * {@link FIRST_RTL_CHAR_CODE} up keeps the block's level.
 */
function resolveLineLevels(
  items: ParagraphItems,
  options: PlaceOptions,
  laid: LaidLine,
  baseLevel: ParagraphLevel,
): void {
  const {pieces, levels} = laid;
  const {text} = options;
  const count = pieces.length;
  if (count === 0) return;
  const lineStart = sourceStartOf(items, options, pieces[0]);
  const lineEnd = sourceEndOf(items, options, pieces[count - 1]);
  if (baseLevel === 0) {
    let reorders = false;
    for (let i = lineStart; i < lineEnd && !reorders; i++) {
      reorders = text.charCodeAt(i) >= FIRST_RTL_CHAR_CODE;
    }
    if (!reorders) return;
  }
  let line = text.slice(lineStart, lineEnd);
  const last = pieces[count - 1];
  if (last.hyphen > 0) {
    // The hyphen a broken word shows is a neutral, where its soft hyphen is
    // invisible.
    const at = sourceStartOf(items, options, last) - lineStart;
    line = line.slice(0, at) + HYPHEN + line.slice(at + 1);
  }
  const resolved = computeBidiLevels(line, baseLevel);
  if (resolved === null) return;
  for (let p = 0; p < count; p++) {
    const at = sourceStartOf(items, options, pieces[p]) - lineStart;
    if (at < resolved.length) levels[p] = resolved[at];
  }
}

/**
 * Put the pieces of a line in visual order, as UAX9 rule L2 does: every run of
 * a level or above is mirrored inside its own extent, from the highest level
 * down to the lowest odd one. A piece keeps its left edge as its anchor, so a
 * paint call is left-anchored whatever the direction.
 *
 * The levels are pretext's approximation of UAX9, not the platform's shaping.
 */
function orderVisually(
  laid: LaidLine,
  baseLevel: number,
  lineInk: number,
): void {
  const {levels} = laid;
  const count = levels.length;
  let highest = baseLevel;
  let lowestOdd = baseLevel % 2 === 1 ? baseLevel : Infinity;
  for (const level of levels) {
    if (level > highest) highest = level;
    if (level % 2 === 1 && level < lowestOdd) lowestOdd = level;
  }

  for (let level = highest; level >= lowestOdd; level--) {
    let start = -1;
    for (let p = 0; p <= count; p++) {
      if (p < count && levels[p] >= level) {
        if (start < 0) start = p;
        continue;
      }
      if (start < 0) continue;
      if (start === 0 && p === count) {
        mirrorRange(laid, start, p, 0, lineInk);
      } else {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = start; i < p; i++) {
          const x = laid.xs[i];
          const hyphenX = laid.hyphenXs[i];
          lo = Math.min(lo, x, hyphenX);
          hi = Math.max(
            hi,
            x + laid.advances[i],
            hyphenX + laid.pieces[i].hyphen,
          );
        }
        mirrorRange(laid, start, p, lo, hi);
      }
      start = -1;
    }
  }
}

/** Kinds the platform draws as glyphs, so letter spacing follows the last. */
function isSpacedKind(kind: ParagraphItemKind): boolean {
  return kind === 'text' || kind === 'space' || kind === 'preserved-space';
}

/**
 * Advance the piece occupies when it is painted. A piece the platform draws as
 * glyphs follows its convention, so the gap behind the last one is its own; a
 * tab snaps to its stop, a box is as wide as it was given, and a break carries
 * no glyph at all.
 */
function paintedAdvance(
  kind: ParagraphItemKind,
  metrics: ParagraphMetrics,
  piece: PlacedPiece,
): number {
  return isSpacedKind(kind)
    ? piece.advance + metrics.letterSpacing
    : piece.advance;
}

/**
 * Grid of one placed piece, measured in the piece's own font. An rtl piece
 * paints from its right edge, so the logical boundaries map into the visual
 * extent the other way round.
 */
function measureGrid(
  options: PlaceOptions,
  kind: ParagraphItemKind,
  piece: PlacedPiece,
): PieceGrid {
  const metrics = options.metrics[piece.owner];
  const text = options.text.slice(piece.sourceStart, piece.sourceEnd);
  const local = graphemeOffsets(text);
  const offsets = local.map(at => piece.sourceStart + at);
  const count = local.length - 1;
  if (count <= 0) return {offsets, edges: [piece.x], origins: []};
  const whole = paintedAdvance(kind, metrics, piece);
  if (count === 1) {
    return {
      offsets,
      edges: piece.rtl
        ? [piece.x + whole, piece.x]
        : [piece.x, piece.x + whole],
      origins: [piece.x],
    };
  }

  const measure = (from: number, to: number, graphemes: number) =>
    spacedAdvance(
      options.measurer.measureAdvance(text.slice(from, to), metrics),
      graphemes,
      metrics.letterSpacing,
    );
  const edgeAt = (advance: number) =>
    piece.rtl ? piece.x + whole - advance : piece.x + advance;
  const edges = [edgeAt(0)];
  for (let g = 1; g <= count; g++) edges.push(edgeAt(measure(0, local[g], g)));
  const origins: number[] = [];
  for (let g = 0; g < count; g++) {
    const right = piece.rtl ? edges[g] : edges[g + 1];
    origins.push(right - measure(local[g], local[g + 1], 1));
  }
  return {offsets, edges, origins};
}

/** What the pieces of each placement measure, shared by all of them. */
const MEASUREMENTS = new WeakMap<PlacedPiece, PieceMeasurements>();

function measurementsOf(piece: PlacedPiece): PieceMeasurements {
  const measured = MEASUREMENTS.get(piece);
  if (measured === undefined) {
    throw new Error('The piece was not placed by placeParagraph.');
  }
  return measured;
}

/** Anchor of a paint call for part of one piece. */
function measureAnchor(
  options: PlaceOptions,
  piece: PlacedPiece,
  from: number,
  to: number,
): PaintAnchor {
  const metrics = options.metrics[piece.owner];
  const text = options.text.slice(from, to);
  const {offsets, edges} = measurementsOf(piece).grid(piece);
  const indexOf = (offset: number) => {
    let found = offsets.length - 1;
    while (found > 0 && offsets[found] > offset) found--;
    return found;
  };
  const startIndex = indexOf(from);
  const endIndex = indexOf(to);
  const advance = spacedAdvance(
    options.measurer.measureAdvance(text, metrics),
    endIndex - startIndex,
    metrics.letterSpacing,
  );
  // The slice keeps the edge the composed piece puts it at, which rtl reads
  // from the other end.
  const right = piece.rtl ? edges[startIndex] : edges[endIndex];
  return {text, metrics, penX: right - advance, advance};
}

/**
 * Place every line of a broken paragraph.
 *
 * @example
 * ```ts
 * const placed = placeParagraph(items, broken, {
 *   text,
 *   metrics: [tuple],
 *   vertical,
 *   textAlign: 'justify',
 *   direction: 'ltr',
 *   verticalAlign: 'top',
 *   blockWidth: 240,
 *   blockHeight: 120,
 *   measurer: canvasParagraphMeasurer,
 * });
 * ```
 */
export function placeParagraph(
  items: ParagraphItems,
  broken: BrokenParagraph,
  options: PlaceOptions,
): PlacedParagraph {
  const factor = VERTICAL_FACTORS[options.verticalAlign];
  const offset =
    factor === 0 ? 0 : (options.blockHeight - broken.height) * factor;
  const baseLevel: ParagraphLevel = options.direction === 'rtl' ? 1 : 0;
  const measured = new PieceMeasurements(items, options);
  const drafts = broken.lines.map(line => {
    const walked = walkPreparedLinePieces(
      items,
      line.start,
      line.end,
      line.segment.left,
    );
    const suffixStart = terminalWhiteSpaceStart(items, walked.pieces);
    let hanging = 0;
    for (let p = suffixStart; p < walked.pieces.length; p++) {
      hanging += walked.pieces[p].leading + walked.pieces[p].advance;
    }
    return {
      line,
      pieces: walked.pieces,
      trailing: walked.trailing,
      suffixStart,
      ink: line.width - walked.trailing - hanging,
    };
  });

  const natural = drafts.reduce(
    (widest, draft) => Math.max(widest, draft.line.segment.left + draft.ink),
    0,
  );
  const bounded = Number.isFinite(options.blockWidth)
    ? options.blockWidth
    : natural;

  const lines: PlacedLine[] = [];
  let width = 0;

  for (let l = 0; l < drafts.length; l++) {
    const draft = drafts[l];
    const {line, pieces} = draft;
    // The width a line was broken at absorbs the block's pixel rounding; the
    // box a line is aligned in does not, so the block width bounds it.
    const right = Number.isFinite(line.segment.right)
      ? Math.min(line.segment.right, options.blockWidth)
      : Math.max(bounded, line.segment.left + draft.ink);
    const available = right - line.segment.left;

    const slacks =
      options.textAlign === 'justify' &&
      l < drafts.length - 1 &&
      !line.endsOnHardBreak
        ? justificationSlack(
            items,
            pieces,
            draft.suffixStart,
            draft.ink,
            available,
          )
        : null;
    const justified = slacks !== null;

    const laid = layLine(pieces, slacks, baseLevel);
    resolveLineLevels(items, options, laid, baseLevel);
    let spread = 0;
    for (const value of slacks ?? []) spread += value;
    const lineInk = draft.ink + spread;
    orderVisually(laid, baseLevel, lineInk);
    const left =
      line.segment.left +
      (justified
        ? 0
        : alignOffset(
            options.textAlign,
            options.direction,
            available,
            lineInk,
          ));

    const placed = new Array<PlacedPiece>(pieces.length);
    for (let p = 0; p < pieces.length; p++) {
      const piece = pieces[p];
      const index = piece.index;
      const x = left + laid.xs[p];
      const level = laid.levels[p];
      placed[p] = {
        item: index,
        graphemeStart: piece.graphemeStart,
        graphemeEnd: piece.graphemeEnd,
        sourceStart: sourceStartOf(items, options, piece),
        sourceEnd: sourceEndOf(items, options, piece),
        owner: items.owners[index],
        x,
        advance: laid.advances[p],
        center: x + laid.advances[p] / 2,
        slack: slacks?.[p] ?? 0,
        hanging: p >= draft.suffixStart,
        hyphen: piece.hyphen,
        hyphenX: left + laid.hyphenXs[p],
        level,
        rtl: level % 2 === 1,
      };
      MEASUREMENTS.set(placed[p], measured);
    }

    lines.push({
      pieces: placed,
      start: line.start,
      end: line.end,
      segment: line.segment,
      top: line.top + offset,
      height: line.height,
      baseline:
        line.top +
        offset +
        lineBaselineOffset(options.vertical, line.items, line.height),
      middle: line.top + offset + line.height / 2,
      left,
      inkWidth: lineInk,
      trailing: draft.trailing,
      width: line.width,
      justified,
    });
    width = Math.max(width, left + lineInk + draft.trailing);
  }

  return {lines, direction: options.direction, width, height: broken.height};
}

/**
 * Pen and extent of a paint call for part of one placed piece, in the piece's
 * own font. A paint-only seam splits the piece, and the slice is anchored so
 * its own measurement ends where the composed piece puts its last glyph, which
 * keeps the kerning the seam cuts. A ligature the seam falls inside is drawn
 * as the two glyphs of its halves.
 *
 * @example
 * ```ts
 * const anchor = paintAnchorOf(placed, from, to);
 * context.fillText(anchor.text, anchor.penX, line.baseline);
 * ```
 */
export function paintAnchorOf(
  piece: PlacedPiece,
  from: number,
  to: number,
): PaintAnchor {
  return measurementsOf(piece).anchor(piece, from, to);
}

/**
 * Pen every grapheme of a placed piece is painted from. Path text and `split`
 * read glyph positions from here, so no consumer measures a substring of its
 * own.
 *
 * @example
 * ```ts
 * const xs = graphemeXs(piece);
 * ```
 */
export function graphemeXs(piece: PlacedPiece): readonly number[] {
  return measurementsOf(piece).grid(piece).origins;
}

/**
 * Composed left edge of every grapheme boundary of a placed piece, both ends
 * included. A query addresses a boundary by these, because they tile the piece
 * where the painted pens overlap by the kerning between them.
 *
 * @example
 * ```ts
 * const edges = graphemeEdges(piece);
 * ```
 */
export function graphemeEdges(piece: PlacedPiece): readonly number[] {
  return measurementsOf(piece).grid(piece).edges;
}

/** Where a range of the paragraph text sits in block space. */
export type RangeExtent = {
  readonly left: number;
  readonly right: number;
  readonly center: number;
  readonly width: number;
};

/**
 * Extent of a half-open source range inside one placed piece, read from the
 * grapheme grid so a query does no arithmetic of its own. An rtl piece maps
 * the logical ends the other way round, which the left and right edges absorb.
 *
 * @example
 * ```ts
 * const {center, width} = rangeExtentOf(piece, start, end);
 * ```
 */
export function rangeExtentOf(
  piece: PlacedPiece,
  from: number,
  to: number,
): RangeExtent {
  const {offsets, edges} = measurementsOf(piece).grid(piece);
  const edgeAt = (offset: number) => {
    let found = offsets.length - 1;
    while (found > 0 && offsets[found] > offset) found--;
    return edges[found];
  };
  const a = edgeAt(from);
  const b = edgeAt(to);
  const left = Math.min(a, b);
  const right = Math.max(a, b);
  return {left, right, center: (left + right) / 2, width: right - left};
}

/** One draw a consumer makes, with the pen and the baseline it draws from. */
export type PaintCall = {
  readonly line: PlacedLine;
  readonly piece: PlacedPiece;
  /** Half-open range of the paragraph text the call paints. */
  readonly start: number;
  readonly end: number;
  readonly anchor: PaintAnchor;
  /** True for the visible hyphen a broken word ends with. */
  readonly hyphen: boolean;
};

/**
 * Whether a placed piece is painted as text. A break, a soft hyphen and an
 * inline box carry no glyphs of their own, and a piece that hangs past the
 * segment edge is not part of the line. Tight letter spacing can take a
 * piece's advance to zero or below, so the characters decide, not the width.
 */
export function paintsText(items: ParagraphItems, piece: PlacedPiece): boolean {
  const kind = items.kinds[piece.item];
  return (
    piece.sourceEnd > piece.sourceStart &&
    !piece.hanging &&
    kind !== 'zero-width-break' &&
    kind !== 'soft-hyphen' &&
    kind !== 'hard-break' &&
    kind !== 'inline-box'
  );
}

/** Distance two pens may stand apart and still be one shaping. */
const JOIN_TOLERANCE = 1e-9;

/** Whole pieces, each with the anchor it draws from. */
type RunMembers = {
  readonly pieces: PlacedPiece[];
  readonly anchors: PaintAnchor[];
};

/** A run of whole pieces a single draw covers, still open for more. */
type OpenCall = {
  readonly line: PlacedLine;
  readonly first: PlacedPiece;
  last: PlacedPiece;
  readonly metrics: ParagraphMetrics;
  text: string;
  penX: number;
  right: number;
  /** Kept only for a run against the block's direction. */
  readonly members: RunMembers | null;
};

/**
 * Every draw a placed paragraph makes, in paint order. Neighbours of one line
 * that share a font, a bidi level and a pen are drawn together, so a plain
 * line is one call and the kerning between its words survives. A piece is cut
 * at each offset of `seams`, so a run of a different colour inside one shaping
 * run is its own call, anchored by {@link paintAnchorOf}.
 *
 * @example
 * ```ts
 * for (const call of paintCalls(items, placed, [tuple], [4, 9])) {
 *   context.fillText(call.anchor.text, call.anchor.penX, call.line.baseline);
 * }
 * ```
 */
export function paintCalls(
  items: ParagraphItems,
  placed: PlacedParagraph,
  metrics: readonly ParagraphMetrics[],
  seams: readonly number[],
): PaintCall[] {
  const cuts = new Set(seams);
  const baseLevel = placed.direction === 'rtl' ? 1 : 0;
  const calls: PaintCall[] = [];
  let open: OpenCall | null = null;

  const draw = (
    line: PlacedLine,
    members: RunMembers,
    from: number,
    to: number,
  ) => {
    if (from === to) return;
    let text = '';
    let penX = Infinity;
    let right = -Infinity;
    for (let m = from; m < to; m++) {
      const anchor = members.anchors[m];
      text += anchor.text;
      penX = Math.min(penX, anchor.penX);
      right = Math.max(right, anchor.penX + anchor.advance);
    }
    const first = members.pieces[from];
    calls.push({
      line,
      piece: first,
      start: first.sourceStart,
      end: members.pieces[to - 1].sourceEnd,
      anchor: {
        text,
        metrics: members.anchors[from].metrics,
        penX,
        advance: right - penX,
      },
      hyphen: false,
    });
  };

  /**
   * Draw the open run. The platform resolves the whitespace at the ends of a
   * draw in the paragraph's direction, so a run of the other direction draws
   * its end whitespace apart, where the placement put it.
   */
  const close = () => {
    if (open === null) return;
    const run = open;
    open = null;
    const {line, members} = run;
    if (members === null) {
      calls.push({
        line,
        piece: run.first,
        start: run.first.sourceStart,
        end: run.last.sourceEnd,
        anchor: {
          text: run.text,
          metrics: run.metrics,
          penX: run.penX,
          advance: run.right - run.penX,
        },
        hyphen: false,
      });
      return;
    }
    const {pieces} = members;
    let from = 0;
    let to = pieces.length;
    while (from < to && isWhiteSpace(items, pieces[from].item)) from++;
    while (to > from && isWhiteSpace(items, pieces[to - 1].item)) to--;
    for (let m = 0; m < from; m++) draw(line, members, m, m + 1);
    draw(line, members, from, to);
    for (let m = to; m < pieces.length; m++) draw(line, members, m, m + 1);
  };

  /**
   * Whether `piece` carries on the open run's shaping where it left off. A
   * piece the platform draws as glyphs at the advance the placement gave it
   * may join; justification slack, a tab stop and a hyphen all separate the
   * pen from the shaping, so they end the run. A stretched space may still
   * close a run it ends on the right, because no glyph of the run stands
   * behind it. A run holds one bidi level, so the platform orders its text as
   * the placement did.
   */
  const joins = (piece: PlacedPiece, anchor: PaintAnchor, from: number) => {
    if (open === null) return false;
    const {last} = open;
    return (
      last.sourceEnd === from &&
      open.metrics === anchor.metrics &&
      !cuts.has(from) &&
      last.level === piece.level &&
      last.hyphen === 0 &&
      last.slack === 0 &&
      (piece.slack === 0 || !piece.rtl) &&
      isSpacedKind(items.kinds[piece.item]) &&
      isSpacedKind(items.kinds[last.item]) &&
      Math.abs(
        piece.rtl
          ? last.x - (piece.x + piece.advance)
          : piece.x - (last.x + last.advance),
      ) <= JOIN_TOLERANCE
    );
  };

  for (const line of placed.lines) {
    for (const piece of line.pieces) {
      if (paintsText(items, piece)) {
        let from = piece.sourceStart;
        for (const seam of seams) {
          if (seam <= from || seam >= piece.sourceEnd) continue;
          close();
          calls.push({
            line,
            piece,
            start: from,
            end: seam,
            anchor: paintAnchorOf(piece, from, seam),
            hyphen: false,
          });
          from = seam;
        }
        const anchor = paintAnchorOf(piece, from, piece.sourceEnd);
        // Only a whole piece anchors at its own left edge, so only a whole
        // piece can be drawn together with the one beside it.
        if (from !== piece.sourceStart) {
          close();
          calls.push({
            line,
            piece,
            start: from,
            end: piece.sourceEnd,
            anchor,
            hyphen: false,
          });
        } else if (open !== null && joins(piece, anchor, from)) {
          open.last = piece;
          open.text += anchor.text;
          open.penX = Math.min(open.penX, anchor.penX);
          open.right = Math.max(open.right, anchor.penX + anchor.advance);
          open.members?.pieces.push(piece);
          open.members?.anchors.push(anchor);
        } else {
          close();
          open = {
            line,
            first: piece,
            last: piece,
            metrics: anchor.metrics,
            text: anchor.text,
            penX: anchor.penX,
            right: anchor.penX + anchor.advance,
            members:
              piece.level % 2 === baseLevel
                ? null
                : {pieces: [piece], anchors: [anchor]},
          };
        }
      }
      if (piece.hyphen > 0) {
        close();
        calls.push({
          line,
          piece,
          start: piece.sourceEnd,
          end: piece.sourceEnd,
          anchor: {
            text: '-',
            metrics: metrics[piece.owner],
            penX: piece.hyphenX,
            advance: piece.hyphen,
          },
          hyphen: true,
        });
      }
    }
    close();
  }
  return calls;
}
