import type {LayoutLineRange} from '@chenglou/pretext';
import {layoutNextLineRange, walkLineRanges} from '@chenglou/pretext';
import {describe, expect, it} from 'vitest';
import type {TextExclusion} from '../../partials/types';
import type {
  BreakConstraints,
  BrokenLine,
  BrokenParagraph,
  OverflowWrapMode,
} from '../../text/breakParagraph';
import {breakParagraph} from '../../text/breakParagraph';
import type {ParagraphVerticalMetrics} from '../../text/lineMetrics';
import {readVerticalMetrics} from '../../text/lineMetrics';
import {measureLineSpan, measureLineSpanFit} from '../../text/lineSpan';
import {prepareMixedParagraph} from '../../text/mixedParagraph';
import type {ContentRun, RunMetrics} from '../../text/paragraphContent';
import {buildParagraphContent} from '../../text/paragraphContent';
import type {ParagraphItems} from '../../text/paragraphItems';
import type {
  ParagraphMetrics,
  WhiteSpaceMode,
} from '../../text/preparedParagraph';
import {
  canvasParagraphMeasurer,
  prepareParagraph,
} from '../../text/preparedParagraph';
import {getEngineProfile} from '../../text/pretext-derived/engineProfile';
import {
  getPartialPaintCorrection,
  normalizePreparedLineStart,
  offersInternalBreak,
  walkPreparedLinesRaw,
} from '../../text/pretext-derived/lineBreak';
import {mockTextContext} from './mockTextContext';
import {mockFontBounds, mockFontWidth, TEXTS} from './textInvariants';

const FONT = '400 20px sans-serif';
/** 10px glyphs, 20px line boxes. */
const REGULAR: RunMetrics = {font: FONT, letterSpacing: 0};
const WIDE: RunMetrics = {font: '700 41px sans-serif', letterSpacing: 0};
/** 25px glyphs, 50px line boxes. */
const TALL: RunMetrics = {font: '400 50px sans-serif', letterSpacing: 0};
const LINE_HEIGHT = '100%';

const EXTRA_TEXTS = [
  {name: 'soft-hyphens', text: 'un­break­able ex­tra words'},
  {name: 'long-word', text: 'a supercalifragilisticexpialidocious word'},
  {name: 'dashed', text: 'a well-known-but-very-long-compound end'},
  {name: 'hard-breaks', text: 'one\n\ntwo three\nfour'},
  {name: 'cjk', text: '你好世界 tail 漢字'},
  {name: 'url', text: 'a www.abc-def.com tail'},
];
const CASE_TEXTS = [...TEXTS, ...EXTRA_TEXTS];
const WHITE_SPACES: WhiteSpaceMode[] = ['normal', 'pre-wrap'];
const LETTER_SPACINGS = [0, 2];

/** The sweep may only grow: a shrunken sweep is a weaker gate. */
const PARITY_COMPARISONS = 1758;
const SEGMENT_COMPARISONS = 3853;
const BAND_COMPARISONS = 2013;
const MEASURE_COMPARISONS = 10717;

const EPSILON = getEngineProfile().lineFitEpsilon;

const EXCLUSION_SETS: {name: string; exclusions: TextExclusion[]}[] = [
  {name: 'none', exclusions: []},
  {
    name: 'left',
    exclusions: [{kind: 'rect', x: 0, y: 0, width: 40, height: 60}],
  },
  {
    name: 'right',
    exclusions: [{kind: 'rect', x: 90, y: 0, width: 60, height: 70}],
  },
  {
    name: 'middle',
    exclusions: [{kind: 'rect', x: 45, y: 10, width: 40, height: 40}],
  },
  {
    name: 'padded',
    exclusions: [
      {
        kind: 'rect',
        x: 100,
        y: 0,
        width: 30,
        height: 200,
        horizontalPadding: 6,
        verticalPadding: 4,
      },
    ],
  },
  {
    name: 'polygon',
    exclusions: [
      {
        kind: 'polygon',
        points: [
          {x: 0, y: 0},
          {x: 50, y: 0},
          {x: 0, y: 80},
        ],
      },
    ],
  },
];

function metricsOf(
  whiteSpace: WhiteSpaceMode,
  letterSpacing: number,
): ParagraphMetrics {
  return {font: FONT, whiteSpace, wordBreak: 'normal', letterSpacing};
}

function verticalOf(
  items: ParagraphItems,
  metrics: readonly ParagraphMetrics[],
): ParagraphVerticalMetrics {
  return readVerticalMetrics(
    items,
    metrics,
    LINE_HEIGHT,
    canvasParagraphMeasurer,
  );
}

function constraintsOf(
  vertical: ParagraphVerticalMetrics,
  maxWidth: number,
  exclusions: readonly TextExclusion[] = [],
  overflowWrap: OverflowWrapMode = 'anywhere',
  textWrap = true,
): BreakConstraints {
  return {maxWidth, textWrap, overflowWrap, exclusions, vertical};
}

type SweepCase = {
  name: string;
  items: ParagraphItems;
  vertical: ParagraphVerticalMetrics;
  handle: ReturnType<typeof prepareParagraph>['handle'];
};

const CASE_MEMO: SweepCase[] = [];

/** Built on first use: the fake canvas is only installed once the suite runs. */
function sweepCases(): SweepCase[] {
  if (CASE_MEMO.length > 0) return CASE_MEMO;
  for (const {name, text} of CASE_TEXTS) {
    for (const whiteSpace of WHITE_SPACES) {
      for (const letterSpacing of LETTER_SPACINGS) {
        const metrics = metricsOf(whiteSpace, letterSpacing);
        const prepared = prepareParagraph(text, metrics);
        CASE_MEMO.push({
          name: `${name}/${whiteSpace}/ls${letterSpacing}`,
          items: prepared.items,
          vertical: verticalOf(prepared.items, [metrics]),
          handle: prepared.handle,
        });
      }
    }
  }
  return CASE_MEMO;
}

