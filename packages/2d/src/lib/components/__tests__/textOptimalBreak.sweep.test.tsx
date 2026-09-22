import {describe, expect, it} from 'vitest';
import type {TextExclusion} from '../../partials/types';
import type {BrokenLine, BrokenParagraph} from '../../text/breakParagraph';
import {breakParagraph} from '../../text/breakParagraph';
import type {
  BreakCandidate,
  LineCost,
  OptimalBreakConstraints,
} from '../../text/knuthPlassParagraph';
import {
  breakParagraphOptimally,
  lineStops,
} from '../../text/knuthPlassParagraph';
import type {ParagraphBands} from '../../text/lineBands';
import {
  heightsThrough,
  openingHeight,
  readChunkHeights,
  readParagraphBands,
} from '../../text/lineBands';
import type {ParagraphVerticalMetrics} from '../../text/lineMetrics';
import {lineBoxHeight, readVerticalMetrics} from '../../text/lineMetrics';
import type {LineSpan} from '../../text/lineSpan';
import {
  isJustificationGlue,
  lineSpanItemRange,
  measureLineSpan,
  measureLineSpanFit,
} from '../../text/lineSpan';
import {prepareMixedParagraph} from '../../text/mixedParagraph';
import type {ContentRun, RunMetrics} from '../../text/paragraphContent';
import {buildParagraphContent} from '../../text/paragraphContent';
import type {
  ParagraphChunk,
  ParagraphCursor,
  ParagraphItems,
} from '../../text/paragraphItems';
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
  endsLineLegally,
  isDiscretionaryLineEnd,
} from '../../text/pretext-derived/lineBreak';
import type {Interval} from '../../text/wrapGeometry';
import {mockTextContext} from './mockTextContext';
import {mockFontBounds, mockFontWidth, TEXTS} from './textInvariants';

const FONT = '400 20px sans-serif';
/** 10px glyphs, 20px line boxes. */
const REGULAR: RunMetrics = {font: FONT, letterSpacing: 0};
/** 20.5px glyphs. */
const WIDE: RunMetrics = {font: '700 41px sans-serif', letterSpacing: 0};
/** 25px glyphs, 50px line boxes. */
const TALL: RunMetrics = {font: '400 50px sans-serif', letterSpacing: 0};
const LINE_HEIGHT = '100%';

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
  {
    name: 'two',
    exclusions: [
      {kind: 'rect', x: 0, y: 0, width: 30, height: 45},
      {kind: 'rect', x: 100, y: 30, width: 50, height: 60},
    ],
  },
];
const BAND_WIDTHS = [65, 90, 140];

const EXTRA_TEXTS = [
  {name: 'soft-hyphens', text: 'un­break­able ex­tra words'},
  {name: 'long-word', text: 'a supercalifragilisticexpialidocious word'},
  {name: 'dashed', text: 'a well-known-but-very-long-compound end'},
  {name: 'hard-breaks', text: 'one\n\ntwo three\nfour'},
  {name: 'cjk', text: '你好世界 tail 漢字'},
  {name: 'url', text: 'a www.abc-def.com tail'},
  {name: 'repeated-dashes', text: 'one--two three---four'},
  {name: 'markers', text: 'a\n­\nb​\nc'},
];
const CASE_TEXTS = [...TEXTS, ...EXTRA_TEXTS];
const WHITE_SPACES: WhiteSpaceMode[] = ['normal', 'pre-wrap'];
const LETTER_SPACINGS = [0, 3];
const WIDTHS = [25, 40, 65, 90, 140, 400];

/** The sweep may only grow: a shrunken sweep is a weaker gate. */
const PLANNED_LINES = 1634;
const AGREED_LINES = 1123;
const SEARCHED_PLANS = 2552;
const INTERIOR_BREAKS = 16;
const SELECTED_LINES = 1105;
const MEASURED_STOPS = 474;
const BANDED_PLANS = 11184;
const BANDED_LINES = 554;
const AGREED_BANDED_LINES = 464;

const EPSILON = getEngineProfile().lineFitEpsilon;

type SweepCase = {
  name: string;
  items: ParagraphItems;
  vertical: ParagraphVerticalMetrics;
};

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
        });
      }
    }
  }
  return CASE_MEMO;
}

function mixedCase(
  runs: ContentRun<number, number>[],
  whiteSpace: WhiteSpaceMode = 'normal',
): SweepCase {
  const mixed = prepareMixedParagraph(
    buildParagraphContent(runs, whiteSpace),
    {whiteSpace, wordBreak: 'normal', metrics: REGULAR},
    canvasParagraphMeasurer,
  );
  return {
    name: 'mixed',
    items: mixed.items,
    vertical: verticalOf(
      mixed.items,
      mixed.preparations.map(one => one.metrics),
    ),
  };
}

const MIXED_MEMO: SweepCase[] = [];

/** Paragraphs whose spaces, hyphens and glyphs come from two fonts. */
function mixedCases(): SweepCase[] {
  if (MIXED_MEMO.length > 0) return MIXED_MEMO;
  MIXED_MEMO.push(
    {
      ...mixedCase([
        textRun(0, REGULAR, 'liquor jugs and '),
        textRun(1, WIDE, 'bold spans here '),
        textRun(2, REGULAR, 'plus a tail'),
      ]),
      name: 'mixed/words',
    },
    {
      ...mixedCase([
        textRun(0, REGULAR, 'un­break­able '),
        textRun(1, WIDE, 'ex­tra words '),
        textRun(2, REGULAR, 'and more'),
      ]),
      name: 'mixed/hyphens',
    },
    {
      ...mixedCase([
        textRun(0, REGULAR, 'a well-kno'),
        textRun(1, WIDE, 'wn-but-long-compound'),
        textRun(2, REGULAR, ' end'),
      ]),
      name: 'mixed/dashes',
    },
    {
      ...mixedCase([
        textRun(0, WIDE, 'wide'),
        textRun(1, REGULAR, ' narrow '),
        textRun(2, WIDE, 'wide again'),
      ]),
      name: 'mixed/spaces',
    },
  );
  return MIXED_MEMO;
}

