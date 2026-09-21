import type {LayoutCursor, LayoutLineRange} from '@chenglou/pretext';
import {layoutNextLineRange, walkLineRanges} from '@chenglou/pretext';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import type {ParagraphItems} from '../../text/paragraphItems';
import {wholeSegmentRange} from '../../text/paragraphItems';
import type {
  ParagraphMetrics,
  PreparedFields,
  PreparedParagraph,
  WhiteSpaceMode,
  WordBreakMode,
} from '../../text/preparedParagraph';
import {
  prepareParagraph,
  readParagraphItems,
} from '../../text/preparedParagraph';
import type {LineBreakCursor} from '../../text/pretext-derived/lineBreak';
import {
  isDiscretionaryLineEnd,
  measurePreparedLineGeometry,
  normalizePreparedLineStart,
  stepPreparedLineGeometryFromChunk,
  walkPreparedLinesRaw,
} from '../../text/pretext-derived/lineBreak';
import {mockTextContext} from './mockTextContext';
import {mockFontWidth, TEXTS} from './textInvariants';

const FONT = '400 24px sans-serif';
const OTHER_FONTS = ['700 41px sans-serif', '400 13px monospace'];

/** Inputs the sweep texts do not reach: every rule the walker has its own. */
const EXTRA_TEXTS: {name: string; text: string}[] = [
  {name: 'terminal-shy', text: 'trailing soft hyphen word­'},
  {name: 'shy-only', text: '­'},
  {name: 'empty-hard-lines', text: 'a\n\n\nb\n'},
  {name: 'leading-hard-line', text: '\n\nlead'},
  {name: 'dash-word', text: 'a well-known-but-very-long-hyphenated-compound x'},
  {
    name: 'dashed-url',
    text: 'visit https://example.com/a-very-long-path-name-here now',
  },
  {name: 'digits', text: 'id 900000000000000000000000000 end'},
  {name: 'cjk', text: '你好世界 one こんにち'},
  {name: 'cjk-punctuation', text: '「漢字」。次'},
  {name: 'zero-width', text: 'a​b​c zero width'},
  {name: 'emoji', text: 'emoji \u{1F600}\u{1F468}‍\u{1F469}‍\u{1F467} tail'},
  {name: 'rtl', text: 'אבג rtl דה mixed'},
  {name: 'tab-runs', text: '\tlead\t\tgap\tAV\t'},
  {
    name: 'long-dashed-word',
    text:
      'a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t-u-v-w-x-y-z-' +
      'a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t-u-v-w-x-y-z end',
  },
];

const CASE_TEXTS = [...TEXTS, ...EXTRA_TEXTS];
const WHITE_SPACES: WhiteSpaceMode[] = ['normal', 'pre-wrap'];
const WORD_BREAKS: WordBreakMode[] = ['normal', 'keep-all'];
/** `-20` is below the advance of a glyph of this font, so an item shrinks. */
const LETTER_SPACINGS = [0, -1, 2, -20];

/** The sweep may only grow: a shrunken sweep is a weaker gate. */
const BATCH_COMPARISONS = 36172;
const STEP_COMPARISONS = 514721;

type WalkerCase = {name: string; prepared: PreparedParagraph};

function metricsOf(
  font: string,
  whiteSpace: WhiteSpaceMode,
  wordBreak: WordBreakMode,
  letterSpacing: number,
): ParagraphMetrics {
  return {font, whiteSpace, wordBreak, letterSpacing};
}

const CASE_MEMO: WalkerCase[] = [];

/** Built on first use: the fake canvas is only installed once the suite runs. */
function walkerCases(): WalkerCase[] {
  if (CASE_MEMO.length > 0) return CASE_MEMO;
  const cases = CASE_MEMO;
  for (const {name, text} of CASE_TEXTS) {
    for (const whiteSpace of WHITE_SPACES) {
      for (const wordBreak of WORD_BREAKS) {
        for (const letterSpacing of LETTER_SPACINGS) {
          cases.push({
            name: `${name}/${whiteSpace}/${wordBreak}/ls${letterSpacing}`,
            prepared: prepareParagraph(
              text,
              metricsOf(FONT, whiteSpace, wordBreak, letterSpacing),
            ),
          });
        }
      }
    }
  }
  return cases;
}