/** Widths on and beside every item edge, plus the degenerate limits. */
function probeWidths(items: ParagraphItems): number[] {
  const widths = new Set<number>([0, 1, 1e9, Infinity]);
  let prefix = 0;
  for (let i = 0; i < items.widths.length; i++) {
    const leading = i === 0 ? 0 : items.letterSpacings[i];
    prefix += leading + items.widths[i];
    for (const nudge of [-EPSILON, 0, 0.004]) {
      widths.add(Math.max(0, prefix + nudge));
    }
  }
  return [...widths];
}

/** Widths a banded sweep probes, which the exclusions are sized for. */
const BAND_WIDTHS = [30, 55, 80, 110, 150];

/** What a line comparison reads, of a line of either walk. */
type LineShape = {
  readonly start: Cursor;
  readonly end: Cursor;
  readonly width: number;
};

function lineKey(line: LineShape): string {
  return [
    line.start.segmentIndex,
    line.start.graphemeIndex,
    line.end.segmentIndex,
    line.end.graphemeIndex,
    line.width.toFixed(9),
  ].join(':');
}

/**
 * A line end a following line start would move over is the same line end: the
 * two walks put the cursor on either side of the space they both drop.
 */
function settledKey(items: ParagraphItems, line: LineShape): string {
  const end = {
    segmentIndex: line.end.segmentIndex,
    graphemeIndex: line.end.graphemeIndex,
  };
  normalizePreparedLineStart(items, end);
  return lineKey({start: line.start, end, width: line.width});
}

/**
 * Whether the line this fork broke ends at a break inside the unit the line
 * pretext broke stops in front of. Upstream leaves such a break unused once a
 * line has content, so from that line on the two walks hold different text.
 */
function takesAnInternalBreak(
  items: ParagraphItems,
  mine: LineShape | undefined,
  theirs: LineShape | undefined,
): boolean {
  if (mine === undefined || theirs === undefined) return false;
  if (
    mine.start.segmentIndex !== theirs.start.segmentIndex ||
    mine.start.graphemeIndex !== theirs.start.graphemeIndex
  ) {
    return false;
  }
  return (
    mine.end.graphemeIndex > 0 &&
    offersInternalBreak(items, mine.end.segmentIndex) &&
    before(theirs.end, mine.end)
  );
}

/**
 * Whether the line holds part of an item that paints something other than the
 * grapheme advances of that part: the slice is shaped on its own, so a kern
 * inside it counts and a kern to the text it was cut from does not. The walk
 * charges the advances; the span measures the ink.
 */
function shapesASlice(
  items: ParagraphItems,
  line: {start: Cursor; end: Cursor},
): boolean {
  const last =
    line.end.graphemeIndex > 0
      ? line.end.segmentIndex
      : line.end.segmentIndex - 1;
  if (last < line.start.segmentIndex) return false;
  const to =
    last === line.start.segmentIndex && line.end.graphemeIndex > 0
      ? line.end.graphemeIndex
      : -1;
  if (
    getPartialPaintCorrection(
      items,
      line.start.segmentIndex,
      line.start.graphemeIndex,
      to,
    ) !== 0
  ) {
    return true;
  }
  return (
    last > line.start.segmentIndex &&
    line.end.graphemeIndex > 0 &&
    getPartialPaintCorrection(items, last, 0, line.end.graphemeIndex) !== 0
  );
}

/**
 * Whether pretext ends a line on a hyphen it hangs past the free width. The
 * owned pass refuses that break: a hyphen it paints stands inside the segment.
 */
function hangsAHyphen(
  items: ParagraphItems,
  lines: readonly LayoutLineRange[],
  maxWidth: number,
): boolean {
  return lines.some(
    line =>
      line.end.graphemeIndex === 0 &&
      items.kinds[line.end.segmentIndex - 1] === 'soft-hyphen' &&
      line.width > maxWidth,
  );
}

function available(line: BrokenLine): number {
  return line.segment.right - line.segment.left;
}

/** Last item the line holds, whole or in part. */
function lastItem(line: BrokenLine): number {
  return line.end.graphemeIndex > 0
    ? line.end.segmentIndex
    : line.end.segmentIndex - 1;
}

/** Letter spacing the line ends with, which is a gap and not ink. */
function terminalSpacing(items: ParagraphItems, line: BrokenLine): number {
  for (let i = lastItem(line); i >= line.items.start; i--) {
    const kind = items.kinds[i];
    if (
      kind === 'soft-hyphen' ||
      kind === 'zero-width-break' ||
      kind === 'hard-break'
    ) {
      continue;
    }
    return Math.max(0, items.letterSpacings[i]);
  }
  return 0;
}

/**
 * Painted ink of the line that has to fit its segment. A preserved space or
 * tab at a line end hangs past the edge, as CSS hangs it, and the gap after
 * the last glyph is not ink.
 */
function containedWidth(items: ParagraphItems, line: BrokenLine): number {
  const last = lastItem(line);
  if (last < line.items.start) return line.width;
  const kind = items.kinds[last];
  const hangs = kind === 'preserved-space' || kind === 'tab';
  return (
    line.width - (hangs ? items.widths[last] : 0) - terminalSpacing(items, line)
  );
}