/** Every paragraph a sweep gate runs, single font and mixed alike. */
function gateCases(): SweepCase[] {
  return [...sweepCases(), ...mixedCases()];
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

function constraintsOf(
  vertical: ParagraphVerticalMetrics,
  maxWidth: number,
  justify = false,
): OptimalBreakConstraints {
  return {
    maxWidth,
    textWrap: true,
    overflowWrap: 'normal',
    justify,
    vertical,
  };
}

const BANDED_MEMO: SweepCase[] = [];

/** Paragraphs of one chunk, so a banded plan starts at the top of the box. */
function bandedCases(): SweepCase[] {
  if (BANDED_MEMO.length > 0) return BANDED_MEMO;
  const single = [
    {name: 'words', text: 'alpha beta gamma delta epsilon zeta eta'},
    {name: 'soft-hyphens', text: 'un­break­able ex­tra words here'},
    {name: 'long-word', text: 'a supercalifragilisticexpialidocious word'},
    {name: 'dashed', text: 'a well-known-but-very-long-compound end'},
  ];
  for (const {name, text} of single) {
    const metrics = metricsOf('normal', 0);
    const prepared = prepareParagraph(text, metrics);
    BANDED_MEMO.push({
      name,
      items: prepared.items,
      vertical: verticalOf(prepared.items, [metrics]),
    });
  }
  BANDED_MEMO.push({
    ...mixedCase([
      textRun(0, REGULAR, 'alpha beta '),
      boxRun(1, 30, 48),
      textRun(2, REGULAR, ' gamma delta epsilon'),
    ]),
    name: 'tall-box',
  });
  BANDED_MEMO.push({
    ...mixedCase([
      textRun(0, REGULAR, 'alpha beta '),
      textRun(1, TALL, 'tall '),
      textRun(2, REGULAR, 'gamma delta epsilon'),
    ]),
    name: 'tall-run',
  });
  return BANDED_MEMO;
}

function spanOf(line: BrokenLine): LineSpan {
  return {start: line.start, end: line.end};
}

function cursorKey(cursor: ParagraphCursor): string {
  return `${cursor.segmentIndex}.${cursor.graphemeIndex}`;
}

function breakKey(line: BrokenLine): string {
  return `${cursorKey(line.start)}-${cursorKey(line.end)}`;
}

function before(a: ParagraphCursor, b: ParagraphCursor): boolean {
  return (
    a.segmentIndex < b.segmentIndex ||
    (a.segmentIndex === b.segmentIndex && a.graphemeIndex < b.graphemeIndex)
  );
}

function allStops(items: ParagraphItems): BreakCandidate[] {
  return items.chunks.flatMap(chunk => lineStops(items, chunk));
}

/** Stops of the chunk a line that opens at this cursor runs in. */
function stopsAt(
  items: ParagraphItems,
  cursor: ParagraphCursor,
): BreakCandidate[] {
  for (const chunk of items.chunks) {
    if (cursor.segmentIndex < chunk.consumedEndSegmentIndex) {
      return lineStops(items, chunk);
    }
  }
  return [];
}

/** First item a line of this chunk can open on, as the walks normalize it. */
function chunkStartCursor(
  items: ParagraphItems,
  chunk: ParagraphChunk,
): ParagraphCursor {
  let index = chunk.startSegmentIndex;
  while (
    index < chunk.endSegmentIndex &&
    (items.kinds[index] === 'space' ||
      items.kinds[index] === 'zero-width-break' ||
      items.kinds[index] === 'soft-hyphen')
  ) {
    index++;
  }
  return {segmentIndex: index, graphemeIndex: 0};
}

/**
 * Furthest stop a line that opens here may reach, by the shared measure
 * alone. `null` when the first unit fits no line of this width.
 */
function furthestFittingStop(
  items: ParagraphItems,
  start: ParagraphCursor,
  stops: readonly BreakCandidate[],
  maxWidth: number,
): ParagraphCursor | null {
  let chosen: ParagraphCursor | null = null;
  for (const stop of stops) {
    if (!before(start, stop.end)) continue;
    if (
      measureLineSpanFit(items, {start, end: stop.end}) >
      maxWidth + EPSILON
    ) {
      break;
    }
    chosen = stop.end;
  }
  return chosen;
}

/** Ink of the shortest line the paragraph offers at this line's start. */
function firstUnitWidth(
  items: ParagraphItems,
  line: BrokenLine,
  maxWidth: number,
): number {
  for (const stop of allStops(items)) {
    if (!before(line.start, stop.end)) continue;
    const fit = measureLineSpanFit(items, {start: line.start, end: stop.end});
    // A stop whose hyphen has no room is no stop, so the unit runs on.
    if (stop.hyphenated && fit > maxWidth + EPSILON) continue;
    return fit;
  }
  return measureLineSpanFit(items, spanOf(line));
}

/**
 * Whether a line that passes the box is allowed to: its first unit fits no
 * line of this width, and the line paints that unit and nothing more.
 */
function isolatesOneUnit(
  items: ParagraphItems,
  line: BrokenLine,
  maxWidth: number,
): boolean {
  const unit = firstUnitWidth(items, line, maxWidth);
  return (
    unit > maxWidth + EPSILON &&
    measureLineSpanFit(items, spanOf(line)) <= unit + EPSILON
  );
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

/** Last item the line holds, whole or in part. */
function lastItem(line: BrokenLine): number {
  return line.end.graphemeIndex > 0
    ? line.end.segmentIndex
    : line.end.segmentIndex - 1;
}

function passesBox(
  items: ParagraphItems,
  line: BrokenLine,
  maxWidth: number,
): boolean {
  return measureLineSpanFit(items, spanOf(line)) > maxWidth + EPSILON;
}

function everyLine(
  broken: BrokenParagraph,
  visit: (line: BrokenLine, isLast: boolean) => void,
): void {
  broken.lines.forEach((line, index) =>
    visit(line, index === broken.lines.length - 1),
  );
}

function addCost(a: LineCost, b: LineCost): LineCost {
  return {overflow: a.overflow + b.overflow, badness: a.badness + b.badness};
}

function isBetter(a: LineCost, b: LineCost): boolean {
  return a.overflow !== b.overflow
    ? a.overflow < b.overflow
    : a.badness < b.badness;
}

function costKey(cost: LineCost): string {
  return `${cost.overflow.toFixed(6)}/${cost.badness.toFixed(6)}`;
}

/** Chunk a line that opens at this cursor runs in. */
function chunkOf(
  items: ParagraphItems,
  cursor: ParagraphCursor,
): ParagraphChunk {
  for (const chunk of items.chunks) {
    if (cursor.segmentIndex < chunk.consumedEndSegmentIndex) return chunk;
  }
  return items.chunks[items.chunks.length - 1];
}

/** Where one line of a plan stands, and the free width it is scored against. */
type PlacedLine = {
  top: number;
  height: number;
  left: number;
  segment: Interval;
  limit: number;
  hardEdge: boolean;
  fit: number;
  /** False when a hyphen of this line would paint into a shape. */
  legal: boolean;
  /** True when no legal candidate of this line's start stops earlier. */
  first: boolean;
};

/**
 * Where one candidate line stands: it opens at the bottom of the line in front
 * of it, skips a band with no slot, and keeps the slot its own height leaves.
 */
function standAt(
  items: ParagraphItems,
  constraints: OptimalBreakConstraints,
  bands: ParagraphBands | null,
  base: Interval,
  top: number,
  span: LineSpan,
): Omit<PlacedLine, 'first'> {
  const chunk = chunkOf(items, span.start);
  const opening = openingHeight(
    items,
    chunk,
    span.start,
    constraints.overflowWrap === 'anywhere',
    heightsThrough(
      readChunkHeights(items, constraints.vertical, chunk),
      span.start.segmentIndex,
    ),
  );
  const opened =
    bands === null ? {top, segment: base} : bands.openAt(top, opening);
  const height = lineBoxHeight(
    items,
    constraints.vertical,
    lineSpanItemRange(span),
  );
  const left = opened.segment.left;
  const segment =
    bands === null ? base : bands.slotAt(opened.top, left, height);
  const limit = segment.right - left;
  const hardEdge = segment.right < base.right;
  const fit = measureLineSpanFit(items, span, left);
  const hyphenated = isDiscretionaryLineEnd(
    items.kinds,
    span.end.segmentIndex,
    span.end.graphemeIndex,
  );
  return {
    top: opened.top,
    height,
    left,
    segment,
    limit,
    hardEdge,
    fit,
    legal: !hyphenated || fit <= limit + EPSILON,
  };
}

/**
 * Where the lines of a plan stand. `null` when the plan paints a hyphen into a
 * shape, which no legal plan does.
 */
function placePlan(
  items: ParagraphItems,
  constraints: OptimalBreakConstraints,
  spans: readonly LineSpan[],
): PlacedLine[] | null {
  const base: Interval = {left: 0, right: constraints.maxWidth};
  const exclusions = constraints.exclusions ?? [];
  const bands =
    exclusions.length > 0 ? readParagraphBands(exclusions, base) : null;
  const placed: PlacedLine[] = [];
  let top = 0;

  for (const span of spans) {
    const stand = standAt(items, constraints, bands, base, top, span);
    if (!stand.legal) return null;
    let first = true;
    for (const stop of stopsAt(items, span.start)) {
      if (!before(span.start, stop.end)) continue;
      const other = standAt(items, constraints, bands, base, top, {
        start: span.start,
        end: stop.end,
      });
      if (!other.legal) continue;
      first = cursorKey(stop.end) === cursorKey(span.end);
      break;
    }
    placed.push({...stand, first});
    top = stand.top + stand.height;
  }
  return placed;
}

/**
 * What a line costs, read from the items alone: the glue of a line is the
 * width of each `space` item it holds, not a count of one space width.
 */
function oracleLineCost(
  items: ParagraphItems,
  span: LineSpan,
  constraints: OptimalBreakConstraints,
  isLast: boolean,
  placed: PlacedLine,
): LineCost {
  const {justify} = constraints;
  const maxWidth = placed.limit;
  const natural = placed.fit;
  const last =
    span.end.graphemeIndex > 0
      ? span.end.segmentIndex
      : span.end.segmentIndex - 1;
  let glue = 0;
  let count = 0;
  for (let i = span.start.segmentIndex; i < last; i++) {
    if (items.kinds[i] !== 'space') continue;
    glue += items.widths[i];
    count++;
  }

  const justified = justify && !isLast && glue > 0;
  const drawn = justified ? natural - glue * 0.6 : natural;
  if (maxWidth - drawn < -EPSILON) {
    return {overflow: drawn - maxWidth, badness: 0};
  }
  if (isLast) return {overflow: 0, badness: 0};

  let badness: number;
  if (justified) {
    const factor = (maxWidth - (natural - glue)) / glue;
    const river = factor - 1.5;
    const tight = (glue / count) * (0.65 - factor);
    badness =
      Math.abs(factor - 1) ** 3 * 1000 +
      (river > 0 ? 5000 + river * river * 10000 : 0) +
      (tight > 0 ? 3000 + tight * tight * 10000 : 0);
  } else {
    badness = (maxWidth - natural) ** 2 * 10;
  }
  const hyphenated =
    span.end.graphemeIndex === 0 &&
    span.end.segmentIndex > 0 &&
    items.kinds[span.end.segmentIndex - 1] === 'soft-hyphen';
  return {overflow: 0, badness: badness + (hyphenated ? 50 : 0)};
}

const INFEASIBLE: LineCost = {overflow: Infinity, badness: Infinity};

function planCost(
  items: ParagraphItems,
  spans: readonly LineSpan[],
  constraints: OptimalBreakConstraints,
): LineCost {
  const placed = placePlan(items, constraints, spans);
  if (placed === null) return INFEASIBLE;
  let total: LineCost = {overflow: 0, badness: 0};
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    const cost = oracleLineCost(
      items,
      span,
      constraints,
      endsChunk(items, span),
      placed[index],
    );
    if (cost.overflow > 0 && !placed[index].first) return INFEASIBLE;
    total = addCost(total, cost);
  }
  return total;
}

/** Whether this line takes the last item of its chunk. */
function endsChunk(items: ParagraphItems, span: LineSpan): boolean {
  return items.chunks.some(
    chunk =>
      span.end.graphemeIndex === 0 &&
      span.end.segmentIndex === chunk.consumedEndSegmentIndex,
  );
}

/** Cheapest plan of a paragraph, by trying every legal plan of every chunk. */
function bestPlanCost(
  items: ParagraphItems,
  constraints: OptimalBreakConstraints,
): {cost: LineCost; plans: number} {
  let total: LineCost = {overflow: 0, badness: 0};
  let plans = 0;

  for (const chunk of items.chunks) {
    const start = chunkStartCursor(items, chunk);
    if (start.segmentIndex >= chunk.endSegmentIndex) continue;
    const stops = lineStops(items, chunk);
    let best: LineCost = INFEASIBLE;

    const walk = (
      from: ParagraphCursor,
      at: number,
      taken: LineSpan[],
    ): void => {
      for (let index = at; index < stops.length; index++) {
        const stop = stops[index];
        if (!before(from, stop.end)) continue;
        const span = {start: from, end: stop.end};
        // A hyphen the box cannot hold is no candidate for either pass.
        if (
          stop.hyphenated &&
          measureLineSpanFit(items, span) > constraints.maxWidth + EPSILON
        ) {
          continue;
        }
        if (index === stops.length - 1) {
          plans++;
          const cost = planCost(items, [...taken, span], constraints);
          if (isBetter(cost, best)) best = cost;
          continue;
        }
        walk(stop.next, index + 1, [...taken, span]);
      }
    };
    walk(start, 0, []);
    total = addCost(total, best);
  }
  return {cost: total, plans};
}

describe('optimal paragraph break pass', () => {
  mockTextContext(mockFontWidth, mockFontBounds);

  it('plans lines the measure and the greedy pass agree on', () => {
    const findings: string[] = [];
    let planned = 0;
    let agreed = 0;
    for (const {name, items, vertical} of gateCases()) {
      for (const width of WIDTHS) {
        const constraints = constraintsOf(vertical, width);
        const optimal = breakParagraphOptimally(items, constraints);
        const greedy = breakParagraph(items, {
          maxWidth: width,
          textWrap: true,
          overflowWrap: 'normal',
          exclusions: [],
          vertical,
        });
        const theirs = new Map<string, number>();
        for (const line of greedy.lines) theirs.set(breakKey(line), line.width);
        for (const line of optimal.lines) {
          planned++;
          const mine = measureLineSpan(items, spanOf(line));
          if (Math.abs(mine - line.width) > 1e-9) {
            findings.push(`${name}@${width}: ${line.width} != ${mine}`);
          }
          const same = theirs.get(breakKey(line));
          if (same === undefined) continue;
          agreed++;
          if (Math.abs(same - line.width) > 1e-9) {
            findings.push(`${name}@${width}: ${line.width} != ${same} greedy`);
          }
        }
      }
    }
    expect(findings).toEqual([]);
    expect(planned).toBeGreaterThanOrEqual(PLANNED_LINES);
    expect(agreed).toBeGreaterThanOrEqual(AGREED_LINES);
  });

  it('plans no line the box cannot hold, the last one included', () => {
    const findings: string[] = [];
    for (const {name, items, vertical} of gateCases()) {
      for (const width of WIDTHS) {
        const broken = breakParagraphOptimally(
          items,
          constraintsOf(vertical, width),
        );
        everyLine(broken, (line, isLast) => {
          if (!passesBox(items, line, width)) return;
          if (isolatesOneUnit(items, line, width)) return;
          findings.push(
            `${name}@${width}${isLast ? ' last' : ''}: ` +
              `${measureLineSpanFit(items, spanOf(line))}`,
          );
        });
      }
    }
    expect(findings).toEqual([]);
  });

  it('keeps a unit no line can hold alone on its line', () => {
    const {items, vertical} = sweepCases().filter(one =>
      one.name.startsWith('long-word/normal/ls0'),
    )[0];
    const broken = breakParagraphOptimally(items, constraintsOf(vertical, 65));
    const wide = broken.lines.filter(line => passesBox(items, line, 65));
    expect(wide).toHaveLength(1);
    expect(isolatesOneUnit(items, wide[0], 65)).toBe(true);
  });

  it('finds the cheapest plan an exhaustive search finds', () => {
    const findings: string[] = [];
    let searched = 0;
    const texts = [
      'alpha beta gamma delta epsilon zeta',
      'one two three four five six seven',
      'a bb ccc dddd eeeee ffffff g',
      'un­break­able ex­tra words here',
      'short and a verylongwordindeed tail',
    ];
    for (const text of texts) {
      for (const letterSpacing of LETTER_SPACINGS) {
        const metrics = metricsOf('normal', letterSpacing);
        const {items} = prepareParagraph(text, metrics);
        const vertical = verticalOf(items, [metrics]);
        for (const width of [45, 70, 110]) {
          for (const justify of [false, true]) {
            const constraints = constraintsOf(vertical, width, justify);
            const broken = breakParagraphOptimally(items, constraints);
            const mine = planCost(items, broken.lines.map(spanOf), constraints);
            const best = bestPlanCost(items, constraints);
            searched += best.plans;
            if (costKey(mine) !== costKey(best.cost)) {
              findings.push(
                `${text}@${width}/${justify ? 'justify' : 'ragged'}: ` +
                  `${costKey(mine)} != ${costKey(best.cost)}`,
              );
            }
          }
        }
      }
    }
    expect(findings).toEqual([]);
    expect(searched).toBeGreaterThanOrEqual(SEARCHED_PLANS);
  });

  it('stops inside a unit where the unit offers a break', () => {
    const findings: string[] = [];
    let inside = 0;
    for (const {name, items} of gateCases()) {
      const stops = new Set(allStops(items).map(stop => cursorKey(stop.end)));
      items.breakablePreferredBreaks.forEach((breaks, index) => {
        const row = items.breakableFitAdvances[index];
        for (const at of breaks ?? []) {
          if (row === null || at === row.length || at === 0) continue;
          inside++;
          if (stops.has(`${index}.${at}`)) continue;
          findings.push(`${name} item ${index}: ${at} of ${row.length}`);
        }
      });
    }
    expect(findings).toEqual([]);
    expect(inside).toBeGreaterThanOrEqual(INTERIOR_BREAKS);
  });

  it('breaks between two hyphens the way the greedy walk does', () => {
    const metrics = metricsOf('normal', 0);
    const {items} = prepareParagraph('one--two', metrics);
    const vertical = verticalOf(items, [metrics]);
    // The dashes are graphemes 4 and 5 of one five-grapheme item.
    expect(items.breakablePreferredBreaks[0]).toEqual([4, 5]);
    const broken = breakParagraphOptimally(items, constraintsOf(vertical, 45));
    expect(broken.lines.map(line => line.width)).toEqual([40, 40]);
    expect(broken.lines[0].end).toEqual({segmentIndex: 0, graphemeIndex: 4});
  });

  it('ends a line at a break inside the url in front of it', () => {
    const metrics = metricsOf('normal', 0);
    const {items} = prepareParagraph('a www.abc-def.com', metrics);
    const vertical = verticalOf(items, [metrics]);
    const broken = breakParagraphOptimally(items, constraintsOf(vertical, 100));
    const greedy = breakParagraph(items, {
      maxWidth: 100,
      textWrap: true,
      overflowWrap: 'normal',
      exclusions: [],
      vertical,
    });
    expect(broken.lines.map(breakKey)).toEqual(greedy.lines.map(breakKey));
    expect(broken.lines.map(line => line.width)).toEqual([100, 70]);
  });

  it('stops a line where the greedy walk may stop one', () => {
    const findings: string[] = [];
    for (const {name, items, vertical} of gateCases()) {
      for (const width of WIDTHS) {
        const broken = breakParagraphOptimally(
          items,
          constraintsOf(vertical, width),
        );
        everyLine(broken, line => {
          if (
            endsLineLegally(
              items,
              line.end.segmentIndex,
              line.end.graphemeIndex,
            )
          ) {
            return;
          }
          findings.push(`${name}@${width}: ${cursorKey(line.end)}`);
        });
      }
    }
    expect(findings).toEqual([]);
  });

  it('assumes no shrink with justification off', () => {
    const findings: string[] = [];
    for (const {name, items, vertical} of gateCases()) {
      for (const width of WIDTHS) {
        const broken = breakParagraphOptimally(
          items,
          constraintsOf(vertical, width, false),
        );
        everyLine(broken, line => {
          const natural = measureLineSpanFit(items, spanOf(line));
          if (natural <= width + EPSILON) return;
          if (isolatesOneUnit(items, line, width)) return;
          findings.push(`${name}@${width}: ${natural}`);
        });
      }
    }
    expect(findings).toEqual([]);
  });

  it('squeezes justified glue no further than the shrink limit', () => {
    const findings: string[] = [];
    for (const {name, items, vertical} of gateCases()) {
      for (const width of WIDTHS) {
        const broken = breakParagraphOptimally(
          items,
          constraintsOf(vertical, width, true),
        );
        everyLine(broken, (line, isLast) => {
          if (isLast || isolatesOneUnit(items, line, width)) return;
          const natural = measureLineSpanFit(items, spanOf(line));
          if (natural <= width + EPSILON) return;
          let glue = 0;
          for (let i = line.start.segmentIndex; i < lastItem(line); i++) {
            if (isJustificationGlue(items.kinds[i])) glue += items.widths[i];
          }
          const factor = glue > 0 ? (width - (natural - glue)) / glue : 0;
          if (factor >= 0.4 - 1e-9) return;
          findings.push(`${name}@${width}: ${factor}`);
        });
      }
    }
    expect(findings).toEqual([]);
  });

  it('scores the glue the placement pass stretches', () => {
    const metrics = metricsOf('pre-wrap', 0);
    const {items} = prepareParagraph('aaaa bbbb cccc', metrics);
    const vertical = verticalOf(items, [metrics]);
    // `pre-wrap` keeps the spaces, which placement still stretches, so the
    // scorer has to count them as glue or the line reads as an overflow.
    expect(items.kinds[1]).toBe('preserved-space');
    const broken = breakParagraphOptimally(
      items,
      constraintsOf(vertical, 88, true),
    );
    expect(broken.lines.map(breakKey)).toEqual(['0.0-3.0', '3.0-5.0']);
  });

  it('charges letter spacing the way the measure pays it', () => {
    const metrics = metricsOf('normal', 3);
    const {items} = prepareParagraph('a​b', metrics);
    const vertical = verticalOf(items, [metrics]);
    const broken = breakParagraphOptimally(items, constraintsOf(vertical, 100));
    expect(broken.lines).toHaveLength(1);
    expect(broken.lines[0].width).toBe(26);
  });

  it('plans a two-font line with each span measured in its own font', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'liquor jugs '),
      textRun(1, WIDE, 'bold span'),
    ]);
    const broken = breakParagraphOptimally(items, constraintsOf(vertical, 120));
    for (const line of broken.lines) {
      expect(measureLineSpanFit(items, spanOf(line))).toBeLessThanOrEqual(
        120 + EPSILON,
      );
    }
    expect(broken.lines.map(line => line.width.toFixed(1))).toEqual([
      '110.0',
      '98.4',
      '98.4',
    ]);
  });

  it('breaks on a space of the font that owns it', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'jugs'),
      textRun(1, WIDE, ' '),
      textRun(2, REGULAR, 'x'),
    ]);
    // The space is 24.6 wide, so the two words cannot share a line of 70.
    expect(items.widths[1]).toBeCloseTo(24.6, 9);
    const broken = breakParagraphOptimally(items, constraintsOf(vertical, 70));
    expect(broken.lines.map(line => line.width)).toEqual([40, 10]);
  });

  it('pays the hyphen of the font the soft hyphen is written in', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'aaaa'),
      textRun(1, WIDE, '­bbbb cc'),
    ]);
    const broken = breakParagraphOptimally(items, constraintsOf(vertical, 65));
    const hyphenated = broken.lines[0];
    expect(hyphenated.end.segmentIndex).toBe(2);
    // The hyphen is 24.6 wide, not the 10 of the text in front of it.
    expect(hyphenated.width).toBeCloseTo(64.6, 9);
  });

  it('falls back to the greedy walk when a unit fits no line', () => {
    const metrics = metricsOf('normal', 0);
    const {items} = prepareParagraph('a supercalifragilistic word', metrics);
    const vertical = verticalOf(items, [metrics]);
    const anywhere = breakParagraphOptimally(items, {
      ...constraintsOf(vertical, 65),
      overflowWrap: 'anywhere',
    });
    const greedy = breakParagraph(items, {
      maxWidth: 65,
      textWrap: true,
      overflowWrap: 'anywhere',
      exclusions: [],
      vertical,
    });
    expect(anywhere.lines.map(breakKey)).toEqual(greedy.lines.map(breakKey));
    for (const line of anywhere.lines) {
      expect(passesBox(items, line, 65)).toBe(false);
    }
  });

  it('selects a greedy line with the measure the optimal pass scores', () => {
    const findings: string[] = [];
    let checked = 0;
    for (const {name, items, vertical} of gateCases()) {
      for (const width of WIDTHS) {
        const greedy = breakParagraph(items, {
          maxWidth: width,
          textWrap: true,
          overflowWrap: 'normal',
          exclusions: [],
          vertical,
        });
        for (const line of greedy.lines) {
          const stops = stopsAt(items, line.start);
          const chosen = furthestFittingStop(items, line.start, stops, width);
          if (chosen === null) continue;
          checked++;
          if (cursorKey(chosen) === cursorKey(line.end)) continue;
          findings.push(
            `${name}@${width}: ${cursorKey(line.end)} != ${cursorKey(chosen)}`,
          );
        }
      }
    }
    expect(findings).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(SELECTED_LINES);
  });

  it('refuses a hyphen the shared measure would not fit', () => {
    const metrics = metricsOf('normal', 0);
    const {items} = prepareParagraph('un­break­able ex­tra words', metrics);
    const vertical = verticalOf(items, [metrics]);
    const greedy = breakParagraph(items, {
      maxWidth: 140,
      textWrap: true,
      overflowWrap: 'normal',
      exclusions: [],
      vertical,
    });
    // The hyphen at item 8 takes the line to 150 in a box of 140, so both
    // passes take the break behind it, which ends at item 6 and fits in 110.
    expect(
      measureLineSpanFit(items, {
        start: greedy.lines[0].start,
        end: {segmentIndex: 8, graphemeIndex: 0},
      }),
    ).toBe(150);
    expect(measureLineSpanFit(items, spanOf(greedy.lines[0]))).toBe(110);
    expect(greedy.lines[0].end).toEqual({segmentIndex: 6, graphemeIndex: 0});
    const optimal = breakParagraphOptimally(
      items,
      constraintsOf(vertical, 140),
    );
    expect(optimal.lines.map(breakKey)).toEqual(['0.0-6.0', '6.0-11.0']);

    // At 150 the hyphen has room and both passes take it.
    const roomy = breakParagraph(items, {
      maxWidth: 150,
      textWrap: true,
      overflowWrap: 'normal',
      exclusions: [],
      vertical,
    });
    expect(roomy.lines[0].end).toEqual({segmentIndex: 8, graphemeIndex: 0});
    expect(
      breakParagraphOptimally(items, constraintsOf(vertical, 150)).lines[0].end,
    ).toEqual({segmentIndex: 8, graphemeIndex: 0});
  });

  it('keeps a letter-spaced line both passes measure as fitting', () => {
    const metrics = metricsOf('normal', 3);
    const {items} = prepareParagraph('a b', metrics);
    const vertical = verticalOf(items, [metrics]);
    const span = {
      start: {segmentIndex: 0, graphemeIndex: 0},
      end: {segmentIndex: 3, graphemeIndex: 0},
    };
    expect(measureLineSpanFit(items, span)).toBe(39);
    expect(measureLineSpan(items, span)).toBe(39);
    const optimal = breakParagraphOptimally(items, constraintsOf(vertical, 37));
    const greedy = breakParagraph(items, {
      maxWidth: 37,
      textWrap: true,
      overflowWrap: 'normal',
      exclusions: [],
      vertical,
    });
    expect(optimal.lines.map(breakKey)).toEqual(greedy.lines.map(breakKey));
  });

  it('opens no line for a chunk of markers alone', () => {
    for (const text of ['­', '​', '­​']) {
      const metrics = metricsOf('normal', 0);
      const {items} = prepareParagraph(text, metrics);
      const vertical = verticalOf(items, [metrics]);
      expect(
        breakParagraphOptimally(items, constraintsOf(vertical, 50)).lines,
      ).toEqual([]);
    }
  });

  it('opens no line for a marker chunk between two hard breaks', () => {
    const metrics = metricsOf('pre-wrap', 0);
    const {items} = prepareParagraph('a\n­\nb', metrics);
    const vertical = verticalOf(items, [metrics]);
    const optimal = breakParagraphOptimally(items, constraintsOf(vertical, 50));
    const greedy = breakParagraph(items, {
      maxWidth: 50,
      textWrap: true,
      overflowWrap: 'normal',
      exclusions: [],
      vertical,
    });
    expect(optimal.lines.map(breakKey)).toEqual(greedy.lines.map(breakKey));
    expect(optimal.lines.map(line => line.width)).toEqual([10, 10]);
  });

  it('hangs the whitespace a consumed hard break stands behind', () => {
    const metrics = metricsOf('pre-wrap', 0);
    const tabbed = prepareParagraph('a\t\nb', metrics).items;
    const vertical = verticalOf(tabbed, [metrics]);
    const broken = breakParagraphOptimally(tabbed, constraintsOf(vertical, 10));
    expect(broken.lines).toHaveLength(2);
    expect(broken.lines.map(line => line.width)).toEqual([80, 10]);
    expect(
      measureLineSpanFit(tabbed, {
        start: {segmentIndex: 0, graphemeIndex: 0},
        end: {segmentIndex: 3, graphemeIndex: 0},
      }),
    ).toBe(10);

    const spaced = prepareParagraph('a \nb', metrics).items;
    const spacedVertical = verticalOf(spaced, [metrics]);
    expect(
      breakParagraphOptimally(spaced, constraintsOf(spacedVertical, 10)).lines,
    ).toHaveLength(2);
  });

  it('measures a longer line of one start no narrower', () => {
    const findings: string[] = [];
    let compared = 0;
    for (const {name, items} of gateCases()) {
      for (const chunk of items.chunks) {
        const stops = lineStops(items, chunk);
        const start = chunkStartCursor(items, chunk);
        let previous = -Infinity;
        let hyphenated = false;
        for (const stop of stops) {
          if (!before(start, stop.end)) continue;
          const fit = measureLineSpanFit(items, {start, end: stop.end});
          compared++;
          if (hyphenated || fit >= previous - 1e-9) {
            previous = fit;
            hyphenated = stop.hyphenated;
            continue;
          }
          findings.push(`${name}: ${cursorKey(stop.end)} ${fit} < ${previous}`);
        }
      }
    }
    expect(findings).toEqual([]);
    expect(compared).toBeGreaterThanOrEqual(MEASURED_STOPS);
  });

  it('searches on when a longer line can cost less', () => {
    const {items, vertical} = mixedCase([
      textRun(0, {font: FONT, letterSpacing: -50}, 'aaaaaaaaaa'),
      textRun(1, REGULAR, ' bbbbbbbbbbbbbbbbbbbb cccccccccccccccccccc '),
      textRun(2, REGULAR, 'd'.repeat(100)),
    ]);
    expect(items.widths).toEqual([-350, 10, 200, 10, 200, 10, 1000]);
    const constraints = constraintsOf(vertical, 100);
    const broken = breakParagraphOptimally(items, constraints);
    expect(broken.lines.map(line => line.width)).toEqual([20, 1000]);
    expect(planCost(items, broken.lines.map(spanOf), constraints)).toEqual({
      overflow: 900,
      badness: 64000,
    });
  });

  it('plans on when an optional hyphen is the only thing that overflows', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'xxxx x xxx xxx x aa'),
      textRun(1, {font: '400 120px sans-serif', letterSpacing: 0}, '­'),
      textRun(2, REGULAR, 'b'),
    ]);
    // The hyphen alone is 60 wide, and the word it sits in is 30.
    expect(items.discretionaryHyphenWidths[11]).toBe(60);
    const constraints = {
      ...constraintsOf(vertical, 65),
      overflowWrap: 'anywhere' as const,
    };
    const broken = breakParagraphOptimally(items, constraints);
    const greedy = breakParagraph(items, {
      maxWidth: 65,
      textWrap: true,
      overflowWrap: 'anywhere',
      exclusions: [],
      vertical,
    });
    expect(planCost(items, broken.lines.map(spanOf), constraints)).toEqual({
      overflow: 0,
      badness: 10750,
    });
    expect(planCost(items, greedy.lines.map(spanOf), constraints)).toEqual({
      overflow: 0,
      badness: 14750,
    });
  });

  it('scores a justified line with the glue that line holds', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'a b'),
      textRun(1, {font: '400 60px sans-serif', letterSpacing: 0}, ' '),
      textRun(2, REGULAR, 'c d'),
    ]);
    // The middle space is 30 wide, the two others 10.
    expect(items.widths).toEqual([10, 10, 10, 30, 10, 10, 10]);
    const constraints = constraintsOf(vertical, 45, true);
    const broken = breakParagraphOptimally(items, constraints);
    expect(broken.lines.map(breakKey)).toEqual([
      '0.0-2.0',
      '2.0-6.0',
      '6.0-7.0',
    ]);
    expect(
      planCost(items, broken.lines.map(spanOf), constraints).badness,
    ).toBeCloseTo(12254.62963, 5);
  });

  it('finds the cheapest banded plan an exhaustive search finds', () => {
    const findings: string[] = [];
    let searched = 0;
    for (const {name, items, vertical} of bandedCases()) {
      for (const shape of EXCLUSION_SETS) {
        for (const width of BAND_WIDTHS) {
          for (const justify of [false, true]) {
            const constraints = {
              ...constraintsOf(vertical, width, justify),
              exclusions: shape.exclusions,
            };
            const broken = breakParagraphOptimally(items, constraints);
            const mine = planCost(items, broken.lines.map(spanOf), constraints);
            const best = bestPlanCost(items, constraints);
            searched += best.plans;
            if (costKey(mine) === costKey(best.cost)) continue;
            findings.push(
              `${name}/${shape.name}@${width}: ` +
                `${costKey(mine)} != ${costKey(best.cost)}`,
            );
          }
        }
      }
    }
    expect(findings).toEqual([]);
    expect(searched).toBeGreaterThanOrEqual(BANDED_PLANS);
  });

  it('stands each planned line in the band its own height carves', () => {
    const findings: string[] = [];
    let contained = 0;
    let isolated = 0;
    for (const {name, items, vertical} of bandedCases()) {
      for (const shape of EXCLUSION_SETS) {
        for (const width of BAND_WIDTHS) {
          const constraints = {
            ...constraintsOf(vertical, width),
            exclusions: shape.exclusions,
          };
          const broken = breakParagraphOptimally(items, constraints);
          const spans = broken.lines.map(spanOf);
          const placed = placePlan(items, constraints, spans);
          const at = `${name}/${shape.name}@${width}`;
          if (placed === null) {
            findings.push(`${at}: a hyphen paints into a shape`);
            continue;
          }
          broken.lines.forEach((line, index) => {
            const stand = placed[index];
            const where = `${at} line ${index}`;
            if (
              line.top !== stand.top ||
              line.height !== stand.height ||
              line.segment.left !== stand.segment.left ||
              line.segment.right !== stand.segment.right
            ) {
              findings.push(`${where}: stands elsewhere`);
              return;
            }
            contained++;
            if (stand.fit <= stand.limit + EPSILON) return;
            if (stand.first) {
              isolated++;
              return;
            }
            findings.push(`${where}: ${stand.fit} in ${stand.limit}`);
          });
        }
      }
    }
    expect(findings).toEqual([]);
    expect(contained).toBeGreaterThanOrEqual(BANDED_LINES);
    expect(isolated).toBeGreaterThan(0);
  });

  it('plans the greedy line beside an exclusion wherever both agree', () => {
    const findings: string[] = [];
    let agreed = 0;
    for (const {name, items, vertical} of bandedCases()) {
      for (const shape of EXCLUSION_SETS) {
        for (const width of BAND_WIDTHS) {
          const constraints = {
            ...constraintsOf(vertical, width),
            exclusions: shape.exclusions,
          };
          const optimal = breakParagraphOptimally(items, constraints);
          const greedy = breakParagraph(items, {
            maxWidth: width,
            textWrap: true,
            overflowWrap: 'normal',
            exclusions: shape.exclusions,
            vertical,
          });
          const theirs = new Map<string, BrokenLine>();
          for (const line of greedy.lines) theirs.set(breakKey(line), line);
          for (const line of optimal.lines) {
            const same = theirs.get(breakKey(line));
            if (same === undefined || same.top !== line.top) continue;
            agreed++;
            if (
              same.width === line.width &&
              same.segment.left === line.segment.left &&
              same.segment.right === line.segment.right
            ) {
              continue;
            }
            findings.push(
              `${name}/${shape.name}@${width}: ` +
                `${shapeOf(line)} != ${shapeOf(same)}`,
            );
          }
        }
      }
    }
    expect(findings).toEqual([]);
    expect(agreed).toBeGreaterThanOrEqual(AGREED_BANDED_LINES);
  });

  it('refuses a hyphen that would paint into an exclusion', () => {
    const metrics = metricsOf('normal', 0);
    const {items} = prepareParagraph('un­break­able xy', metrics);
    const vertical = verticalOf(items, [metrics]);
    const exclusions: TextExclusion[] = [
      {kind: 'rect', x: 60, y: 0, width: 40, height: 20},
    ];
    const constraints = {
      ...constraintsOf(vertical, 100),
      exclusions,
    };
    const broken = breakParagraphOptimally(items, constraints);
    const placed = placePlan(items, constraints, broken.lines.map(spanOf));
    expect(placed).not.toBeNull();
    // The first band is 60 wide and its right edge is the shape. `unbreak-`
    // measures 90 there, so the plan stops at `un-`.
    expect(placed?.[0].limit).toBe(60);
    expect(placed?.[0].hardEdge).toBe(true);
    expect(broken.lines[0].end).toEqual({segmentIndex: 2, graphemeIndex: 0});
    expect(broken.lines[0].width).toBe(30);
  });

  it('plans a taller line into the band that line stands in', () => {
    const {items, vertical} = mixedCase([
      textRun(0, REGULAR, 'aa bb '),
      boxRun(1, 20, 48),
      textRun(2, REGULAR, ' cc dd'),
    ]);
    const exclusions: TextExclusion[] = [
      {kind: 'rect', x: 80, y: 30, width: 60, height: 60},
    ];
    const constraints = {...constraintsOf(vertical, 140), exclusions};
    const broken = breakParagraphOptimally(items, constraints);
    const placed = placePlan(items, constraints, broken.lines.map(spanOf));
    expect(placed).not.toBeNull();
    // The 48px box reaches the shape, so its line keeps the 80px slot.
    const tall = broken.lines.findIndex(line => line.height === 48);
    expect(tall).toBeGreaterThanOrEqual(0);
    expect(broken.lines[tall].segment.right).toBe(80);
    expect(placed?.[tall].fit).toBeLessThanOrEqual(80 + EPSILON);
  });

  it('gives a paragraph with no wrapping one line for each chunk', () => {
    const metrics = metricsOf('pre-wrap', 0);
    const {items} = prepareParagraph('one two\nthree four', metrics);
    const vertical = verticalOf(items, [metrics]);
    const wide = breakParagraphOptimally(
      items,
      constraintsOf(vertical, Infinity),
    );
    expect(wide.lines).toHaveLength(2);
    expect(wide.lines.map(line => line.width)).toEqual([70, 100]);
  });
});
