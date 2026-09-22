import {materializeLineRange} from '@chenglou/pretext';
import {describe, expect, it} from 'vitest';
import {
  lineBaselineOffset,
  lineBoxHeight,
  readVerticalMetrics,
} from '../../text/lineMetrics';
import type {MixedParagraph, ParagraphShape} from '../../text/mixedParagraph';
import {prepareMixedParagraph} from '../../text/mixedParagraph';
import type {
  ContentRun,
  RunMetrics,
  WhiteSpaceMode,
} from '../../text/paragraphContent';
import {buildParagraphContent} from '../../text/paragraphContent';
import type {ParagraphItems} from '../../text/paragraphItems';
import type {
  ParagraphMetrics,
  WordBreakMode,
} from '../../text/preparedParagraph';
import {canvasParagraphMeasurer} from '../../text/preparedParagraph';
import {walkPreparedLinesRaw} from '../../text/pretext-derived/lineBreak';
import {segment} from '../../text/segmenter';
import {mockDomTextWidth, mockTextContext} from './mockTextContext';
import {mockFontBounds, mockFontWidth, TEXTS} from './textInvariants';

const REGULAR: RunMetrics = {font: '400 20px sans-serif', letterSpacing: 0};
const BOLD: RunMetrics = {font: '700 20px sans-serif', letterSpacing: 0};
const MONO: RunMetrics = {font: '400 13px monospace', letterSpacing: 0};
const SPACED: RunMetrics = {font: '400 20px sans-serif', letterSpacing: 2};
const WIDE: RunMetrics = {font: '700 41px sans-serif', letterSpacing: -1};

const PALETTES: RunMetrics[][] = [
  [REGULAR, BOLD],
  [REGULAR, SPACED],
  [REGULAR, BOLD, MONO],
  [SPACED, WIDE, MONO, BOLD],
];

/** Texts with the offsets a metric seam is put at. */
const SEAM_CASES: {name: string; text: string; cuts: number[]}[] = [
  {name: 'word-edge', text: 'alpha beta gamma', cuts: [6, 11]},
  {name: 'inside-word', text: 'alphabeta gamma delta', cuts: [5, 12, 18]},
  {name: 'kerning-pair', text: 'AVA AVAV tail', cuts: [1, 5, 6]},
  {name: 'inside-space', text: 'a   b   c', cuts: [2, 3, 6]},
  {name: 'soft-hyphen', text: 'super­cali fragi', cuts: [5, 6, 9]},
  {name: 'tabs', text: 'a\tbb\tccc', cuts: [1, 2, 4]},
  {name: 'combining', text: 'éxéx é', cuts: [1, 2, 3, 5]},
  {name: 'cjk', text: '你好世界 tail', cuts: [1, 2, 5]},
  {name: 'dashed', text: 'a-b-c-d-e-f end', cuts: [2, 4, 6]},
  {name: 'digits', text: '1234567 x', cuts: [3, 5]},
  {name: 'zero-width', text: 'a​bc​d zz', cuts: [1, 2, 4]},
  {name: 'emoji', text: 'x\u{1F600}\u{1F600}y tail', cuts: [1, 3, 5]},
  {name: 'hard-break', text: 'one\ntwo three', cuts: [3, 4, 8]},
  {name: 'corpus-0', text: TEXTS[0].text, cuts: [3, 9]},
  {name: 'corpus-1', text: TEXTS[1].text, cuts: [2, 7, 11]},
];

const WHITE_SPACES: WhiteSpaceMode[] = ['normal', 'pre-wrap', 'pre-line'];
const WORD_BREAK: WordBreakMode = 'normal';

function shapeOf(whiteSpace: WhiteSpaceMode): ParagraphShape {
  return {whiteSpace, wordBreak: WORD_BREAK, metrics: REGULAR};
}

