import {describe, expect, it} from 'vitest';
import type {TextAlign, TextShapeExclusion} from '../../partials/types';
import type {
  BreakConstraints,
  BrokenParagraph,
  OverflowWrapMode,
} from '../../text/breakParagraph';
import {breakParagraph} from '../../text/breakParagraph';
import {breakParagraphOptimally} from '../../text/knuthPlassParagraph';
import type {ParagraphVerticalMetrics} from '../../text/lineMetrics';
import {readVerticalMetrics} from '../../text/lineMetrics';
import {prepareMixedParagraph} from '../../text/mixedParagraph';
import type {ContentRun, RunMetrics} from '../../text/paragraphContent';
import {buildParagraphContent} from '../../text/paragraphContent';
import type {ParagraphItems} from '../../text/paragraphItems';
import type {
  PlacedLine,
  PlacedParagraph,
  PlacedPiece,
  PlaceOptions,
  TextDirection,
} from '../../text/placeParagraph';
import {
  graphemeEdges,
  graphemeXs,
  paintAnchorOf,
  placeParagraph,
} from '../../text/placeParagraph';
import type {
  ParagraphMeasurer,
  ParagraphMetrics,
  WhiteSpaceMode,
} from '../../text/preparedParagraph';
import {canvasParagraphMeasurer} from '../../text/preparedParagraph';
import {computeBidiLevels} from '../../text/pretext-derived/bidi';
import {getEngineProfile} from '../../text/pretext-derived/engineProfile';
import {referenceVisualIndexes} from './bidiReference';
import {mockTextContext} from './mockTextContext';
import {mockFontBounds, mockFontWidth, TEXTS} from './textInvariants';

const FONT = '400 20px sans-serif';
const REGULAR: RunMetrics = {font: FONT, letterSpacing: 0};
const TALL: RunMetrics = {font: '400 50px sans-serif', letterSpacing: 0};
const SPACED: RunMetrics = {font: FONT, letterSpacing: 2};
const LINE_HEIGHT = '100%';
const EPSILON = getEngineProfile().lineFitEpsilon;

const EXTRA_TEXTS = [
  {name: 'soft-hyphens', text: 'un­break­able ex­tra words'},
  {name: 'dashed', text: 'a well-known-but-long-compound end'},
  {name: 'hard-breaks', text: 'one\n\ntwo three\nfour'},
  {name: 'cjk', text: '你好世界 tail'},
  {name: 'hebrew-latin', text: 'שלום hello world עולם 12 טוב.'},
  {name: 'arabic-latin', text: 'مرحبا hello, world. عالم ٣٤'},
];
const CASE_TEXTS = [...TEXTS, ...EXTRA_TEXTS];
/** Latin, European and Arabic numbers inside and beside rtl runs. */
const BIDI_REFERENCE_TEXTS = [
  'Hello world',
  'Hello world \u05e9\u05dc\u05d5\u05dd',
  '\u05e9\u05dc\u05d5\u05dd Hello world',
  '\u05e2\u05d5\u05dc\u05dd 12 end',
  '\u05e9\u05dc\u05d5\u05dd 123 \u05e2\u05d5\u05dc\u05dd',
  'abc 12 def',
  'hello \u05e2\u05d5\u05dc\u05dd 12, world!',
  'price: 5% (\u05e9\u05e7\u05dc) 7-9',
  '\u05de\u05d7\u05d9\u05e8 12.50 \u05e9"\u05d7',
  '\u0645\u0631\u062d\u0628\u0627 \u0661\u0662 \u0639\u0627\u0644\u0645',
  '\u0645\u0631\u062d\u0628\u0627 34 \u0639\u0627\u0644\u0645',
  'Hello\u200b world',
  'a\u00ad b c\u00add',
  'abc\u200b \u05e9\u05dc\u05d5\u05dd',
  '\u05e9\u200d\u05dc hello \u05e2\u05b8\u05d5',
  'cafe\u0301 \u05e9\u05dc\u05d5\u05dd 12',
];
const WHITE_SPACES: WhiteSpaceMode[] = ['normal', 'pre-wrap'];
const LETTER_SPACINGS = [0, 2];
const ALIGNS: TextAlign[] = ['left', 'center', 'right', 'justify'];
const DIRECTIONS: TextDirection[] = ['ltr', 'rtl'];
const WIDTHS = [37, 61, 120];
const OVERFLOW_WRAPS: OverflowWrapMode[] = ['anywhere', 'normal'];

/** The sweep may only grow: a shrunken sweep is a weaker gate. */
const WIDTH_COMPARISONS = 1000;
const PIECE_CHECKS = 3000;
const GLYPH_CHECKS = 1600;
const ALIGN_COMPARISONS = 2000;
const ORDER_COMPARISONS = 1168;

mockTextContext(mockFontWidth, mockFontBounds);

type Built = {
  items: ParagraphItems;
  text: string;
  metrics: readonly ParagraphMetrics[];
  vertical: ParagraphVerticalMetrics;
};

function textRun(
  text: string,
  paint: string,
  metrics: RunMetrics,
): ContentRun<string, string> {
  return {kind: 'text', text, paint, owner: paint, metrics};
}

function build(
  runs: readonly ContentRun<string, string>[],
  whiteSpace: WhiteSpaceMode,
  letterSpacing: number,
): Built {
  const content = buildParagraphContent(runs, whiteSpace);
  const mixed = prepareMixedParagraph(
    content,
    {whiteSpace, wordBreak: 'normal', metrics: {font: FONT, letterSpacing}},
    canvasParagraphMeasurer,
  );
  const metrics = mixed.preparations.map(one => one.metrics);
  return {
    items: mixed.items,
    text: content.text,
    metrics,
    vertical: readVerticalMetrics(
      mixed.items,
      metrics,
      LINE_HEIGHT,
      canvasParagraphMeasurer,
    ),
  };
}