function endsOnHyphen(items: ParagraphItems, line: BrokenLine): boolean {
  const last = line.end.segmentIndex - 1;
  return (
    line.end.graphemeIndex === 0 &&
    last >= 0 &&
    items.kinds[last] === 'soft-hyphen'
  );
}

/**
 * A hyphen may hang past the box edge, as pretext has it. It may not hang
 * into an exclusion, which is what a hard right edge means.
 */
function mayHang(
  items: ParagraphItems,
  line: BrokenLine,
  box: number,
): boolean {
  return endsOnHyphen(items, line) && line.segment.right >= box;
}

function overflows(
  items: ParagraphItems,
  line: BrokenLine,
  box: number,
): boolean {
  if (mayHang(items, line, box)) return false;
  return containedWidth(items, line) > available(line) + EPSILON;
}

const BREAKS_AFTER = [
  'space',
  'preserved-space',
  'tab',
  'zero-width-break',
  'soft-hyphen',
  'inline-box',
];

type Cursor = {segmentIndex: number; graphemeIndex: number};

function before(a: Cursor, b: Cursor): boolean {
  return (
    a.segmentIndex < b.segmentIndex ||
    (a.segmentIndex === b.segmentIndex && a.graphemeIndex < b.graphemeIndex)
  );
}

/** A grapheme break at the end of an item is the boundary after it. */
function breakCursor(items: ParagraphItems, index: number, at: number): Cursor {
  const row = items.breakableFitAdvances[index];
  return at === row?.length
    ? {segmentIndex: index + 1, graphemeIndex: 0}
    : {segmentIndex: index, graphemeIndex: at};
}

/**
 * Boundary in front of an item a line may end at. Segmentation puts a
 * boundary wherever a break is legal, so an item opens a unit unless it
 * carries the break of the text before it: a soft hyphen needs its hyphen
 * painted, glue holds two items together, and a seam that only changes
 * metrics joins.
 */
function opensUnit(items: ParagraphItems, index: number): boolean {
  const kind = items.kinds[index];
  return (
    !items.joinsPrevious[index] && kind !== 'soft-hyphen' && kind !== 'glue'
  );
}

/** Every place a line may legally end inside a range of items. */
function legalBreaks(
  items: ParagraphItems,
  range: {start: number; end: number},
  hyphenFits: boolean,
): Cursor[] {
  const cursors: Cursor[] = [];
  for (let i = range.start; i < range.end && i < items.kinds.length; i++) {
    for (const at of items.breakablePreferredBreaks[i] ?? []) {
      cursors.push(breakCursor(items, i, at));
    }
    const kind = items.kinds[i];
    if (kind === 'soft-hyphen' && !hyphenFits) continue;
    if (
      BREAKS_AFTER.includes(kind) ||
      kind === 'hard-break' ||
      (i + 1 < items.kinds.length && opensUnit(items, i + 1))
    ) {
      cursors.push({segmentIndex: i + 1, graphemeIndex: 0});
    }
  }
  return cursors;
}

/** A line's end with the whitespace that hangs past its last unit left out. */
function inkEnd(items: ParagraphItems, end: Cursor): Cursor {
  if (end.graphemeIndex !== 0) return end;
  let segmentIndex = end.segmentIndex;
  while (
    segmentIndex > 0 &&
    ['space', 'preserved-space', 'tab'].includes(items.kinds[segmentIndex - 1])
  ) {
    segmentIndex--;
  }
  return {segmentIndex, graphemeIndex: 0};
}

/**
 * Whether a line could have ended anywhere but at its two ends. A soft hyphen
 * offers a break only where the hyphen it paints fits the free segment, so a
 * word whose hyphen has no room stays one unit.
 */
function holdsOneUnit(items: ParagraphItems, line: BrokenLine): boolean {
  const room = line.segment.right - line.segment.left + EPSILON;
  const end = inkEnd(items, line.end);
  for (const cursor of legalBreaks(items, line.items, true)) {
    if (!before(line.start, cursor) || !before(cursor, end)) continue;
    const paintsAHyphen =
      cursor.graphemeIndex === 0 &&
      items.kinds[cursor.segmentIndex - 1] === 'soft-hyphen';
    if (
      paintsAHyphen &&
      measureLineSpanFit(
        items,
        {start: line.start, end: cursor},
        line.segment.left,
      ) > room
    ) {
      continue;
    }
    return false;
  }
  return true;
}

function paddedRects(
  exclusions: readonly TextExclusion[],
): {left: number; right: number; top: number; bottom: number}[] {
  const rects = [];
  for (const exclusion of exclusions) {
    if (exclusion.kind !== 'rect') continue;
    const horizontal = exclusion.horizontalPadding ?? 0;
    const vertical = exclusion.verticalPadding ?? 0;
    rects.push({
      left: exclusion.x - horizontal,
      right: exclusion.x + exclusion.width + horizontal,
      top: exclusion.y - vertical,
      bottom: exclusion.y + exclusion.height + vertical,
    });
  }
  return rects;
}

/** Single-font cases a band sweep runs, which pretext can also lay out. */
function bandedRuns(): SweepCase[] {
  return sweepCases().filter(
    one =>
      one.name.includes('/normal/') &&
      (one.name.startsWith('short-words') ||
        one.name.startsWith('soft-hyphens') ||
        one.name.startsWith('long-word')),
  );
}

type MixedCase = {
  items: ParagraphItems;
  vertical: ParagraphVerticalMetrics;
};

function mixedCase(
  runs: ContentRun<number, number>[],
  whiteSpace: WhiteSpaceMode = 'normal',
): MixedCase {
  const mixed = prepareMixedParagraph(
    buildParagraphContent(runs, whiteSpace),
    {whiteSpace, wordBreak: 'normal', metrics: REGULAR},
    canvasParagraphMeasurer,
  );
  return {
    items: mixed.items,
    vertical: verticalOf(
      mixed.items,
      mixed.preparations.map(one => one.metrics),
    ),
  };
}