/** The fit epsilon of a non-Safari engine; `-EPSILON` puts a width on it. */
const EPSILON = 0.005;
const EDGE_NUDGES = [-0.01, -EPSILON, -0.004, 0, 0.004, 0.01];
const GRAPHEME_NUDGES = [-EPSILON, 0, 0.004];
/** Widths inside a long word are sampled, not walked grapheme by grapheme. */
const GRAPHEME_SAMPLE_LIMIT = 48;
/** Degenerate limits every comparison in the walker has to survive. */
const BASE_WIDTHS = [
  0,
  1,
  1e9,
  1e-9,
  Number.MIN_VALUE,
  NaN,
  Infinity,
  -Infinity,
];

/**
 * Widths on both sides of the fit epsilon at every item edge and at the
 * grapheme edges inside a breakable item, plus both sides of the tab
 * remainder threshold at every tab stop. An edge is the prefix BEFORE the
 * item, letter spacing included, so a fit limit lands on the real boundary.
 */
function probeWidths(items: ParagraphItems): number[] {
  const widths = new Set<number>(BASE_WIDTHS);
  let prefix = 0;
  for (let i = 0; i < items.widths.length; i++) {
    const spacing = items.letterSpacings[i];
    const graphemes = items.breakableFitAdvances[i];
    if (graphemes !== null) {
      const preferred = new Set(items.breakablePreferredBreaks[i] ?? []);
      const step = Math.ceil(graphemes.length / GRAPHEME_SAMPLE_LIMIT);
      let inside = 0;
      for (let g = 0; g < graphemes.length; g++) {
        inside += g === 0 ? graphemes[g] : graphemes[g] + spacing;
        // A preferred break is probed however long the item is.
        if (g % step !== 0 && !preferred.has(g + 1)) continue;
        for (const nudge of GRAPHEME_NUDGES) {
          widths.add(Math.max(0, inside + nudge));
          widths.add(Math.max(0, inside + spacing + nudge));
        }
      }
    }
    const leading = i === 0 ? 0 : spacing;
    for (const edge of [
      prefix + leading + items.widths[i],
      prefix + leading + items.lineEndFitAdvances[i],
    ]) {
      for (const nudge of EDGE_NUDGES) {
        widths.add(Math.max(0, edge + nudge));
      }
    }
    prefix += leading + items.widths[i];
  }
  const tabStop = items.tabStopAdvances[0] ?? 0;
  if (tabStop > 0 && items.kinds.includes('tab')) {
    for (let stop = tabStop; stop <= prefix + tabStop; stop += tabStop) {
      for (const nudge of [-1e-5, -1e-7, 0, 1e-7, 1e-5]) {
        widths.add(Math.max(0, stop + nudge));
      }
    }
  }
  return [...widths];
}

/** Lines that never end are the failure a continuation walk can hide. */
const CONTINUATION_CAP = 200;

function advances(from: LayoutCursor, to: LayoutCursor): boolean {
  return (
    to.segmentIndex > from.segmentIndex ||
    (to.segmentIndex === from.segmentIndex &&
      to.graphemeIndex > from.graphemeIndex)
  );
}

function key(line: LayoutLineRange): string {
  return [
    line.start.segmentIndex,
    line.start.graphemeIndex,
    line.end.segmentIndex,
    line.end.graphemeIndex,
    line.width.toFixed(9),
  ].join(':');
}

/**
 * Whether pretext ends a line on a hyphen it hangs past the free width. The
 * owned walk refuses that break: a hyphen it paints stands inside the segment
 * the line runs in.
 */
function hangsAHyphen(
  items: ParagraphItems,
  lines: readonly LayoutLineRange[],
  maxWidth: number,
): boolean {
  return lines.some(
    line =>
      isDiscretionaryLineEnd(
        items.kinds,
        line.end.segmentIndex,
        line.end.graphemeIndex,
      ) && line.width > maxWidth,
  );
}

/** The walker under test, wrapped the way pretext wraps its own. */
function nextLineRange(
  items: ParagraphItems,
  start: LayoutCursor,
  maxWidth: number,
): LayoutLineRange | null {
  const end: LineBreakCursor = {
    segmentIndex: start.segmentIndex,
    graphemeIndex: start.graphemeIndex,
  };
  const chunkIndex = normalizePreparedLineStart(items, end);
  if (chunkIndex < 0) return null;

  const startSegmentIndex = end.segmentIndex;
  const startGraphemeIndex = end.graphemeIndex;
  const width = stepPreparedLineGeometryFromChunk(
    items,
    end,
    chunkIndex,
    maxWidth,
  );
  if (width === null) return null;

  return {
    width,
    start: {
      segmentIndex: startSegmentIndex,
      graphemeIndex: startGraphemeIndex,
    },
    end: {segmentIndex: end.segmentIndex, graphemeIndex: end.graphemeIndex},
  };
}