function constraintsOf(
  vertical: ParagraphVerticalMetrics,
  maxWidth: number,
  exclusions: readonly TextShapeExclusion[],
  overflowWrap: OverflowWrapMode = 'anywhere',
): BreakConstraints {
  return {
    maxWidth,
    textWrap: true,
    overflowWrap,
    exclusions,
    vertical,
  };
}

const EXCLUSION_SETS: {name: string; exclusions: TextShapeExclusion[]}[] = [
  {name: 'none', exclusions: []},
  {
    name: 'left',
    exclusions: [{kind: 'rect', x: 0, y: 0, width: 18, height: 60}],
  },
  {
    name: 'right',
    exclusions: [{kind: 'rect', x: 24, y: 10, width: 14, height: 80}],
  },
];

function optionsOf(
  built: Built,
  textAlign: TextAlign,
  direction: TextDirection,
  blockWidth: number,
): PlaceOptions {
  return {
    text: built.text,
    metrics: built.metrics,
    vertical: built.vertical,
    textAlign,
    direction,
    verticalAlign: 'top',
    blockWidth,
    blockHeight: 1000,
    measurer: canvasParagraphMeasurer,
  };
}

function place(
  built: Built,
  width: number,
  textAlign: TextAlign,
  direction: TextDirection,
  exclusions: readonly TextShapeExclusion[] = [],
  overflowWrap?: OverflowWrapMode,
): {broken: BrokenParagraph; placed: PlacedParagraph} {
  const broken = breakParagraph(
    built.items,
    constraintsOf(built.vertical, width, exclusions, overflowWrap),
  );
  return {
    broken,
    placed: placeParagraph(
      built.items,
      broken,
      optionsOf(built, textAlign, direction, width),
    ),
  };
}

type EdgeAlign = 'left' | 'right' | 'center';

/** The box edge a fitting line's ink lands on, per CSS Text 3. */
const ALIGN_TABLE: Record<TextAlign, Record<TextDirection, EdgeAlign>> = {
  left: {ltr: 'left', rtl: 'left'},
  right: {ltr: 'right', rtl: 'right'},
  center: {ltr: 'center', rtl: 'center'},
  end: {ltr: 'right', rtl: 'left'},
  start: {ltr: 'left', rtl: 'right'},
  justify: {ltr: 'left', rtl: 'right'},
};

/** Records each alignment miss; returns whether the line overflows. */
function checkLineAlignment(
  line: PlacedLine,
  align: TextAlign,
  direction: TextDirection,
  where: string,
  findings: string[],
): boolean {
  const boxLeft = line.segment.left;
  const boxRight = line.segment.right;
  const inkLeft = line.left;
  const inkRight = line.left + line.inkWidth;
  const overflowing = line.inkWidth - (boxRight - boxLeft) > 1e-6;

  if (overflowing) {
    // A line too long for its box is start-aligned: start is left in ltr,
    // right in rtl.
    const [actual, expected] =
      direction === 'rtl' ? [inkRight, boxRight] : [inkLeft, boxLeft];
    if (Math.abs(actual - expected) > 1e-6) {
      findings.push(`${where}: overflow edge ${actual} != ${expected}`);
    }
    return true;
  }

  if (line.justified) {
    if (Math.abs(inkLeft - boxLeft) > 1e-6) {
      findings.push(`${where}: justified left ${inkLeft} != ${boxLeft}`);
    }
    return false;
  }

  const edge = ALIGN_TABLE[align][direction];
  if (edge === 'left' && Math.abs(inkLeft - boxLeft) > 1e-6) {
    findings.push(`${where}: left edge ${inkLeft} != ${boxLeft}`);
  } else if (edge === 'right' && Math.abs(inkRight - boxRight) > 1e-6) {
    findings.push(`${where}: right edge ${inkRight} != ${boxRight}`);
  } else if (edge === 'center') {
    const center = (inkLeft + inkRight) / 2;
    const boxCenter = (boxLeft + boxRight) / 2;
    if (Math.abs(center - boxCenter) > 1e-6) {
      findings.push(`${where}: center ${center} != ${boxCenter}`);
    }
  }
  return false;
}

/** Right edge of the line's ink, read back from the placed pieces. */
function inkRight(line: PlacedLine): number {
  let right = line.left;
  for (const piece of line.pieces) {
    if (piece.hanging) continue;
    right = Math.max(right, piece.x + piece.advance + piece.hyphen);
  }
  return right;
}

/** Pen extent of a placed line, from its own pieces. */
function penWidth(line: PlacedLine): number {
  if (line.pieces.length === 0) return 0;
  let left = Infinity;
  let right = -Infinity;
  for (const piece of line.pieces) {
    left = Math.min(left, piece.x);
    right = Math.max(right, piece.x + piece.advance + piece.hyphen);
  }
  return right - left;
}

type SweepCase = Built & {name: string};

const CASE_MEMO: SweepCase[] = [];

/** Built on first use: the fake canvas is only installed once the suite runs. */
function sweepCases(): SweepCase[] {
  if (CASE_MEMO.length > 0) return CASE_MEMO;
  for (const {name, text} of CASE_TEXTS) {
    for (const whiteSpace of WHITE_SPACES) {
      for (const letterSpacing of LETTER_SPACINGS) {
        CASE_MEMO.push({
          name: `${name}/${whiteSpace}/ls${letterSpacing}`,
          ...build(
            [textRun(text, 'a', {font: FONT, letterSpacing})],
            whiteSpace,
            letterSpacing,
          ),
        });
      }
    }
  }
  return CASE_MEMO;
}