function textRun(
  owner: number,
  metrics: RunMetrics,
  text: string,
): ContentRun<number, number> {
  return {kind: 'text', owner, paint: owner, metrics, text};
}

function boxRun(
  owner: number,
  width: number,
  height: number,
): ContentRun<number, number> {
  return {kind: 'object', owner, paint: owner, metrics: REGULAR, width, height};
}

/** What a broken line shows: its paint width, box height and free segment. */
function shapeOf(line: BrokenLine): string {
  return [
    line.width,
    line.height,
    line.top,
    line.segment.left,
    line.segment.right,
  ].join('/');
}

function shapesOf(broken: BrokenParagraph): string[] {
  return broken.lines.map(shapeOf);
}

/** A paragraph of two font sizes and a tall inline box. */
function tallCase(): {
  items: ParagraphItems;
  vertical: ParagraphVerticalMetrics;
} {
  const runs: ContentRun<number, number>[] = [
    {kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text: 'one two '},
    {
      kind: 'object',
      owner: 1,
      paint: 1,
      metrics: REGULAR,
      width: 20,
      height: 48,
    },
    {kind: 'text', owner: 2, paint: 2, metrics: WIDE, text: ' tall three '},
    {kind: 'text', owner: 3, paint: 3, metrics: REGULAR, text: 'four five six'},
  ];
  const content = buildParagraphContent(runs, 'normal');
  const mixed = prepareMixedParagraph(
    content,
    {whiteSpace: 'normal', wordBreak: 'normal', metrics: REGULAR},
    canvasParagraphMeasurer,
  );
  return {
    items: mixed.items,
    vertical: verticalOf(
      mixed.items,
      mixed.preparations.map(one => one.metrics),
    ),
  };
}

function everyLine(
  broken: BrokenParagraph,
  visit: (line: BrokenLine) => void,
): void {
  for (const line of broken.lines) visit(line);
}