/**
 * Two spacings over `A<ZWSP>B` with 12 px glyphs. Built here, not measured:
 * one preparation carries one spacing, so only hand-built items can tell the
 * owner of a seam apart.
 */
function seamItems(): ParagraphItems {
  return {
    kinds: ['text', 'zero-width-break', 'text'],
    sourceStarts: [0, 1, 2],
    sourceEnds: [1, 2, 3],
    handleRangeOf: wholeSegmentRange,
    widths: [12, 0, 12],
    lineEndFitAdvances: [14, 0, 17],
    lineEndPaintAdvances: [12, 0, 12],
    breakableFitAdvances: [null, null, null],
    paintAdvanceOf: () => 0,
    breakablePreferredBreaks: [null, null, null],
    spacingGraphemeCounts: [1, 0, 1],
    letterSpacings: [2, 5, 5],
    discretionaryHyphenWidths: [0, 0, 0],
    tabStopAdvances: [0, 0, 0],
    simpleLineWalkFastPath: false,
    chunks: [
      {startSegmentIndex: 0, endSegmentIndex: 3, consumedEndSegmentIndex: 3},
    ],
  };
}

/** A well-formed field bag, and the ways it may not be malformed. */
function malformedFields(): [string, PreparedFields][] {
  const sound: PreparedFields = {
    segments: ['ab'],
    kinds: ['text'],
    widths: [20],
    lineEndFitAdvances: [20],
    lineEndPaintAdvances: [20],
    breakableFitAdvances: [[10, 10]],
    breakablePreferredBreaks: [[1]],
    spacingGraphemeCounts: [2],
    letterSpacing: 0,
    discretionaryHyphenWidth: 5,
    tabStopAdvance: 80,
    simpleLineWalkFastPath: false,
    chunks: [
      {startSegmentIndex: 0, endSegmentIndex: 1, consumedEndSegmentIndex: 1},
    ],
  };
  return [
    [
      'empty fit row',
      {...sound, breakableFitAdvances: [[]], breakablePreferredBreaks: [null]},
    ],
    ['fractional break', {...sound, breakablePreferredBreaks: [[0.5]]}],
    ['repeated break', {...sound, breakablePreferredBreaks: [[1, 1]]}],
    ['break past the row', {...sound, breakablePreferredBreaks: [[3]]}],
    [
      'break without a row',
      {...sound, breakableFitAdvances: [null], breakablePreferredBreaks: [[1]]},
    ],
    [
      'fractional chunk bound',
      {
        ...sound,
        chunks: [
          {
            startSegmentIndex: 0,
            endSegmentIndex: 0.5,
            consumedEndSegmentIndex: 1,
          },
        ],
      },
    ],
    [
      'chunk bound that is not a number',
      {
        ...sound,
        chunks: [
          {
            startSegmentIndex: 0,
            endSegmentIndex: NaN,
            consumedEndSegmentIndex: 1,
          },
        ],
      },
    ],
  ];
}

const ENGINE_PROFILES = [
  {
    name: 'chromium',
    userAgent: 'Mozilla/5.0 (X11) Chrome/140.0.0.0 Safari/537.36',
    vendor: 'Google Inc.',
  },
  {
    name: 'gecko',
    userAgent: 'Mozilla/5.0 (X11; rv:141.0) Gecko/20100101 Firefox/141.0',
    vendor: '',
  },
  {
    name: 'safari',
    userAgent: 'Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1.15',
    vendor: 'Apple Computer, Inc.',
  },
  {
    name: 'ios-chrome',
    userAgent: 'Mozilla/5.0 (iPhone) CriOS/140.0.0.0 Safari/604.1',
    vendor: 'Apple Computer, Inc.',
  },
];

const PROFILE_TEXTS = CASE_TEXTS.filter(entry =>
  ['cjk-punctuation', 'dashed-url', 'soft-hyphens', 'short-words'].includes(
    entry.name,
  ),
);

const DERIVED = join(process.cwd(), 'src/lib/text/pretext-derived');

function pretextRoot(): string {
  const resolve = createRequire(join(process.cwd(), 'package.json'));
  return dirname(resolve.resolve('@chenglou/pretext/package.json'));
}

type UpstreamSource = {
  upstream: string;
  sha256?: string;
  functions?: {name: string; lines: string; sha256?: string}[];
};

function upstreamManifest(): {version: string; sources: UpstreamSource[]} {
  return JSON.parse(readFileSync(join(DERIVED, 'UPSTREAM.json'), 'utf8'));
}

function hashLines(file: string, lines: string): string {
  const [from, to] = lines.split('-').map(Number);
  const text = file
    .split('\n')
    .slice(from - 1, to)
    .join('\n');
  return createHash('sha256').update(text).digest('hex');
}