/** Cut `text` at `cuts` and give each part the next palette entry. */
function runsOf(
  text: string,
  cuts: readonly number[],
  palette: readonly RunMetrics[],
): ContentRun<number, number>[] {
  const bounds = [
    0,
    ...cuts.filter(at => at > 0 && at < text.length),
    text.length,
  ];
  const runs: ContentRun<number, number>[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    runs.push({
      kind: 'text',
      owner: i,
      paint: i,
      metrics: palette[i % palette.length],
      text: text.slice(bounds[i], bounds[i + 1]),
    });
  }
  return runs;
}

/** Bare advance of a piece of text, measured by the fake font alone. */
function bareWidth(text: string, metrics: RunMetrics): number {
  return mockFontWidth(text, {font: metrics.font, letterSpacing: '0px'});
}

const BLANK_KINDS = ['space', 'preserved-space', 'zero-width-break'];
const UNSPACED_KINDS = ['zero-width-break', 'soft-hyphen', 'hard-break'];
/** Items pretext gives no trailing gap to at a line end. */
const UNTERMINATED_KINDS = [
  'space',
  'zero-width-break',
  'hard-break',
  'soft-hyphen',
];
/** Advance an item must have: its own text, in its own font, plus spacing. */
function expectedWidth(
  items: ParagraphItems,
  index: number,
  text: string,
  metrics: RunMetrics,
): number {
  const kind = items.kinds[index];
  if (kind === 'hard-break') return 0;
  const own = text.slice(items.sourceStarts[index], items.sourceEnds[index]);
  const rendered = UNSPACED_KINDS.includes(kind)
    ? 0
    : kind === 'tab'
      ? 1
      : segment(own, 'grapheme').length;
  if (kind === 'tab') return items.widths[index];
  return (
    bareWidth(own, metrics) +
    (rendered > 1 ? (rendered - 1) * metrics.letterSpacing : 0)
  );
}

type Line = {
  width: number;
  start: number;
  startGrapheme: number;
  end: number;
  endGrapheme: number;
};

function linesOf(items: ParagraphItems, maxWidth: number): Line[] {
  const lines: Line[] = [];
  walkPreparedLinesRaw(items, maxWidth, (width, start, sg, end, eg) => {
    lines.push({width, start, startGrapheme: sg, end, endGrapheme: eg});
  });
  return lines;
}

/** Widths that land on and beside every item edge of a paragraph. */
function probeWidths(items: ParagraphItems): number[] {
  const widths = new Set<number>([0, 1, 1e9]);
  let prefix = 0;
  for (let i = 0; i < items.widths.length; i++) {
    prefix += (i === 0 ? 0 : items.letterSpacings[i - 1]) + items.widths[i];
    for (const nudge of [-0.005, 0, 0.004, 1]) {
      widths.add(Math.max(0, prefix + nudge));
    }
  }
  return [...widths];
}

/** Last item a line paints any of, or -1 for an empty line. */
function lastPaintedItem(line: Line): number {
  return line.endGrapheme > 0 ? line.end : line.end - 1;
}

/** Advance of the graphemes of one item a line paints, spacing included. */
function paintedItemWidth(
  items: ParagraphItems,
  line: Line,
  index: number,
): number {
  const row = items.breakableFitAdvances[index];
  const from = index === line.start ? line.startGrapheme : 0;
  const to =
    index === line.end && line.endGrapheme > 0
      ? line.endGrapheme
      : (row?.length ?? 1);
  if (row === null || (from === 0 && to === row.length)) {
    return items.widths[index];
  }
  let width = 0;
  for (let g = from; g < to; g++) width += row[g];
  return width + Math.max(0, to - from - 1) * items.letterSpacings[index];
}

/**
 * Line width read off the items: every gap belongs to the glyph before it,
 * and the final glyph of the line carries its own trailing gap.
 */