/** The same text painted in three-character runs of one metric tuple. */
function splitRuns(
  text: string,
  letterSpacing: number,
): ContentRun<string, string>[] {
  const runs: ContentRun<string, string>[] = [];
  for (let at = 0; at < text.length; at += 3) {
    runs.push(
      textRun(text.slice(at, at + 3), `p${runs.length}`, {
        font: FONT,
        letterSpacing,
      }),
    );
  }
  if (runs.length === 0) {
    runs.push(textRun('', 'p0', {font: FONT, letterSpacing}));
  }
  return runs;
}

function shapeKey(placed: PlacedParagraph): string {
  return placed.lines
    .map(line =>
      [
        line.left.toFixed(6),
        line.inkWidth.toFixed(6),
        line.width.toFixed(6),
        line.pieces
          .map(p => `${p.x.toFixed(6)}+${p.advance.toFixed(6)}`)
          .join(','),
      ].join('|'),
    )
    .join(';');
}

function glyphKey(placed: PlacedParagraph) {
  return placed.lines
    .map(line =>
      line.pieces
        .map(piece =>
          graphemeXs(piece)
            .map(x => x.toFixed(6))
            .join(','),
        )
        .join('|'),
    )
    .join(';');
}

/** A paint call a consumer makes: the text it draws and the pen it draws from. */
type Painted = {text: string; x: number};

/**
 * Every paint call a placed paragraph makes, read from the placed data alone.
 * A consumer does no arithmetic, so a recorded x is the placement's own.
 */
function paintCalls(options: PlaceOptions, placed: PlacedParagraph): Painted[] {
  const calls: Painted[] = [];
  for (const line of placed.lines) {
    for (const piece of line.pieces) {
      const text = options.text.slice(piece.sourceStart, piece.sourceEnd);
      if (text.trim() !== '' && piece.advance > 0) {
        const anchor = paintAnchorOf(piece, piece.sourceStart, piece.sourceEnd);
        calls.push({text: anchor.text, x: round(anchor.penX)});
      }
      if (piece.hyphen > 0) calls.push({text: '-', x: round(piece.hyphenX)});
    }
  }
  return calls;
}

/**
 * Where each character of `text` shows when the platform draws it in one
 * call: UAX9 levels at the block's own level, then rule L2.
 */
function visualIndexes(text: string, direction: TextDirection): number[] {
  const base = direction === 'rtl' ? 1 : 0;
  const levels = computeBidiLevels(text, base) ?? new Int8Array(text.length);
  const order = [...text].map((_, index) => index);
  const highest = Math.max(base, ...levels);
  for (let level = highest; level >= 1; level--) {
    for (let start = 0; start < order.length;) {
      if (levels[order[start]] < level) {
        start++;
        continue;
      }
      let end = start;
      while (end < order.length && levels[order[end]] >= level) end++;
      order.splice(start, end - start, ...order.slice(start, end).reverse());
      start = end;
    }
  }
  const shown: number[] = [];
  order.forEach((index, at) => (shown[index] = at));
  return shown;
}

/**
 * Every line whose drawn pieces, read left to right, do not follow the order
 * `visual` shows the line's characters in, and how many lines had two pieces
 * to order.
 */