describe('paragraph break pass', () => {
  mockTextContext(mockFontWidth, mockFontBounds);

  it('breaks the same lines as pretext with no exclusion', () => {
    const findings: string[] = [];
    let comparisons = 0;
    let excepted = 0;
    for (const {name, items, vertical, handle} of sweepCases()) {
      for (const width of probeWidths(items)) {
        comparisons++;
        const broken = breakParagraph(items, constraintsOf(vertical, width));
        const theirs: LayoutLineRange[] = [];
        walkLineRanges(handle, width, line => theirs.push(line));
        const mine = broken.lines.map(line => settledKey(items, line));
        const upstream = theirs.map(line => settledKey(items, line));
        if (mine.join('|') === upstream.join('|')) continue;
        const at = mine.findIndex((one, index) => one !== upstream[index]);
        if (
          takesAnInternalBreak(items, broken.lines[at], theirs[at]) ||
          broken.lines.some(line => shapesASlice(items, line)) ||
          hangsAHyphen(items, theirs, width)
        ) {
          excepted++;
          continue;
        }
        findings.push(
          `${name}@${width}: ${mine.join('|')} != ${upstream.join('|')}`,
        );
      }
    }
    expect(findings).toEqual([]);
    expect(comparisons).toBeGreaterThanOrEqual(PARITY_COMPARISONS);
    expect(excepted).toBeGreaterThan(0);
  });

  it('measures a line span the way the walk measured it', () => {
    const findings: string[] = [];
    let compared = 0;
    const cases: {name: string; items: ParagraphItems}[] = [
      ...sweepCases().map(one => ({name: one.name, items: one.items})),
      {
        name: 'two-fonts',
        items: mixedCase([
          textRun(0, REGULAR, 'liquor jugs and '),
          textRun(1, WIDE, 'bold ex­tra\tspan'),
        ]).items,
      },
      {name: 'tall', items: tallCase().items},
    ];
    for (const {name, items} of cases) {
      for (const width of probeWidths(items)) {
        walkPreparedLinesRaw(items, width, (walked, start, sg, end, eg) => {
          compared++;
          const span = {
            start: {segmentIndex: start, graphemeIndex: sg},
            end: {segmentIndex: end, graphemeIndex: eg},
          };
          const measured = measureLineSpan(items, span);
          if (shapesASlice(items, span)) return;
          if (Math.abs(measured - walked) > 1e-9) {
            findings.push(
              `${name}@${width}#${start}: ${measured} != ${walked}`,
            );
          }
        });
      }
    }
    expect(findings).toEqual([]);
    expect(compared).toBeGreaterThanOrEqual(MEASURE_COMPARISONS);
  });

  it('stacks the lines it broke', () => {
    const findings: string[] = [];
    for (const {name, items, vertical} of sweepCases()) {
      for (const width of [40, 90, 1e9]) {
        const broken = breakParagraph(items, constraintsOf(vertical, width));
        let top = 0;
        for (const line of broken.lines) {
          if (line.top !== top) findings.push(`${name}@${width} top`);
          top += line.height;
        }
        if (broken.height !== top) findings.push(`${name}@${width} height`);
      }
    }
    expect(findings).toEqual([]);
  });

  it('keeps every line inside its free segment', () => {
    const findings: string[] = [];
    let compared = 0;
    for (const {name, items, vertical} of bandedRuns()) {
      for (const set of EXCLUSION_SETS) {
        for (const width of BAND_WIDTHS) {
          for (const wrap of ['normal', 'anywhere'] as OverflowWrapMode[]) {
            const broken = breakParagraph(
              items,
              constraintsOf(vertical, width, set.exclusions, wrap),
            );
            everyLine(broken, line => {
              compared++;
              if (!overflows(items, line, width)) return;
              // Only a unit that fits no band may pass its segment, alone.
              if (!holdsOneUnit(items, line)) {
                findings.push(
                  `${name}/${set.name}/${wrap}@${width}: ` +
                    `${line.width} over ${available(line)}, shared`,
                );
              }
            });
          }
        }
      }
    }
    expect(findings).toEqual([]);
    expect(compared).toBeGreaterThanOrEqual(SEGMENT_COMPARISONS);
  });

  it('gives a band the line a box of that width would hold', () => {
    const findings: string[] = [];
    let compared = 0;
    for (const {name, items, vertical, handle} of bandedRuns()) {
      for (const set of EXCLUSION_SETS) {
        for (const width of BAND_WIDTHS) {
          const broken = breakParagraph(
            items,
            constraintsOf(vertical, width, set.exclusions),
          );
          for (const line of broken.lines) {
            const theirs = layoutNextLineRange(
              handle,
              line.start,
              available(line),
            );
            // A hard right edge fits the hyphen, which pretext hangs.
            if (endsOnHyphen(items, line)) continue;
            if (
              theirs !== null &&
              items.kinds[theirs.end.segmentIndex - 1] === 'soft-hyphen'
            ) {
              continue;
            }
            compared++;
            const mine = `${line.end.segmentIndex}:${line.end.graphemeIndex}:${line.width.toFixed(9)}`;
            const want =
              theirs === null
                ? 'none'
                : `${theirs.end.segmentIndex}:${theirs.end.graphemeIndex}:${theirs.width.toFixed(9)}`;
            if (mine !== want) {
              findings.push(`${name}/${set.name}@${width}: ${mine} != ${want}`);
            }
          }
        }
      }
    }
    expect(findings).toEqual([]);
    expect(compared).toBeGreaterThanOrEqual(BAND_COMPARISONS);
  });

  it('fits a hyphen beside an exclusion', () => {
    const items = sweepCases().filter(one =>
      one.name.startsWith('soft-hyphens/normal/ls0'),
    )[0];
    const findings: string[] = [];
    let hyphenated = 0;
    for (const set of EXCLUSION_SETS) {
      for (const width of BAND_WIDTHS) {
        const broken = breakParagraph(
          items.items,
          constraintsOf(items.vertical, width, set.exclusions),
        );
        for (const line of broken.lines) {
          const last = line.end.segmentIndex - 1;
          const onHyphen =
            line.end.graphemeIndex === 0 &&
            last >= 0 &&
            items.items.kinds[last] === 'soft-hyphen';
          if (!onHyphen) continue;
          // A hyphen may hang past the box edge, as pretext has it, but never
          // into an exclusion that stands at the right of the line.
          if (line.segment.right >= width) continue;
          hyphenated++;
          if (overflows(items.items, line, width)) {
            findings.push(
              `${set.name}@${width}: ${line.width} over ${available(line)}`,
            );
          }
        }
      }
    }
    expect(findings).toEqual([]);
    expect(hyphenated).toBeGreaterThan(0);
  });

  it('keeps a line clear of the exclusion at its real height', () => {
    const findings: string[] = [];
    const tall = tallCase();
    let checked = 0;
    const sources = [
      ...bandedRuns().map(one => ({
        name: one.name,
        items: one.items,
        vertical: one.vertical,
      })),
      {name: 'tall', ...tall},
    ];
    for (const source of sources) {
      for (const set of EXCLUSION_SETS) {
        for (const width of BAND_WIDTHS) {
          const broken = breakParagraph(
            source.items,
            constraintsOf(source.vertical, width, set.exclusions),
          );
          for (const line of broken.lines) {
            if (overflows(source.items, line, width)) continue;
            checked++;
            const left = line.segment.left;
            const right = left + line.width;
            for (const rect of paddedRects(set.exclusions)) {
              const clear =
                right <= rect.left + EPSILON ||
                left >= rect.right - EPSILON ||
                line.top + line.height <= rect.top + EPSILON ||
                line.top >= rect.bottom - EPSILON;
              if (!clear) {
                findings.push(
                  `${source.name}/${set.name}@${width}: ` +
                    `[${left},${right}]x[${line.top},${line.top + line.height}]`,
                );
              }
            }
          }
        }
      }
    }
    expect(findings).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  });

  it('grows the band a taller line has to fit', () => {
    const tall = tallCase();
    const exclusions: TextExclusion[] = [
      {kind: 'rect', x: 70, y: 30, width: 60, height: 40},
    ];
    const broken = breakParagraph(
      tall.items,
      constraintsOf(tall.vertical, 130, exclusions),
    );
    const tallLine = broken.lines.find(line => line.height >= 48);
    expect(tallLine).toBeDefined();
    if (tallLine === undefined) return;
    // The box makes the line 48 tall, which reaches a band the 20px line
    // above it cleared, so the line ends inside the narrowed segment.
    expect(tallLine.top + tallLine.height).toBeGreaterThan(30);
    expect(tallLine.segment.right).toBeLessThanOrEqual(70);
    expect(tallLine.width).toBeLessThanOrEqual(
      tallLine.segment.right - tallLine.segment.left + EPSILON,
    );
  });

  it('overflows only whole units under overflow-wrap normal', () => {
    const findings: string[] = [];
    let isolated = 0;
    for (const {name, items, vertical} of sweepCases()) {
      // A preserved space at a line end hangs, as it does in CSS, so the
      // paint width of a `pre-wrap` line is not the width it has to fit.
      if (!name.includes('/normal/')) continue;
      for (const width of [20, 35, 60]) {
        const strict = breakParagraph(
          items,
          constraintsOf(vertical, width, [], 'normal'),
        );
        const legal = legalBreaks(
          items,
          {start: 0, end: items.kinds.length},
          true,
        ).map(cursor => `${cursor.segmentIndex}:${cursor.graphemeIndex}`);
        for (const line of strict.lines) {
          const end = `${line.end.segmentIndex}:${line.end.graphemeIndex}`;
          const last = line.end.segmentIndex >= items.kinds.length;
          if (!last && !legal.includes(end)) {
            findings.push(`${name}@${width}: ${end} is no legal break`);
          }
          if (!overflows(items, line, width)) continue;
          isolated++;
          if (!holdsOneUnit(items, line)) {
            findings.push(`${name}@${width}: an over-wide unit shares a line`);
          }
        }
        const loose = breakParagraph(
          items,
          constraintsOf(vertical, width, [], 'anywhere'),
        );
        for (const line of loose.lines) {
          if (!overflows(items, line, width)) continue;
          // Nothing smaller than one grapheme can be moved off the line.
          if (line.items.end - line.items.start > 1) {
            findings.push(`${name}@${width}: anywhere left a wide line`);
          }
        }
      }
    }
    expect(findings).toEqual([]);
    expect(isolated).toBeGreaterThan(0);
  });

  it('counts a consumed hard break in the band of the line it ends', () => {
    const {items, vertical} = mixedCase(
      [
        textRun(0, REGULAR, 'aaaa aaaa'),
        textRun(1, TALL, '\n'),
        textRun(2, REGULAR, 'b'),
      ],
      'pre-wrap',
    );
    const broken = breakParagraph(
      items,
      constraintsOf(vertical, 100, [
        {kind: 'rect', x: 40, y: 30, width: 60, height: 100},
      ]),
    );
    // The newline's own 50px box narrows the band of the line it ends, so
    // the second word no longer fits beside the exclusion.
    expect(shapesOf(broken)).toEqual([
      '50/20/0/0/100',
      '40/50/20/0/40',
      '10/20/70/0/40',
    ]);
  });

  it('holds a break against the band it was found in', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'aaaa aaaa'),
      textRun(1, TALL, ' '),
      textRun(2, REGULAR, 'b'),
    ]);
    const broken = breakParagraph(
      items,
      constraintsOf(vertical, 100, [
        {kind: 'rect', x: 30, y: 30, width: 70, height: 100},
      ]),
    );
    expect(shapesOf(broken)).toEqual(['90/20/0/0/100', '10/20/20/0/30']);
  });

  it('keeps a break that fits the band it was found in', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'aaa bb­'),
      textRun(1, TALL, 'cc'),
    ]);
    const broken = breakParagraph(
      items,
      constraintsOf(
        vertical,
        100,
        [
          {kind: 'rect', x: 60, y: 0, width: 40, height: 200},
          {kind: 'rect', x: 24, y: 30, width: 36, height: 100},
        ],
        'normal',
      ),
    );
    // The break after `aaa` fitted the 60 the band gave it, so the line
    // keeps it although the tall tail narrows the band to 24.
    expect(shapesOf(broken)).toEqual(['30/20/0/0/60', '70/50/20/0/24']);
  });

  it('fits a hyphen in the band the line that holds it occupies', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'a '),
      boxRun(1, 20, 40),
      textRun(2, REGULAR, '­zzzzzz'),
    ]);
    const broken = breakParagraph(
      items,
      constraintsOf(vertical, 100, [
        {kind: 'rect', x: 40, y: 30, width: 60, height: 100},
      ]),
    );
    // The hyphen would stand at 50 in a band of 40, so the line ends at the
    // box instead and paints no hyphen.
    expect(shapesOf(broken)).toEqual([
      '40/40/0/0/40',
      '40/20/40/0/40',
      '20/20/60/0/40',
    ]);
  });

  it('opens a line in the band the first unit needs', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'aaa'),
      textRun(1, TALL, 'a'),
    ]);
    const broken = breakParagraph(
      items,
      constraintsOf(
        vertical,
        100,
        [{kind: 'rect', x: 0, y: 30, width: 40, height: 100}],
        'normal',
      ),
    );
    expect(shapesOf(broken)).toEqual(['55/50/0/40/100']);
  });

  it('stands the last grapheme of a chunk in its hard break band', () => {
    const {items, vertical} = mixedCase(
      [
        textRun(0, REGULAR, 'aaaaaaaa'),
        textRun(1, TALL, '\n'),
        textRun(2, REGULAR, 'b'),
      ],
      'pre-wrap',
    );
    const broken = breakParagraph(
      items,
      constraintsOf(vertical, 100, [
        {kind: 'rect', x: 40, y: 30, width: 60, height: 100},
      ]),
    );
    // The eighth `a` takes the newline's 50px box with it, which leaves the
    // line the 40 beside the exclusion to stand in.
    expect(shapesOf(broken)).toEqual([
      '70/20/0/0/100',
      '10/50/20/0/40',
      '10/20/70/0/40',
    ]);
  });

  it('opens a line in the band its closing hard break needs', () => {
    const boxed = mixedCase(
      [boxRun(0, 50, 20), textRun(1, TALL, '\n'), textRun(2, REGULAR, 'b')],
      'pre-wrap',
    );
    expect(
      shapesOf(
        breakParagraph(
          boxed.items,
          constraintsOf(boxed.vertical, 100, [
            {kind: 'rect', x: 0, y: 30, width: 40, height: 100},
          ]),
        ),
      ),
    ).toEqual(['50/50/0/40/100', '10/20/50/40/100']);

    const empty = mixedCase(
      [
        textRun(0, REGULAR, '\n'),
        textRun(1, TALL, '\n'),
        textRun(2, REGULAR, 'b'),
      ],
      'pre-wrap',
    );
    expect(
      shapesOf(
        breakParagraph(
          empty.items,
          constraintsOf(empty.vertical, 100, [
            {kind: 'rect', x: 0, y: 50, width: 40, height: 100},
          ]),
        ),
      ),
    ).toEqual(['0/20/0/0/100', '0/50/20/40/100', '10/20/70/40/100']);
  });

  it('opens a line at the first break its opening unit offers', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'www.a-b-'),
      textRun(1, TALL, 'c-d.com'),
    ]);
    const broken = breakParagraph(
      items,
      constraintsOf(
        vertical,
        100,
        [{kind: 'rect', x: 0, y: 30, width: 40, height: 100}],
        'normal',
      ),
    );
    // The tall tail cannot anchor the opening: the line may end at the dash
    // of the first item, which stands in the full width.
    expect(shapesOf(broken)[0]).toBe('80/20/0/0/100');
  });

  it('measures a tab stop from the paragraph origin', () => {
    const {items, vertical} = mixedCase(
      [textRun(0, REGULAR, 'ab\tcd')],
      'pre-wrap',
    );
    const broken = breakParagraph(
      items,
      constraintsOf(vertical, 110, [
        {kind: 'rect', x: 0, y: 0, width: 30, height: 200},
      ]),
    );
    // `ab` ends at 50 in the paragraph, so the 80px stop leaves 30 of tab.
    expect(shapesOf(broken)).toEqual(['70/20/0/30/110']);
  });

  it('hangs the space after an over-wide unit on its line', () => {
    for (const whiteSpace of ['normal', 'pre-wrap'] as const) {
      const metrics = metricsOf(whiteSpace, 0);
      const {items} = prepareParagraph('aa supercalifragilistic ok', metrics);
      const vertical = verticalOf(items, [metrics]);
      const broken = breakParagraph(
        items,
        constraintsOf(vertical, 100, [], 'normal'),
      );
      expect(broken.lines.map(line => line.end.segmentIndex)).toEqual([
        2, 4, 5,
      ]);
      expect(broken.lines[2].start).toEqual({
        segmentIndex: 4,
        graphemeIndex: 0,
      });
    }
  });

  it('ends a line at a break inside the unit in front of it', () => {
    const metrics = metricsOf('normal', 0);
    const prepared = prepareParagraph('a www.abc-def.com', metrics);
    const vertical = verticalOf(prepared.items, [metrics]);
    const broken = breakParagraph(prepared.items, constraintsOf(vertical, 100));
    expect(broken.lines.map(line => line.width)).toEqual([100, 70]);
    expect(broken.lines[0].end).toEqual({segmentIndex: 2, graphemeIndex: 8});

    const theirs: number[] = [];
    walkLineRanges(prepared.handle, 100, line => theirs.push(line.width));
    // The one break of this fork upstream leaves: pretext ends the first
    // line at the space although `a www.abc-` fits the box exactly.
    expect(theirs).toEqual([10, 80, 70]);
  });

  it('reads the line heights a line at a time', () => {
    const counted = (lines: number, exclusions: TextExclusion[]): number => {
      const runs: ContentRun<number, number>[] = [];
      for (let i = 0; i < lines; i++) runs.push(textRun(i, REGULAR, 'aa '));
      const {items, vertical} = mixedCase(runs);
      let reads = 0;
      const watched: ParagraphVerticalMetrics = {
        ...vertical,
        lineHeights: new Proxy(vertical.lineHeights, {
          get(target, property, receiver) {
            if (property !== 'length') reads++;
            return Reflect.get(target, property, receiver);
          },
        }),
      };
      const broken = breakParagraph(
        items,
        constraintsOf(watched, 25, exclusions),
      );
      expect(broken.lines.length).toBe(lines);
      return reads;
    };
    const wall: TextExclusion[] = [
      {kind: 'rect', x: 20, y: 0, width: 5, height: 1e6},
    ];
    // Preparing a height for every line of the rest of the chunk would square
    // the count: a line reads a fixed number of them.
    for (const lines of [100, 200, 400]) {
      expect(counted(lines, [])).toBeLessThan(lines * 4);
      expect(counted(lines, wall)).toBeLessThan(lines * 12);
    }
  });

  it('keeps the item boundaries of the break graph under normal', () => {
    const cjk = mixedCase([textRun(0, REGULAR, '你好世界')]);
    expect(
      shapesOf(
        breakParagraph(
          cjk.items,
          constraintsOf(cjk.vertical, 25, [], 'normal'),
        ),
      ),
    ).toEqual(['20/20/0/0/25', '20/20/20/0/25']);

    const boxed = mixedCase([textRun(0, REGULAR, 'aa'), boxRun(1, 20, 20)]);
    expect(
      shapesOf(
        breakParagraph(
          boxed.items,
          constraintsOf(boxed.vertical, 25, [], 'normal'),
        ),
      ),
    ).toEqual(['20/20/0/0/25', '20/20/20/0/25']);
  });

  it('takes a part of a word in the band that part occupies', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'aaaaaaaa'),
      textRun(1, TALL, 'a'),
    ]);
    const broken = breakParagraph(
      items,
      constraintsOf(vertical, 100, [
        {kind: 'rect', x: 40, y: 30, width: 60, height: 100},
      ]),
    );
    expect(shapesOf(broken)[0]).toBe('80/20/0/0/100');
  });

  it('skips no band for an exclusion the box never reaches', () => {
    const {items, vertical} = mixedCase([textRun(0, REGULAR, 'aa')]);
    const broken = breakParagraph(
      items,
      constraintsOf(vertical, 20, [
        {kind: 'rect', x: 1000, y: 0, width: 10, height: 100},
      ]),
    );
    expect(shapesOf(broken)).toEqual(['20/20/0/0/20']);
    expect(broken.height).toBe(20);
  });

  it('hangs a preserved space and a tab past a hard edge', () => {
    const edge: TextExclusion[] = [
      {kind: 'rect', x: 25, y: 0, width: 75, height: 100},
    ];
    const spaces = mixedCase([textRun(0, REGULAR, 'ab    cd')], 'pre-wrap');
    const spaced = breakParagraph(
      spaces.items,
      constraintsOf(spaces.vertical, 100, edge),
    );
    // The four spaces hang: 20 of ink stands in the 25 the band leaves.
    expect(shapesOf(spaced)).toEqual(['60/20/0/0/25', '20/20/20/0/25']);
    expect(containedWidth(spaces.items, spaced.lines[0])).toBe(20);

    const tabs = mixedCase([textRun(0, REGULAR, 'ab\tcd')], 'pre-wrap');
    const tabbed = breakParagraph(
      tabs.items,
      constraintsOf(tabs.vertical, 100, edge),
    );
    expect(tabs.items.kinds[lastItem(tabbed.lines[0])]).toBe('tab');
    expect(tabbed.lines.map(line => line.width)).toEqual([80, 20]);
  });

  it('breaks only at hard breaks with wrapping off', () => {
    const findings: string[] = [];
    for (const {name, items, vertical} of sweepCases()) {
      const broken = breakParagraph(
        items,
        constraintsOf(vertical, 30, [], 'anywhere', false),
      );
      const chunks = items.chunks.filter(
        chunk => chunk.consumedEndSegmentIndex > chunk.startSegmentIndex,
      ).length;
      if (broken.lines.length > Math.max(chunks, 1)) {
        findings.push(`${name}: ${broken.lines.length} lines of ${chunks}`);
      }
    }
    expect(findings).toEqual([]);
  });

  it('offers no break at a metric seam inside a word', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'alpha'),
      textRun(1, WIDE, 'beta gamma'),
      textRun(2, REGULAR, 'delta epsilon'),
    ]);
    const seams = items.joinsPrevious.filter(Boolean).length;
    expect(seams).toBeGreaterThan(0);
    const findings: string[] = [];
    for (const width of [25, 45, 70, 95, 140, 200]) {
      const broken = breakParagraph(
        items,
        constraintsOf(vertical, width, [], 'normal'),
      );
      const legal = legalBreaks(
        items,
        {start: 0, end: items.kinds.length},
        true,
      ).map(cursor => `${cursor.segmentIndex}:${cursor.graphemeIndex}`);
      for (const line of broken.lines) {
        if (line.end.segmentIndex >= items.kinds.length) continue;
        const end = `${line.end.segmentIndex}:${line.end.graphemeIndex}`;
        if (!legal.includes(end)) findings.push(`@${width}: ${end}`);
        if (
          line.end.graphemeIndex === 0 &&
          items.joinsPrevious[line.end.segmentIndex]
        ) {
          findings.push(`@${width}: ${end} is a seam`);
        }
      }
    }
    expect(findings).toEqual([]);
  });

  it('is unchanged by a paint-only seam inside a word', () => {
    const findings: string[] = [];
    const text = 'alphabeta gamma AVA delta';
    const whole = prepareMixedParagraph(
      buildParagraphContent(
        [{kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text}],
        'normal',
      ),
      {whiteSpace: 'normal', wordBreak: 'normal', metrics: REGULAR},
      canvasParagraphMeasurer,
    );
    const split = prepareMixedParagraph(
      buildParagraphContent(
        [
          {kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text: 'alpha'},
          {kind: 'text', owner: 1, paint: 1, metrics: REGULAR, text: 'beta g'},
          {kind: 'text', owner: 2, paint: 2, metrics: REGULAR, text: 'amma A'},
          {
            kind: 'text',
            owner: 3,
            paint: 3,
            metrics: REGULAR,
            text: 'VA delta',
          },
        ],
        'normal',
      ),
      {whiteSpace: 'normal', wordBreak: 'normal', metrics: REGULAR},
      canvasParagraphMeasurer,
    );
    const wholeVertical = verticalOf(
      whole.items,
      whole.preparations.map(one => one.metrics),
    );
    const splitVertical = verticalOf(
      split.items,
      split.preparations.map(one => one.metrics),
    );
    const offsets = (items: ParagraphItems, broken: BrokenParagraph): string =>
      broken.lines
        .map(line => {
          const end = line.end.segmentIndex;
          const at =
            end >= items.sourceEnds.length
              ? text.length
              : items.sourceStarts[end];
          return `${items.sourceStarts[line.start.segmentIndex]}:${at}`;
        })
        .join('|');

    for (const width of [25, 45, 70, 95, 140]) {
      for (const wrap of ['normal', 'anywhere'] as OverflowWrapMode[]) {
        const one = offsets(
          whole.items,
          breakParagraph(
            whole.items,
            constraintsOf(wholeVertical, width, [], wrap),
          ),
        );
        const many = offsets(
          split.items,
          breakParagraph(
            split.items,
            constraintsOf(splitVertical, width, [], wrap),
          ),
        );
        if (one !== many) findings.push(`@${width}/${wrap}: ${one} != ${many}`);
      }
    }
    expect(findings).toEqual([]);
  });
});