function lineWidthFromItems(items: ParagraphItems, line: Line): number {
  let width = 0;
  let previous = -1;
  let terminal = 0;
  const last = lastPaintedItem(line);
  for (let i = line.start; i <= last; i++) {
    const renders = !UNSPACED_KINDS.includes(items.kinds[i]);
    if (previous >= 0 && renders) width += items.letterSpacings[previous];
    width += paintedItemWidth(items, line, i);
    if (renders) previous = i;
    if (!UNTERMINATED_KINDS.includes(items.kinds[i])) {
      terminal =
        items.spacingGraphemeCounts[i] > 0 ? items.letterSpacings[i] : 0;
    }
  }
  return width + terminal;
}

/** Text an item holds, read back out of the preparation that measured it. */
function materializedText(mixed: MixedParagraph, index: number): string {
  const range = mixed.items.handleRangeOf(index);
  const line = materializeLineRange(
    mixed.preparations[mixed.items.owners[index]].handle,
    {width: 0, start: range.start, end: range.end},
  );
  return line.text.slice(range.startTrim, line.text.length - range.endTrim);
}

/** Paragraph offset of a line cursor, whatever items the paragraph holds. */
function offsetOf(
  items: ParagraphItems,
  text: string,
  index: number,
  grapheme: number,
): number {
  if (index >= items.sourceStarts.length) return text.length;
  const start = items.sourceStarts[index];
  if (grapheme === 0) return start;
  const own = segment(text.slice(start, items.sourceEnds[index]), 'grapheme');
  return grapheme >= own.length
    ? items.sourceEnds[index]
    : start + own[grapheme].index;
}

/** Every line of a paragraph as a pair of paragraph offsets and a width. */
function lineOffsets(
  items: ParagraphItems,
  text: string,
  maxWidth: number,
): string {
  return linesOf(items, maxWidth)
    .map(
      line =>
        `${offsetOf(items, text, line.start, line.startGrapheme)}:` +
        `${offsetOf(items, text, line.end, line.endGrapheme)}:${line.width}`,
    )
    .join('|');
}

function mixedCases() {
  const cases: {
    name: string;
    items: ParagraphItems;
    text: string;
    metrics: readonly ParagraphMetrics[];
  }[] = [];
  for (const {name, text, cuts} of SEAM_CASES) {
    for (const whiteSpace of WHITE_SPACES) {
      for (let p = 0; p < PALETTES.length; p++) {
        const content = buildParagraphContent(
          runsOf(text, cuts, PALETTES[p]),
          whiteSpace,
        );
        const mixed = prepareMixedParagraph(
          content,
          shapeOf(whiteSpace),
          canvasParagraphMeasurer,
        );
        cases.push({
          name: `${name}/${whiteSpace}/p${p}`,
          items: mixed.items,
          text: content.text,
          metrics: mixed.preparations.map(one => one.metrics),
        });
      }
    }
  }
  return cases;
}

/** Metrics that own the item at `index`, read back from the content spans. */
function metricsAt(
  spans: readonly {start: number; end: number; metrics: RunMetrics}[],
  offset: number,
): RunMetrics {
  let found = spans[0].metrics;
  for (const span of spans) {
    if (span.start <= offset) found = span.metrics;
  }
  return found;
}