function orderFindings(
  text: string,
  placed: PlacedParagraph,
  visual: (line: string) => number[],
): {misses: string[]; compared: number} {
  const misses: string[] = [];
  let compared = 0;
  placed.lines.forEach((line, l) => {
    const drawn = line.pieces.filter(
      piece => !piece.hanging && piece.advance > 0,
    );
    if (drawn.length < 2) return;
    compared++;
    const start = Math.min(...drawn.map(piece => piece.sourceStart));
    const end = Math.max(...drawn.map(piece => piece.sourceEnd));
    const shown = visual(text.slice(start, end));
    const at = (piece: PlacedPiece) => shown[piece.sourceStart - start];
    const byX = [...drawn].sort((a, b) => a.x - b.x);
    const byVisual = [...drawn].sort((a, b) => at(a) - at(b));
    const order = (pieces: PlacedPiece[]) =>
      pieces
        .map(piece => text.slice(piece.sourceStart, piece.sourceEnd))
        .join('|');
    if (order(byX) !== order(byVisual)) {
      misses.push(`#${l}: ${order(byX)} != ${order(byVisual)}`);
    }
  });
  return {misses, compared};
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Counts what a traversal asks the measurer for. */
function countingMeasurer(): ParagraphMeasurer & {calls: number} {
  const counted = {
    calls: 0,
    prepare: canvasParagraphMeasurer.prepare,
    measureAdvance(text: string, metrics: ParagraphMetrics) {
      counted.calls++;
      return canvasParagraphMeasurer.measureAdvance(text, metrics);
    },
    measureFontBox: canvasParagraphMeasurer.measureFontBox,
  };
  return counted;
}

describe('placeParagraph', () => {
  it('sums its pieces to the width the break pass reported', () => {
    const findings: string[] = [];
    let comparisons = 0;
    for (const sweep of sweepCases()) {
      for (const width of WIDTHS) {
        for (const set of EXCLUSION_SETS) {
          const {broken, placed} = place(
            sweep,
            width,
            'left',
            'ltr',
            set.exclusions,
          );
          for (let l = 0; l < broken.lines.length; l++) {
            comparisons++;
            const line = placed.lines[l];
            const pen = penWidth(line) + line.trailing;
            if (Math.abs(pen - broken.lines[l].width) > 1e-6) {
              findings.push(
                `${sweep.name}/${set.name}@${width}#${l}: ${pen} != ${broken.lines[l].width}`,
              );
            }
          }
        }
      }
    }
    expect(comparisons).toBeGreaterThanOrEqual(WIDTH_COMPARISONS);
    expect(findings).toEqual([]);
  });

  it('keeps every piece inside its line segment', () => {
    const findings: string[] = [];
    let checks = 0;
    for (const sweep of sweepCases()) {
      for (const width of WIDTHS) {
        for (const set of EXCLUSION_SETS) {
          const {placed} = place(sweep, width, 'left', 'ltr', set.exclusions);
          for (let l = 0; l < placed.lines.length; l++) {
            const line = placed.lines[l];
            const lone = line.pieces.filter(p => !p.hanging).length <= 1;
            const right = line.left + line.inkWidth + EPSILON;
            for (const piece of line.pieces) {
              checks++;
              if (piece.hanging || lone) continue;
              if (piece.x < line.segment.left - EPSILON) {
                findings.push(`${sweep.name}/${set.name}@${width}#${l}: left`);
              }
              if (piece.x + piece.advance > right) {
                findings.push(`${sweep.name}/${set.name}@${width}#${l}: right`);
              }
            }
          }
        }
      }
    }
    expect(checks).toBeGreaterThanOrEqual(PIECE_CHECKS);
    expect(findings).toEqual([]);
  });

  it('places the same coordinates for a paint-only seam', () => {
    const findings: string[] = [];
    for (const {name, text} of CASE_TEXTS) {
      for (const letterSpacing of LETTER_SPACINGS) {
        const whole = build(
          [textRun(text, 'a', {font: FONT, letterSpacing})],
          'normal',
          letterSpacing,
        );
        const split = build(
          splitRuns(text, letterSpacing),
          'normal',
          letterSpacing,
        );
        for (const width of WIDTHS) {
          for (const align of ALIGNS) {
            const a = place(whole, width, align, 'ltr').placed;
            const b = place(split, width, align, 'ltr').placed;
            if (shapeKey(a) !== shapeKey(b)) {
              findings.push(`${name}/ls${letterSpacing}@${width}/${align}`);
              continue;
            }
            if (glyphKey(a) !== glyphKey(b)) {
              findings.push(
                `${name}/ls${letterSpacing}@${width}/${align}: glyphs`,
              );
            }
          }
        }
      }
    }
    expect(findings).toEqual([]);
  });

  it('gives justification slack to the glue only', () => {
    const findings: string[] = [];
    let justifiedLines = 0;
    for (const sweep of sweepCases()) {
      for (const width of WIDTHS) {
        const {placed} = place(sweep, width, 'justify', 'ltr');
        const natural = place(sweep, width, 'left', 'ltr').placed;
        for (let l = 0; l < placed.lines.length; l++) {
          const line = placed.lines[l];
          if (!line.justified) continue;
          justifiedLines++;
          const where = `${sweep.name}@${width}#${l}`;
          const slack = line.pieces.reduce((sum, p) => sum + p.slack, 0);
          const available = line.segment.right - line.segment.left;
          if (
            Math.abs(slack - (available - natural.lines[l].inkWidth)) > 1e-6
          ) {
            findings.push(`${where}: slack ${slack}`);
          }
          const right = inkRight(line);
          if (Math.abs(right - line.segment.right) > 1e-6) {
            findings.push(`${where}: ends at ${right}`);
          }
          for (const piece of line.pieces) {
            const kind = sweep.items.kinds[piece.item];
            if (kind === 'space' || kind === 'preserved-space') continue;
            if (piece.slack !== 0) findings.push(`${where}: ${kind} stretched`);
          }
        }
      }
    }
    expect(justifiedLines).toBeGreaterThan(50);
    expect(findings).toEqual([]);
  });

  it('never justifies a last line or a hard-break line', () => {
    const built = build(
      [textRun('one two three\nfour five', 'a', REGULAR)],
      'pre-wrap',
      0,
    );
    const {placed} = place(built, 200, 'justify', 'ltr');
    expect(placed.lines.map(line => line.justified)).toEqual([false, false]);
  });

  it('justifies around an inline box without stretching it', () => {
    const built = build(
      [
        textRun('one two ', 'a', REGULAR),
        {
          kind: 'object',
          width: 30,
          height: 20,
          paint: 'b',
          owner: 'b',
          metrics: REGULAR,
        },
        textRun(' three four five', 'c', REGULAR),
      ],
      'normal',
      0,
    );
    const {placed} = place(built, 140, 'justify', 'ltr');
    expect(placed.lines.length).toBeGreaterThan(1);
    const line = placed.lines[0];
    expect(line.justified).toBe(true);
    const box = line.pieces.find(
      piece => built.items.kinds[piece.item] === 'inline-box',
    );
    expect(box).toBeDefined();
    expect(box?.advance).toBe(30);
    expect(box?.slack).toBe(0);
    expect(inkRight(line)).toBeCloseTo(line.segment.right);
  });

  it('orders every line as the platform orders one draw of it', () => {
    const findings: string[] = [];
    let compared = 0;
    for (const sweep of sweepCases()) {
      for (const width of WIDTHS) {
        for (const align of ALIGNS) {
          for (const direction of DIRECTIONS) {
            const {placed} = place(sweep, width, align, direction);
            const found = orderFindings(sweep.text, placed, text =>
              visualIndexes(text, direction),
            );
            compared += found.compared;
            findings.push(
              ...found.misses.map(
                miss => `${sweep.name}@${width}/${align}/${direction}${miss}`,
              ),
            );
          }
        }
      }
    }
    expect(findings).toEqual([]);
    expect(compared).toBeGreaterThanOrEqual(ORDER_COMPARISONS);
  });

  it('orders Latin and numbers beside rtl text as UAX9 does', () => {
    const findings: string[] = [];
    for (const text of BIDI_REFERENCE_TEXTS) {
      const built = build([textRun(text, 'a', REGULAR)], 'normal', 0);
      for (const width of [60, 130, 400]) {
        for (const align of ALIGNS) {
          for (const direction of DIRECTIONS) {
            const {placed} = place(built, width, align, direction);
            const level = direction === 'rtl' ? 1 : 0;
            const found = orderFindings(text, placed, line =>
              referenceVisualIndexes(line, level),
            );
            findings.push(
              ...found.misses.map(
                miss => `${text}@${width}/${align}/${direction}${miss}`,
              ),
            );
          }
        }
      }
    }
    expect(findings).toEqual([]);
  });

  it('keeps a Latin line in its own order in an rtl block', () => {
    const built = build([textRun('Hello world', 'a', REGULAR)], 'normal', 0);
    const calls = paintCalls(
      optionsOf(built, 'left', 'rtl', 400),
      place(built, 400, 'left', 'rtl').placed,
    );
    expect(calls).toEqual([
      {text: 'Hello', x: 0},
      {text: 'world', x: 60},
    ]);
  });

  it.each([
    ['a zero width space', '\u200B'],
    ['a soft hyphen', '\u00AD'],
    ['a right-to-left embedding', '\u202B'],
    ['a right-to-left isolate', '\u2067'],
  ])('keeps a Latin line in order in an rtl block around %s', (_, code) => {
    const built = build(
      [textRun(`Hello${code} world`, 'a', REGULAR)],
      'normal',
      0,
    );
    const calls = paintCalls(
      optionsOf(built, 'left', 'rtl', 400),
      place(built, 400, 'left', 'rtl').placed,
    );
    const hello = calls.find(call => call.text.startsWith('Hello'));
    const world = calls.find(call => call.text.endsWith('world'));
    expect(hello?.x).toBe(0);
    expect(world?.x).toBeGreaterThan(hello?.x ?? Infinity);
  });

  it('keeps a space between Latin and Hebrew beside a zero width space', () => {
    const levels = computeBidiLevels('abc\u200B \u05e9\u05dc', 0);
    expect(Array.from(levels ?? [])).toEqual([0, 0, 0, 0, 0, 1, 1]);
  });

  it('reads a right-to-left mark as a strong character', () => {
    const levels = computeBidiLevels('ab\u200F 12', 0);
    expect(Array.from(levels ?? [])).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('keeps a number inside the rtl run it is embedded in', () => {
    const built = build([textRun('עולם 12 end', 'a', REGULAR)], 'normal', 0);
    const calls = paintCalls(
      optionsOf(built, 'left', 'ltr', 400),
      place(built, 400, 'left', 'ltr').placed,
    );
    expect(calls).toEqual([
      {text: 'עולם', x: 30},
      {text: '12', x: 0},
      {text: 'end', x: 80},
    ]);
  });

  it('reorders nothing in an ltr block below U+0590', () => {
    const below = String.fromCharCode(
      ...Array.from({length: 0x0590}, (_, code) => code),
    );
    expect(computeBidiLevels(below, 0)).toBeNull();
    expect(computeBidiLevels(below + '\u0590', 0)).not.toBeNull();
    for (const mark of ['\u061C', '\u200F']) {
      expect(computeBidiLevels(`a${mark}b`, 0)).not.toBeNull();
    }
  });

  it('splits the slack evenly for center and gives it all to right', () => {
    const built = build([textRun('one two', 'a', REGULAR)], 'normal', 0);
    const left = place(built, 200, 'left', 'ltr').placed.lines[0];
    const center = place(built, 200, 'center', 'ltr').placed.lines[0];
    const right = place(built, 200, 'right', 'ltr').placed.lines[0];
    expect(left.left).toBeCloseTo(0);
    expect(center.left).toBeCloseTo((200 - left.inkWidth) / 2);
    expect(right.left).toBeCloseTo(200 - left.inkWidth);
    expect(center.inkWidth).toBeCloseTo(left.inkWidth);
  });

  it('starts a line wider than its box at the start edge', () => {
    const built = build(
      [textRun('supercalifragilistic', 'a', REGULAR)],
      'normal',
      0,
    );
    const broken = breakParagraph(built.items, {
      maxWidth: 100,
      textWrap: true,
      overflowWrap: 'normal',
      exclusions: [],
      vertical: built.vertical,
    });
    const lineOf = (align: TextAlign, direction: TextDirection) =>
      placeParagraph(
        built.items,
        broken,
        optionsOf(built, align, direction, 100),
      ).lines[0];
    for (const align of ALIGNS) {
      const ltr = lineOf(align, 'ltr');
      const rtl = lineOf(align, 'rtl');
      expect(ltr.inkWidth).toBeGreaterThan(100);
      expect(ltr.left).toBeCloseTo(0);
      expect(rtl.left).toBeCloseTo(100 - rtl.inkWidth);
    }
  });

  it('puts one baseline on a line and a box at the line top', () => {
    const built = build(
      [
        textRun('ab', 'a', REGULAR),
        {
          kind: 'object',
          width: 30,
          height: 44,
          paint: 'b',
          owner: 'b',
          metrics: REGULAR,
        },
        textRun('cd', 'c', TALL),
      ],
      'normal',
      0,
    );
    const {placed} = place(built, 400, 'left', 'ltr');
    expect(placed.lines).toHaveLength(1);
    const line = placed.lines[0];
    expect(line.height).toBe(50);
    expect(line.baseline).toBeGreaterThan(0);
    expect(line.top).toBe(0);
    const box = line.pieces.find(
      piece => built.items.kinds[piece.item] === 'inline-box',
    );
    expect(box?.advance).toBe(30);
    expect(box?.slack).toBe(0);
  });

  it('reads measured glyph positions from the placed data', () => {
    const findings: string[] = [];
    let checks = 0;
    // Only a text of one direction runs left to right in an ltr block.
    const oneDirection = sweepCases().filter(
      sweep => computeBidiLevels(sweep.text, 0) === null,
    );
    for (const sweep of oneDirection) {
      for (const width of WIDTHS) {
        const {placed} = place(sweep, width, 'justify', 'ltr');
        for (const line of placed.lines) {
          let previous = -Infinity;
          for (const piece of line.pieces) {
            checks++;
            const where = `${sweep.name}@${width}`;
            const xs = graphemeXs(piece);
            const edges = graphemeEdges(piece);
            if (xs.length > 0 && Math.abs(xs[0] - piece.x) > 1e-6) {
              findings.push(`${where}: starts at ${xs[0]}`);
            }
            if (Math.abs(edges[0] - piece.x) > 1e-6) {
              findings.push(`${where}: edge starts at ${edges[0]}`);
            }
            for (let g = 1; g < xs.length; g++) {
              if (xs[g] < xs[g - 1] - 1e-9) {
                findings.push(`${where}: glyph ${g} moves back`);
              }
            }
            for (let g = 1; g < edges.length; g++) {
              if (edges[g] < edges[g - 1] - 1e-9) {
                findings.push(`${where}: edge ${g} moves back`);
              }
            }
            const extent = edges[edges.length - 1] - piece.x;
            const spacing = sweep.items.letterSpacings[piece.item];
            const paints = piece.slack === 0 && piece.graphemeStart === 0;
            if (
              paints &&
              (extent < piece.advance - 1e-6 ||
                extent > piece.advance + spacing + 1e-6)
            ) {
              findings.push(`${where}: ends at ${extent}`);
            }
            if (piece.x < previous - 1e-6) {
              findings.push(`${where}: piece moves back`);
            }
            previous = piece.x + piece.advance;
          }
        }
      }
    }
    expect(checks).toBeGreaterThanOrEqual(GLYPH_CHECKS);
    expect(findings).toEqual([]);
  });

  it('paints a kerned pair across a paint seam inside its own width', () => {
    const built = build([textRun('AV', 'a', REGULAR)], 'normal', 0);
    const {placed} = place(built, 400, 'left', 'ltr');
    const piece = placed.lines[0].pieces[0];
    expect(piece.advance).toBeCloseTo(18);
    expect(graphemeEdges(piece)).toEqual([0, 10, 18]);
    expect(graphemeXs(piece)).toEqual([0, 8]);

    const head = paintAnchorOf(piece, 0, 1);
    const tail = paintAnchorOf(piece, 1, 2);
    expect(head.penX).toBeCloseTo(0);
    expect(tail.penX).toBeCloseTo(8);
    const own = (anchor: {text: string; metrics: ParagraphMetrics}) =>
      canvasParagraphMeasurer.measureAdvance(anchor.text, anchor.metrics);
    expect(head.penX + own(head)).toBeCloseTo(10);
    expect(tail.penX + own(tail)).toBeCloseTo(18);
  });

  it('spaces the grapheme origins by the platform convention', () => {
    const built = build(
      [textRun('abc', 'a', {font: FONT, letterSpacing: 2})],
      'normal',
      2,
    );
    const {placed} = place(built, 400, 'left', 'ltr');
    const piece = placed.lines[0].pieces[0];
    expect(graphemeXs(piece)).toEqual([0, 12, 24]);
    expect(graphemeEdges(piece)).toEqual([0, 12, 24, 36]);
    expect(piece.advance + placed.lines[0].trailing).toBeCloseTo(36);
  });

  it('keeps the terminal whitespace out of the justified glue', () => {
    const built = build([textRun('a b c', 'a', REGULAR)], 'normal', 0);
    const {placed} = place(built, 40, 'justify', 'ltr');
    const line = placed.lines[0];
    expect(line.justified).toBe(true);
    expect(inkRight(line)).toBeCloseTo(40);
    expect(line.pieces.filter(piece => piece.slack !== 0)).toHaveLength(1);

    const mirrored = place(built, 40, 'justify', 'rtl').placed.lines[0];
    const right = Math.max(
      ...mirrored.pieces
        .filter(piece => !piece.hanging)
        .map(piece => piece.x + piece.advance),
    );
    expect(right).toBeCloseTo(40);
  });

  it('does not justify a line whose only glue is terminal', () => {
    const built = build([textRun('a bbbbb', 'a', REGULAR)], 'normal', 0);
    const {placed} = place(built, 40, 'justify', 'ltr');
    expect(placed.lines[0].justified).toBe(false);
    expect(placed.lines[0].inkWidth).toBeCloseTo(10);
  });

  it('aligns an unwrapped line against the block width', () => {
    const built = build([textRun('abc', 'a', REGULAR)], 'normal', 0);
    const broken = breakParagraph(built.items, {
      maxWidth: Infinity,
      textWrap: false,
      overflowWrap: 'normal',
      exclusions: [],
      vertical: built.vertical,
    });
    const centered = placeParagraph(built.items, broken, {
      ...optionsOf(built, 'center', 'ltr', 100),
      blockWidth: 100,
    });
    expect(centered.lines[0].inkWidth).toBeCloseTo(30);
    expect(centered.lines[0].left).toBeCloseTo(35);

    const automatic = placeParagraph(built.items, broken, {
      ...optionsOf(built, 'center', 'ltr', Infinity),
      blockWidth: Infinity,
    });
    expect(automatic.lines[0].left).toBeCloseTo(0);
  });

  it('mirrors a hyphen in front of the text it ends', () => {
    const built = build([textRun('abc­def', 'a', REGULAR)], 'normal', 0);
    const ltr = place(built, 40, 'left', 'ltr').placed;
    expect(ltr.lines[0].inkWidth).toBeCloseTo(40);
    expect(
      paintCalls(optionsOf(built, 'left', 'ltr', 40), ltr).slice(0, 2),
    ).toEqual([
      {text: 'abc', x: 0},
      {text: '-', x: 30},
    ]);

    const rtl = place(built, 40, 'left', 'rtl').placed.lines[0];
    const hyphen = rtl.pieces.find(piece => piece.hyphen > 0);
    expect(hyphen?.hyphenX).toBeCloseTo(0);
    expect(hyphen?.hyphen).toBeCloseTo(10);
    const text = rtl.pieces.find(piece => piece.advance > 0);
    expect(text?.x).toBeCloseTo(10);
  });

  it('orders an embedded ltr run by the resolved bidi levels', () => {
    const built = build([textRun('אב abc def גד', 'a', REGULAR)], 'normal', 0);
    const {placed} = place(built, 400, 'left', 'rtl');
    const options = optionsOf(built, 'left', 'rtl', 400);
    const calls = paintCalls(options, placed);
    const abc = calls.find(call => call.text === 'abc');
    const def = calls.find(call => call.text === 'def');
    expect(abc).toBeDefined();
    expect(def).toBeDefined();
    expect(abc?.x).toBeLessThan(def?.x ?? 0);
  });

  it('paints a fixed set where hand arithmetic says it does', () => {
    const cases: {
      name: string;
      runs: ContentRun<string, string>[];
      spacing: number;
      width: number;
      align: TextAlign;
      direction: TextDirection;
      expected: Painted[];
    }[] = [
      {
        name: 'kerned pair',
        runs: [textRun('AV', 'a', REGULAR)],
        spacing: 0,
        width: 400,
        align: 'left',
        direction: 'ltr',
        expected: [{text: 'AV', x: 0}],
      },
      {
        name: 'spaces',
        runs: [textRun('a b', 'a', REGULAR)],
        spacing: 0,
        width: 400,
        align: 'left',
        direction: 'ltr',
        expected: [
          {text: 'a', x: 0},
          {text: 'b', x: 20},
        ],
      },
      {
        name: 'letter spacing',
        runs: [textRun('ab cd', 'a', {font: FONT, letterSpacing: 2})],
        spacing: 2,
        width: 400,
        align: 'left',
        direction: 'ltr',
        expected: [
          {text: 'ab', x: 0},
          {text: 'cd', x: 36},
        ],
      },
      {
        name: 'rtl',
        runs: [textRun('א ב', 'a', REGULAR)],
        spacing: 0,
        width: 400,
        align: 'left',
        direction: 'rtl',
        expected: [
          {text: 'א', x: 20},
          {text: 'ב', x: 0},
        ],
      },
      {
        name: 'hanging whitespace',
        runs: [textRun('a b c', 'a', REGULAR)],
        spacing: 0,
        width: 40,
        align: 'justify',
        direction: 'ltr',
        expected: [
          {text: 'a', x: 0},
          {text: 'b', x: 30},
          {text: 'c', x: 0},
        ],
      },
      {
        name: 'hyphen',
        runs: [textRun('abc­def', 'a', REGULAR)],
        spacing: 0,
        width: 40,
        align: 'left',
        direction: 'ltr',
        expected: [
          {text: 'abc', x: 0},
          {text: '-', x: 30},
          {text: 'def', x: 0},
        ],
      },
    ];

    for (const one of cases) {
      const built = build(one.runs, 'normal', one.spacing);
      const {placed} = place(built, one.width, one.align, one.direction);
      const options = optionsOf(built, one.align, one.direction, one.width);
      expect(paintCalls(options, placed), one.name).toEqual(one.expected);
    }
  });

  it('measures every paint slice once for a placement', () => {
    const words = Array.from({length: 600}, (_, at) => `w${at}`).join(' ');
    const measurer = countingMeasurer();
    const built = build([textRun(words, 'a', REGULAR)], 'normal', 0);
    const broken = breakParagraph(
      built.items,
      constraintsOf(built.vertical, 400, []),
    );
    const options = {...optionsOf(built, 'left', 'ltr', 400), measurer};
    const placed = placeParagraph(built.items, broken, options);

    expect(placed.lines.length).toBeGreaterThan(1);
    measurer.calls = 0;
    paintCalls(options, placed);
    expect(measurer.calls).toBe(0);
    paintCalls(options, placed);
    expect(measurer.calls).toBe(0);
  });

  it('aligns every line to its CSS edge and justifies by the natural slack', () => {
    const findings: string[] = [];
    let comparisons = 0;
    let overflowing = 0;
    for (const sweep of sweepCases()) {
      for (const width of WIDTHS) {
        for (const align of ALIGNS) {
          for (const direction of DIRECTIONS) {
            for (const overflowWrap of OVERFLOW_WRAPS) {
              const {placed} = place(
                sweep,
                width,
                align,
                direction,
                [],
                overflowWrap,
              );
              for (let l = 0; l < placed.lines.length; l++) {
                comparisons++;
                const line = placed.lines[l];
                const where = `${sweep.name}@${width}/${align}/${direction}/${overflowWrap}#${l}`;
                if (
                  checkLineAlignment(line, align, direction, where, findings)
                ) {
                  overflowing++;
                }
                if (!line.justified) continue;
                const slack = line.pieces.reduce((sum, p) => sum + p.slack, 0);
                const natural = place(
                  sweep,
                  width,
                  'left',
                  direction,
                  [],
                  overflowWrap,
                ).placed;
                const reference =
                  line.segment.right -
                  line.segment.left -
                  natural.lines[l].inkWidth;
                if (Math.abs(slack - reference) > 1e-6) {
                  findings.push(`${where}: slack ${slack} != ${reference}`);
                }
              }
            }
          }
        }
      }
    }
    expect(comparisons).toBeGreaterThanOrEqual(ALIGN_COMPARISONS);
    expect(overflowing).toBeGreaterThan(0);
    expect(findings).toEqual([]);
  });

  it('compresses justified glue into the segment it was scored for', () => {
    const built = build([textRun('aaaa bbbb cccc', 'a', REGULAR)], 'normal', 0);
    const broken = breakParagraphOptimally(built.items, {
      maxWidth: 88,
      textWrap: true,
      overflowWrap: 'normal',
      justify: true,
      vertical: built.vertical,
    });
    // The scorer priced the first line with its glue squeezed; placement draws
    // the squeeze, so 90 of natural ink stands in 88.
    expect(broken.lines[0].width).toBe(90);

    const ltr = placeParagraph(
      built.items,
      broken,
      optionsOf(built, 'justify', 'ltr', 88),
    ).lines[0];
    expect(ltr.justified).toBe(true);
    expect(ltr.inkWidth).toBe(88);
    expect(ltr.left).toBe(0);
    expect(inkRight(ltr)).toBe(88);

    const rtl = placeParagraph(
      built.items,
      broken,
      optionsOf(built, 'justify', 'rtl', 88),
    ).lines[0];
    expect(rtl.left).toBe(0);
    expect(rtl.inkWidth).toBe(88);

    // A segment even the tightest glue cannot answer keeps the floor: the 10
    // of glue draws at 4, and the line stands at 84 rather than 50.
    const tight = {
      ...broken,
      lines: broken.lines.map(line => ({
        ...line,
        segment: {left: 0, right: 50},
      })),
    };
    const squeezed = placeParagraph(
      built.items,
      tight,
      optionsOf(built, 'justify', 'ltr', 50),
    ).lines[0];
    expect(squeezed.pieces[1].advance).toBeCloseTo(4);
    expect(squeezed.inkWidth).toBeCloseTo(84);
  });

  it('never justifies a line a hard break closes', () => {
    const built = build([textRun('a b\t\nc', 'a', REGULAR)], 'pre-wrap', 0);
    const greedy = breakParagraph(
      built.items,
      constraintsOf(built.vertical, 50, []),
    );
    const optimal = breakParagraphOptimally(built.items, {
      maxWidth: 50,
      textWrap: true,
      overflowWrap: 'normal',
      justify: true,
      vertical: built.vertical,
    });
    // The greedy line ends in front of the newline it consumes, with a tab
    // hanging; the optimal one ends behind it. Neither is justified.
    expect(greedy.lines[0].endsOnHardBreak).toBe(true);
    expect(optimal.lines[0].endsOnHardBreak).toBe(true);
    for (const broken of [greedy, optimal]) {
      const line = placeParagraph(
        built.items,
        broken,
        optionsOf(built, 'justify', 'ltr', 50),
      ).lines[0];
      expect(line.justified).toBe(false);
      expect(line.pieces[2].x).toBe(20);
    }
  });

  it('reports what a partly held item paints, not what it fits', () => {
    const built = build([textRun('AV--a', 'a', REGULAR)], 'normal', 0);
    const broken = breakParagraphOptimally(built.items, {
      maxWidth: 30,
      textWrap: true,
      overflowWrap: 'normal',
      justify: false,
      vertical: built.vertical,
    });
    // `AV-` measures 30 grapheme by grapheme and paints 28: the kern is only
    // in the composed slice.
    expect(built.items.breakableFitAdvances[0]).toEqual([10, 10, 10, 10]);
    expect(broken.lines[0].width).toBe(28);

    const line = placeParagraph(
      built.items,
      broken,
      optionsOf(built, 'left', 'ltr', 30),
    ).lines[0];
    expect(line.pieces[0].advance).toBe(28);
    expect(graphemeEdges(line.pieces[0])).toEqual([0, 10, 18, 28]);
    expect(line.inkWidth).toBe(28);
  });

  it('paints an rtl piece from its own right edge', () => {
    const built = build([textRun('אב', 'a', REGULAR)], 'normal', 0);
    const {placed} = place(built, 100, 'left', 'rtl');
    const piece = placed.lines[0].pieces[0];
    expect(piece.rtl).toBe(true);
    expect(piece.advance).toBe(20);
    expect(graphemeXs(piece)).toEqual([10, 0]);
    expect(graphemeEdges(piece)).toEqual([20, 10, 0]);
    expect(paintAnchorOf(piece, 0, 1).penX).toBe(10);
    expect(paintAnchorOf(piece, 1, 2).penX).toBe(0);
  });

  it('stands a spaced hyphen past the gap the glyph before it owns', () => {
    const built = build([textRun('abc­de', 'a', SPACED)], 'normal', 2);
    const broken = breakParagraph(built.items, {
      maxWidth: 48,
      textWrap: true,
      overflowWrap: 'normal',
      exclusions: [],
      vertical: built.vertical,
    });
    const placed = placeParagraph(
      built.items,
      broken,
      optionsOf(built, 'left', 'ltr', 48),
    );
    const [text, hyphen] = placed.lines[0].pieces;
    // 34 of ink, then the 2px gap `c` owns, then the hyphen's own 12.
    expect(text.x + text.advance).toBe(34);
    expect(hyphen.x).toBe(36);
    expect(hyphen.hyphenX).toBe(36);
    expect(hyphen.hyphen).toBe(12);
    expect(placed.lines[0].width).toBe(48);
  });

  it('reads a text grid at the platform spacing', () => {
    const one = build([textRun('a', 'a', SPACED)], 'normal', 2);
    const single = place(one, 40, 'left', 'ltr').placed.lines[0].pieces[0];
    expect(single.advance).toBe(10);
    expect(graphemeEdges(single)).toEqual([0, 12]);

    const three = build([textRun('abc', 'a', SPACED)], 'normal', 2);
    const whole = place(three, 40, 'left', 'ltr').placed.lines[0].pieces[0];
    expect(whole.advance).toBe(34);
    expect(paintAnchorOf(whole, 0, 3).advance).toBe(36);
    expect(graphemeEdges(whole)).toEqual([0, 12, 24, 36]);
  });
});