describe('owned line walker', () => {
  mockTextContext(mockFontWidth);

  it('was copied from the installed pretext sources', () => {
    const root = pretextRoot();
    const manifest = upstreamManifest();
    const installed = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    );
    expect(installed.version).toBe(manifest.version);

    const license = readFileSync(join(root, 'LICENSE'), 'utf8');
    expect(readFileSync(join(DERIVED, 'LICENSE'), 'utf8')).toBe(license);

    const hashed: string[] = [];
    for (const source of manifest.sources) {
      const file = readFileSync(join(root, source.upstream), 'utf8');
      if (source.sha256 !== undefined) {
        hashed.push(source.upstream);
        expect(
          `${source.upstream} ${createHash('sha256').update(file).digest('hex')}`,
        ).toBe(`${source.upstream} ${source.sha256}`);
      }
      for (const entry of source.functions ?? []) {
        if (entry.sha256 === undefined) continue;
        hashed.push(`${source.upstream}:${entry.name}`);
        expect(`${entry.name} ${hashLines(file, entry.lines)}`).toBe(
          `${entry.name} ${entry.sha256}`,
        );
      }
    }
    // Every copied file is covered, by its own hash or by its ranges.
    expect(hashed).toContain('src/analysis.ts:normalizeWhitespaceNormal');
    expect(hashed).toContain('src/analysis.ts:normalizeWhitespacePreWrap');
    expect(hashed).toContain('src/analysis.ts:SegmentBreakKind');
  });

  it('reads a paragraph into items the walker owns', () => {
    const findings: string[] = [];
    for (const {name, prepared} of walkerCases()) {
      const {items, handle} = prepared;
      const length = handle.segments.length;
      if (items.kinds.length !== length) findings.push(`${name} kinds`);
      if (items.sourceEnds[length - 1] !== prepared.text.length && length > 0) {
        findings.push(`${name} source range`);
      }
      if (items.letterSpacings.length !== length) findings.push(`${name} ls`);
      for (let i = 0; i < length; i++) {
        const source = prepared.text.slice(
          items.sourceStarts[i],
          items.sourceEnds[i],
        );
        if (source !== handle.segments[i]) findings.push(`${name} item ${i}`);
      }
    }
    expect(findings).toEqual([]);
  });

  it('matches walkLineRanges', () => {
    const findings: string[] = [];
    let comparisons = 0;
    for (const {name, prepared} of walkerCases()) {
      for (const width of probeWidths(prepared.items)) {
        comparisons++;
        const mine: string[] = [];
        const theirs: string[] = [];
        walkPreparedLinesRaw(
          prepared.items,
          width,
          (lineWidth, startSegment, startGrapheme, endSegment, endGrapheme) => {
            mine.push(
              key({
                width: lineWidth,
                start: {
                  segmentIndex: startSegment,
                  graphemeIndex: startGrapheme,
                },
                end: {segmentIndex: endSegment, graphemeIndex: endGrapheme},
              }),
            );
          },
        );
        const upstream: LayoutLineRange[] = [];
        walkLineRanges(prepared.handle, width, line => {
          upstream.push(line);
          theirs.push(key(line));
        });
        if (
          mine.join('|') !== theirs.join('|') &&
          !hangsAHyphen(prepared.items, upstream, width)
        ) {
          findings.push(
            `${name}@${width}: ${mine.join('|')} != ${theirs.join('|')}`,
          );
        }
      }
    }
    expect(findings).toEqual([]);
    expect(comparisons).toBeGreaterThanOrEqual(BATCH_COMPARISONS);
  });

  it('matches layoutNextLineRange, at one width and at a width per line', () => {
    const findings: string[] = [];
    let comparisons = 0;
    let capped = 0;
    for (const {name, prepared} of walkerCases()) {
      for (const width of probeWidths(prepared.items)) {
        for (const vary of [false, true]) {
          let cursor: LayoutCursor = {segmentIndex: 0, graphemeIndex: 0};
          let reachedCap = true;
          for (let line = 0; line < CONTINUATION_CAP; line++) {
            const lineWidth = vary && line % 2 === 1 ? width * 0.6 : width;
            const mine = nextLineRange(prepared.items, cursor, lineWidth);
            const theirs = layoutNextLineRange(
              prepared.handle,
              cursor,
              lineWidth,
            );
            if (mine === null || theirs === null) {
              if ((mine === null) !== (theirs === null)) {
                findings.push(`${name}@${width}/${vary}#${line}: one is null`);
              }
              reachedCap = false;
              break;
            }
            if (
              key(mine) !== key(theirs) &&
              !hangsAHyphen(prepared.items, [theirs], lineWidth)
            ) {
              findings.push(
                `${name}@${width}/${vary}#${line}: ` +
                  `${key(mine)} != ${key(theirs)}`,
              );
              reachedCap = false;
              break;
            }
            if (!advances(cursor, mine.end)) {
              findings.push(`${name}@${width}/${vary}#${line}: no progress`);
              reachedCap = false;
              break;
            }
            comparisons++;
            cursor = mine.end;
          }
          if (reachedCap) capped++;
        }
      }
    }
    expect(findings).toEqual([]);
    expect(comparisons).toBeGreaterThanOrEqual(STEP_COMPARISONS);
    // Every continuation walk ends of its own accord, inside the cap.
    expect(capped).toBe(0);
  });

  it('gives the same items in every font, apart from the advances', () => {
    const findings: string[] = [];
    for (const {name, text} of CASE_TEXTS) {
      for (const whiteSpace of WHITE_SPACES) {
        for (const wordBreak of WORD_BREAKS) {
          const base = prepareParagraph(
            text,
            metricsOf(FONT, whiteSpace, wordBreak, 0),
          );
          for (const font of OTHER_FONTS) {
            const other = prepareParagraph(
              text,
              metricsOf(font, whiteSpace, wordBreak, 0),
            );
            const shape = (prepared: PreparedParagraph) =>
              JSON.stringify([
                prepared.text,
                prepared.items.kinds,
                prepared.items.sourceStarts,
                prepared.items.sourceEnds,
                prepared.items.chunks,
                prepared.items.breakablePreferredBreaks,
                prepared.items.widths.length,
                prepared.items.breakableFitAdvances.map(row =>
                  row === null ? null : row.length,
                ),
                prepared.items.simpleLineWalkFastPath,
              ]);
            if (shape(base) !== shape(other)) {
              findings.push(`${name}/${whiteSpace}/${wordBreak}/${font}`);
            }
          }
        }
      }
    }
    expect(findings).toEqual([]);
  });

  it('charges a seam to the glyph before it', () => {
    const items = seamItems();

    // 12 + 2 (A owns the gap) + 12 + 5 (B owns the trailing gap).
    expect(measurePreparedLineGeometry(items, 1e9).maxLineWidth).toBe(31);
  });

  it('rejects prepared fields the walker cannot read', () => {
    const accepted: string[] = [];
    for (const [reason, fields] of malformedFields()) {
      try {
        readParagraphItems(fields, 0, text => text.length * 10);
        accepted.push(reason);
      } catch (error) {
        if (!(error instanceof Error)) {
          accepted.push(`${reason} (not an Error)`);
        }
      }
    }
    expect(accepted).toEqual([]);
  });

  it('agrees with pretext under every engine profile', async () => {
    const findings: string[] = [];
    for (const profile of ENGINE_PROFILES) {
      vi.resetModules();
      vi.stubGlobal('navigator', {
        userAgent: profile.userAgent,
        vendor: profile.vendor,
      });
      const pretext = await import('@chenglou/pretext');
      const owned = await import('../../text/preparedParagraph');
      const walker = await import('../../text/pretext-derived/lineBreak');

      for (const {name, text} of PROFILE_TEXTS) {
        for (const letterSpacing of [0, 2]) {
          const prepared = owned.prepareParagraph(
            text,
            metricsOf(FONT, 'normal', 'normal', letterSpacing),
          );
          for (const width of probeWidths(prepared.items)) {
            const mine: string[] = [];
            const theirs: string[] = [];
            walker.walkPreparedLinesRaw(
              prepared.items,
              width,
              (lineWidth, startSeg, startGrapheme, endSeg, endGrapheme) => {
                mine.push(
                  key({
                    width: lineWidth,
                    start: {
                      segmentIndex: startSeg,
                      graphemeIndex: startGrapheme,
                    },
                    end: {segmentIndex: endSeg, graphemeIndex: endGrapheme},
                  }),
                );
              },
            );
            const upstream: LayoutLineRange[] = [];
            pretext.walkLineRanges(prepared.handle, width, line => {
              upstream.push(line);
              theirs.push(key(line));
            });
            if (
              mine.join('|') !== theirs.join('|') &&
              !hangsAHyphen(prepared.items, upstream, width)
            ) {
              findings.push(
                `${profile.name}/${name}/ls${letterSpacing}@${width}`,
              );
            }
          }
        }
      }
    }
    vi.unstubAllGlobals();
    vi.resetModules();
    expect(findings).toEqual([]);
  });
});