describe('mixed paragraph metrics', () => {
  mockTextContext(mockFontWidth, mockFontBounds);
  mockDomTextWidth((text, font) =>
    mockFontWidth(text, {font, letterSpacing: '0px'}),
  );

  it('measures every item in the font that owns it', () => {
    const findings: string[] = [];
    let items = 0;
    for (const {name, text, cuts} of SEAM_CASES) {
      for (const whiteSpace of WHITE_SPACES) {
        for (let p = 0; p < PALETTES.length; p++) {
          const content = buildParagraphContent(
            runsOf(text, cuts, PALETTES[p]),
            whiteSpace,
          );
          const mixed = prepareMixedParagraph(
            content,
            shapeOf(whiteSpace),
            canvasParagraphMeasurer,
          );
          const list = mixed.items;
          for (let i = 0; i < list.widths.length; i++) {
            items++;
            const metrics = metricsAt(
              content.metricSpans,
              list.sourceStarts[i],
            );
            const want = expectedWidth(list, i, content.text, metrics);
            if (Math.abs(list.widths[i] - want) > 1e-9) {
              findings.push(
                `${name}/${whiteSpace}/p${p} item ${i}: ` +
                  `${list.widths[i]} != ${want}`,
              );
            }
            if (
              mixed.preparations[list.owners[i]].metrics.font !== metrics.font
            ) {
              findings.push(`${name}/${whiteSpace}/p${p} item ${i}: font`);
            }
          }
        }
      }
    }
    expect(findings).toEqual([]);
    expect(items).toBeGreaterThanOrEqual(1296);
  });

  it('builds line widths out of the item advances', () => {
    const findings: string[] = [];
    let compared = 0;
    for (const {name, items} of mixedCases()) {
      for (const width of probeWidths(items)) {
        for (const line of linesOf(items, width)) {
          const last = lastPaintedItem(line);
          if (last < line.start) continue;
          if (BLANK_KINDS.includes(items.kinds[last])) continue;
          if (items.kinds[last] === 'soft-hyphen') continue;
          let hasTab = false;
          for (let i = line.start; i <= last; i++) {
            if (items.kinds[i] === 'tab') hasTab = true;
          }
          if (hasTab) continue;
          compared++;
          const want = lineWidthFromItems(items, line);
          if (Math.abs(line.width - want) > 1e-9) {
            findings.push(`${name}@${width}: ${line.width} != ${want}`);
          }
        }
      }
    }
    expect(findings).toEqual([]);

    expect(compared).toBeGreaterThanOrEqual(16740);
  });

  it('gives the same items whatever paint-only runs are cut', () => {
    const findings: string[] = [];
    for (const {name, text, cuts} of SEAM_CASES) {
      for (const whiteSpace of WHITE_SPACES) {
        const whole = prepareMixedParagraph(
          buildParagraphContent(
            [
              {
                kind: 'text',
                owner: 0,
                paint: 0,
                metrics: SPACED,
                text,
              },
            ],
            whiteSpace,
          ),
          shapeOf(whiteSpace),
          canvasParagraphMeasurer,
        );
        const split = prepareMixedParagraph(
          buildParagraphContent(runsOf(text, cuts, [SPACED]), whiteSpace),
          shapeOf(whiteSpace),
          canvasParagraphMeasurer,
        );
        if (JSON.stringify(whole.items) !== JSON.stringify(split.items)) {
          findings.push(`${name}/${whiteSpace}`);
        }
      }
    }
    expect(findings).toEqual([]);
  });

  it('measures every refined grapheme row inside its own piece', () => {
    const findings: string[] = [];
    let pieces = 0;
    for (const {name, items, text, metrics} of mixedCases()) {
      for (let i = 0; i < items.widths.length; i++) {
        const row = items.breakableFitAdvances[i];
        if (row === null || !items.joinsPrevious[i]) continue;
        pieces++;
        const own = text.slice(items.sourceStarts[i], items.sourceEnds[i]);
        const summed = row.reduce((sum, value) => sum + value, 0);
        const direct = bareWidth(own, metrics[items.owners[i]]);
        if (Math.abs(summed - direct) > 1e-9) {
          findings.push(`${name} item ${i}: ${summed} != ${direct}`);
        }
        if (row.length !== segment(own, 'grapheme').length) {
          findings.push(`${name} item ${i}: ${row.length} graphemes`);
        }
      }
    }
    expect(findings).toEqual([]);
    expect(pieces).toBeGreaterThanOrEqual(204);
  });

  it('cuts a kerning pair into pieces measured apart', () => {
    const content = buildParagraphContent(
      [
        {kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text: 'A'},
        {kind: 'text', owner: 1, paint: 1, metrics: BOLD, text: 'V tail'},
      ],
      'normal',
    );
    const {items} = prepareMixedParagraph(
      content,
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );
    const whole = prepareMixedParagraph(
      buildParagraphContent(
        [{kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text: 'AV tail'}],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );

    // 20px regular A is 10, 20px bold V is 12; one font kerns AV to 18.
    expect(items.widths.slice(0, 2)).toEqual([10, 12]);
    expect(items.joinsPrevious.slice(0, 2)).toEqual([false, true]);
    expect(whole.items.widths[0]).toBe(18);
    // The slice of the kerned row does not agree with either piece.
    expect(whole.items.breakableFitAdvances[0]).toEqual([10, 10]);
  });

  it('gives an inline box the caller size and a break on each side', () => {
    const marker = '\uFFFC';
    const withBox = prepareMixedParagraph(
      buildParagraphContent(
        [
          {kind: 'text', owner: 0, paint: 0, metrics: SPACED, text: 'word'},
          {
            kind: 'object',
            owner: 1,
            paint: 1,
            metrics: SPACED,
            width: 10,
            height: 44,
          },
          {kind: 'text', owner: 2, paint: 2, metrics: SPACED, text: 'word x'},
        ],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );
    const asText = prepareMixedParagraph(
      buildParagraphContent(
        [
          {
            kind: 'text',
            owner: 0,
            paint: 0,
            metrics: SPACED,
            text: `word${marker}word x`,
          },
        ],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );

    const box = withBox.items.kinds.indexOf('inline-box');
    expect(box).toBe(1);
    expect(withBox.items.widths[box]).toBe(10);
    expect(withBox.items.boxHeights[box]).toBe(44);
    expect(withBox.items.breakableFitAdvances[box]).toBeNull();
    // A box joins nothing, so the words it is glued to are items of their own.
    expect(withBox.items.joinsPrevious).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    // A box needs the walker that reads the breaks around it.
    expect(withBox.items.simpleLineWalkFastPath).toBe(false);

    // The marker measures 10 in this font, so only the break rule can differ.
    const text = `word${marker}word x`;
    const differing = probeWidths(asText.items).filter(
      width =>
        lineOffsets(withBox.items, text, width) !==
        lineOffsets(asText.items, text, width),
    );
    expect(differing.length).toBeGreaterThan(0);
  });

  it('breaks on both sides of a box glued to text', () => {
    const text = 'ab￼cd';
    const boxed = prepareMixedParagraph(
      buildParagraphContent(
        [
          {kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text: 'ab'},
          {
            kind: 'object',
            owner: 1,
            paint: 1,
            metrics: REGULAR,
            width: 10,
            height: 12,
          },
          {kind: 'text', owner: 2, paint: 2, metrics: REGULAR, text: 'cd'},
        ],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );
    const plain = prepareMixedParagraph(
      buildParagraphContent(
        [{kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text}],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );

    // Every grapheme of the fake font is 10 wide, the box included.
    expect(lineOffsets(boxed.items, text, 25)).toBe('0:2:20|2:3:10|3:5:20');
    // The same text breaks where it runs out of room, not beside the marker.
    expect(lineOffsets(plain.items, text, 25)).toBe('0:2:20|2:4:20|4:5:10');
    // A line still fits the whole of it.
    expect(lineOffsets(boxed.items, text, 50)).toBe('0:5:50');
  });

  it('breaks around a box a space stands beside', () => {
    const text = 'ab ￼ cd';
    const {items} = prepareMixedParagraph(
      buildParagraphContent(
        [
          {kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text: 'ab '},
          {
            kind: 'object',
            owner: 1,
            paint: 1,
            metrics: REGULAR,
            width: 10,
            height: 12,
          },
          {kind: 'text', owner: 2, paint: 2, metrics: REGULAR, text: ' cd'},
        ],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );

    expect(items.kinds).toEqual([
      'text',
      'space',
      'inline-box',
      'space',
      'text',
    ]);
    expect(items.simpleLineWalkFastPath).toBe(false);
    // The box takes a line of its own; each line drops its trailing space.
    expect(lineOffsets(items, text, 35)).toBe('0:3:20|3:5:10|5:7:20');
    expect(lineOffsets(items, text, 70)).toBe('0:7:70');
  });

  it('keeps a wide inline box on a line of its own', () => {
    const {items} = prepareMixedParagraph(
      buildParagraphContent(
        [
          {kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text: 'ab '},
          {
            kind: 'object',
            owner: 1,
            paint: 1,
            metrics: REGULAR,
            width: 70,
            height: 12,
          },
          {kind: 'text', owner: 2, paint: 2, metrics: REGULAR, text: ' cd'},
        ],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );
    expect(linesOf(items, 70).map(line => line.width)).toEqual([20, 70, 20]);
  });

  it('grows a line box for a taller font and for a taller box', () => {
    const content = buildParagraphContent(
      [
        {kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text: 'a'},
        {
          kind: 'object',
          owner: 1,
          paint: 1,
          metrics: REGULAR,
          width: 10,
          height: 44,
        },
        {kind: 'text', owner: 2, paint: 2, metrics: WIDE, text: 'b'},
      ],
      'normal',
    );
    const mixed = prepareMixedParagraph(
      content,
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );
    const vertical = readVerticalMetrics(
      mixed.items,
      mixed.preparations.map(one => one.metrics),
      '100%',
      canvasParagraphMeasurer,
    );

    expect(lineBoxHeight(mixed.items, vertical, {start: 0, end: 3})).toBe(44);
    expect(lineBoxHeight(mixed.items, vertical, {start: 0, end: 1})).toBe(20);
    expect(lineBoxHeight(mixed.items, vertical, {start: 2, end: 3})).toBe(41);
    expect(lineBoxHeight(mixed.items, vertical, {start: 0, end: 0})).toBe(20);
    expect(vertical.ascents[2]).toBe(41 * 0.8);

    // A pixel line height is one length for the whole paragraph, as in CSS.
    const fixed = readVerticalMetrics(
      mixed.items,
      mixed.preparations.map(one => one.metrics),
      24,
      canvasParagraphMeasurer,
    );
    expect(lineBoxHeight(mixed.items, fixed, {start: 2, end: 3})).toBe(24);
    expect(lineBoxHeight(mixed.items, fixed, {start: 0, end: 3})).toBe(44);
  });

  it('puts two font sizes of one line on one baseline', () => {
    const mixed = prepareMixedParagraph(
      buildParagraphContent(
        [
          {kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text: 'a'},
          {kind: 'text', owner: 1, paint: 1, metrics: WIDE, text: 'b'},
        ],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );
    const vertical = readVerticalMetrics(
      mixed.items,
      mixed.preparations.map(one => one.metrics),
      '100%',
      canvasParagraphMeasurer,
    );
    const line = {start: 0, end: 2};
    const height = lineBoxHeight(mixed.items, vertical, line);

    // The taller run owns the leading, and both runs sit on its baseline.
    const tall = (41 - 41 * (0.8 + 0.25)) / 2 + 41 * 0.8;
    expect(height).toBe(41);
    expect(lineBaselineOffset(vertical, line, height)).toBeCloseTo(tall, 9);
    expect(
      lineBaselineOffset(vertical, {start: 1, end: 2}, height),
    ).toBeCloseTo(tall, 9);

    // A pixel line height gives both runs one box, and the taller run still
    // owns the leading, so the baseline lands where CSS puts it.
    const fixed = readVerticalMetrics(
      mixed.items,
      mixed.preparations.map(one => one.metrics),
      24,
      canvasParagraphMeasurer,
    );
    expect(lineBoxHeight(mixed.items, fixed, line)).toBe(24);
    expect(lineBaselineOffset(fixed, line, 24)).toBeCloseTo(
      (24 - 41 * (0.8 + 0.25)) / 2 + 41 * 0.8,
      9,
    );

    // One font alone keeps the reference rule: half the leading, then ascent.
    const small = {start: 0, end: 1};
    const smallHeight = lineBoxHeight(mixed.items, vertical, small);
    expect(lineBaselineOffset(vertical, small, smallHeight)).toBeCloseTo(
      (20 - 20 * (0.8 + 0.25)) / 2 + 20 * 0.8,
      9,
    );
  });

  it('addresses every item in the handle that measured it', () => {
    const findings: string[] = [];
    let checked = 0;
    for (const {name, text, cuts} of SEAM_CASES) {
      for (const whiteSpace of WHITE_SPACES) {
        for (let p = 0; p < PALETTES.length; p++) {
          const content = buildParagraphContent(
            runsOf(text, cuts, PALETTES[p]),
            whiteSpace,
          );
          const mixed = prepareMixedParagraph(
            content,
            shapeOf(whiteSpace),
            canvasParagraphMeasurer,
          );
          const list = mixed.items;
          for (let i = 0; i < list.widths.length; i++) {
            // A box holds no handle text, and a soft hyphen materializes as
            // the hyphen it would paint.
            if (list.kinds[i] === 'inline-box') continue;
            if (list.kinds[i] === 'soft-hyphen') continue;
            checked++;
            const held = materializedText(mixed, i);
            const own = content.text.slice(
              list.sourceStarts[i],
              list.sourceEnds[i],
            );
            if (held !== own && own.trim() !== '') {
              findings.push(
                `${name}/${whiteSpace}/p${p} item ${i}: ` +
                  `${JSON.stringify(held)} != ${JSON.stringify(own)}`,
              );
            }
          }
        }
      }
    }
    expect(findings).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(1284);
  });

  it('moves a metric seam off the inside of a grapheme cluster', () => {
    const cases = [
      {text: 'aé', at: 2},
      {text: '\u{1F600}', at: 1},
      {text: 'x aé', at: 4},
      {text: 'x \u{1F600}', at: 3},
    ];
    for (const {text, at} of cases) {
      const content = buildParagraphContent(
        runsOf(text, [at], [REGULAR, BOLD]),
        'normal',
      );
      const mixed = prepareMixedParagraph(
        content,
        shapeOf('normal'),
        canvasParagraphMeasurer,
      );
      const items = mixed.items;
      const starts = new Set(
        segment(text, 'grapheme').map(grapheme => grapheme.index),
      );
      starts.add(text.length);
      for (let i = 0; i < items.widths.length; i++) {
        const own = text.slice(items.sourceStarts[i], items.sourceEnds[i]);
        expect([
          text,
          starts.has(items.sourceStarts[i]),
          starts.has(items.sourceEnds[i]),
          materializedText(mixed, i),
        ]).toEqual([text, true, true, own]);
      }
    }
  });

  it('keeps an atomic unit whole across a metric seam', () => {
    const text = '你）';
    const split = prepareMixedParagraph(
      buildParagraphContent(
        [
          {kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text: '你'},
          {kind: 'text', owner: 1, paint: 1, metrics: BOLD, text: '）'},
        ],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );
    const whole = prepareMixedParagraph(
      buildParagraphContent(
        [{kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text}],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );

    expect(whole.items.kinds.length).toBe(1);
    expect(whole.items.breakableFitAdvances[0]).toBeNull();
    expect(split.items.joinsPrevious).toEqual([false, true]);
    // One over-wide unit, as the same text in one font is.
    expect(lineOffsets(whole.items, text, 10)).toBe('0:2:20');
    expect(lineOffsets(split.items, text, 10)).toBe('0:2:22');
  });

  it('resets the shaping context at a metric seam', () => {
    const spacedBold: RunMetrics = {
      font: '700 20px sans-serif',
      letterSpacing: 2,
    };
    const {items} = prepareMixedParagraph(
      buildParagraphContent(
        [
          {kind: 'text', owner: 0, paint: 0, metrics: SPACED, text: 'A'},
          {kind: 'text', owner: 1, paint: 1, metrics: spacedBold, text: 'VAV'},
        ],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );

    expect(items.widths).toEqual([10, 38]);
    // Bold V is 12 and bold AV kerns to 22, which no row of `AVAV` holds.
    expect(items.breakableFitAdvances[1]).toEqual([12, 12, 10]);
    expect(lineOffsets(items, 'AVAV', 30)).toBe('0:2:26|2:4:26');
  });

  it('gives an object marker exactly its own character', () => {
    const text = '￼́a';
    const mixed = prepareMixedParagraph(
      buildParagraphContent(
        [
          {
            kind: 'object',
            owner: 0,
            paint: 0,
            metrics: REGULAR,
            width: 10,
            height: 12,
          },
          {kind: 'text', owner: 1, paint: 1, metrics: REGULAR, text: '́a'},
        ],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );
    const items = mixed.items;

    expect(items.kinds).toEqual(['inline-box', 'text']);
    expect(items.sourceStarts).toEqual([0, 1]);
    expect(items.sourceEnds).toEqual([1, 3]);
    expect(items.joinsPrevious).toEqual([false, false]);
    // The accent belongs to the grapheme the marker starts, so the piece
    // after the box begins inside it.
    expect(items.handleRangeOf(1).startTrim).toBe(1);
    expect(materializedText(mixed, 1)).toBe('́a');
    expect(text.slice(items.sourceStarts[1], items.sourceEnds[1])).toBe('́a');
  });

  it('keeps a preferred break a seam lands on', () => {
    const text = 'a www.abc-def.com tail';
    const {items} = prepareMixedParagraph(
      buildParagraphContent(
        [
          {
            kind: 'text',
            owner: 0,
            paint: 0,
            metrics: REGULAR,
            text: 'a www.abc-',
          },
          {
            kind: 'text',
            owner: 1,
            paint: 1,
            metrics: BOLD,
            text: 'def.com tail',
          },
        ],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );
    const {items: whole} = prepareMixedParagraph(
      buildParagraphContent(
        [{kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text}],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );

    // The cut falls on the break the one-font item offers after `abc-`.
    expect(whole.breakablePreferredBreaks[2]).toEqual([8]);
    expect(items.kinds.slice(2, 4)).toEqual(['text', 'text']);
    expect(items.joinsPrevious.slice(2, 4)).toEqual([false, false]);
    expect(lineOffsets(items, text, 100)).toBe('0:10:100|10:18:84|18:22:48');
  });
});

describe('a font the canvas reports no box for', () => {
  mockTextContext(mockFontWidth);

  it('takes the em square the reference falls back to', () => {
    const mixed = prepareMixedParagraph(
      buildParagraphContent(
        [{kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text: 'a'}],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );
    const vertical = readVerticalMetrics(
      mixed.items,
      mixed.preparations.map(one => one.metrics),
      20,
      canvasParagraphMeasurer,
    );

    expect([vertical.ascents[0], vertical.descents[0]]).toEqual([20, 0]);
    expect(lineBaselineOffset(vertical, {start: 0, end: 1}, 20)).toBe(20);
  });
});

describe('a font the canvas reports an unusable box for', () => {
  mockTextContext(mockFontWidth, state =>
    state.font.includes('700')
      ? {ascent: Number.POSITIVE_INFINITY, descent: 0}
      : {ascent: 0, descent: 0},
  );

  it('takes the em square the reference falls back to', () => {
    const mixed = prepareMixedParagraph(
      buildParagraphContent(
        [
          {kind: 'text', owner: 0, paint: 0, metrics: REGULAR, text: 'a'},
          {kind: 'text', owner: 1, paint: 1, metrics: WIDE, text: 'b'},
        ],
        'normal',
      ),
      shapeOf('normal'),
      canvasParagraphMeasurer,
    );
    const vertical = readVerticalMetrics(
      mixed.items,
      mixed.preparations.map(one => one.metrics),
      20,
      canvasParagraphMeasurer,
    );

    expect(vertical.ascents).toEqual([20, 41]);
    expect(vertical.descents).toEqual([0, 0]);
  });
});
