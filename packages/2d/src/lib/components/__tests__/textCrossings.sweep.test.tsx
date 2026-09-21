import {linear, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {TextAlign, TextExclusion, TextWrap} from '../../partials/types';
import {segment} from '../../text';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Txt, TxtProps, TxtWrapMode} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {PaintCall, recordingTextContext} from './recordingTextContext';
import {add, lineTexts} from './sceneFixtures';
import {
  Finding,
  WordRecord,
  describeWord,
  expectNoFindings,
  matchedUnits,
  round,
  sameWord,
  seededPicker,
  wordRecords,
} from './textInvariants';

const GLYPH_WIDTH = 10;
const BOLD_WIDTH = 11;
const MONO_WIDTH = 12;
/**
 * Ascent the mock reports no font box for, so a line box is one em tall and a
 * baseline sits half of it below the line centre.
 */
const FALLBACK_BASELINE = 8;

/** Bold text is wider and monospace is fixed-width, as real fonts are. */
function measureGlyphs(text: string, font: string): number {
  if (font.includes('monospace')) return text.length * MONO_WIDTH;
  if (font.includes('700')) return text.length * BOLD_WIDTH;
  return text.length * GLYPH_WIDTH;
}

const SHORT_WORDS = 'pack my box with five dozen liquor jugs now';
const WIDE_WORD_SENTENCE = 'short words and supercalifragilistic after it';
const NEWLINE_SENTENCE = 'first line here\nsecond line there';
const NEWLINE_WIDTH = 1000;

type ContentKind =
  | 'text-prop'
  | 'string-children'
  | 'two-runs'
  | 'three-runs'
  | 'mixed-metric'
  | 'color-span'
  | 'opacity-span'
  | 'bold-span'
  | 'italic-span'
  | 'bold-italic-nested'
  | 'monospace-span'
  | 'letter-spacing-span';

const CONTENTS: ContentKind[] = [
  'text-prop',
  'string-children',
  'two-runs',
  'three-runs',
  'mixed-metric',
  'color-span',
  'opacity-span',
  'bold-span',
  'italic-span',
  'bold-italic-nested',
  'monospace-span',
  'letter-spacing-span',
];

/**
 * Forms every run of which measures the way plain text does, so plain text is
 * a reference for where their lines break and where their words sit. The mock
 * reports one width per glyph for every size, so a font-size span belongs
 * here; a bold, monospace or letter-spacing span does not.
 */
const METRIC_EQUAL: ContentKind[] = [
  'string-children',
  'two-runs',
  'three-runs',
  'mixed-metric',
  'color-span',
  'opacity-span',
  'italic-span',
];

const ALIGNS: TextAlign[] = ['left', 'center', 'right', 'justify'];
const WRAP_MODES: TxtWrapMode[] = ['greedy', 'knuth-plass'];

type Placement = 'root' | 'row' | 'column';
type BoxVariant = {name: string; width?: number; placement: Placement};

/**
 * Boxes the sweep lays text out in. Only an auto width depends on the parent
 * placement, so the fixed widths all sit at the root.
 */
const BOX_VARIANTS: BoxVariant[] = [
  {name: 'w120', width: 120, placement: 'root'},
  {name: 'w200', width: 200, placement: 'root'},
  {name: 'w320', width: 320, placement: 'root'},
  {name: 'auto-root', placement: 'root'},
  {name: 'auto-row', placement: 'row'},
  {name: 'auto-column', placement: 'column'},
];

const MAIN_WRAPS: TextWrap[] = [true, false];

function place(node: Txt, box: BoxVariant): void {
  if (box.placement === 'root') {
    add(node);
  } else if (box.placement === 'row') {
    add(
      new Layout({layout: true, direction: 'row', width: 400, children: node}),
    );
  } else {
    add(
      new Layout({
        layout: true,
        direction: 'column',
        width: 220,
        children: node,
      }),
    );
  }
}

function splitOffset(sentence: string): number {
  const mid = Math.floor(sentence.length / 2);
  const at = sentence.indexOf(' ', mid);
  return at === -1 ? mid : at + 1;
}

function splitAtSpace(s: string): [string, string] {
  const cut = splitOffset(s);
  return [s.slice(0, cut), s.slice(cut)];
}

function splitMidWord(s: string): [string, string, string] {
  const a = Math.floor(s.length * 0.3);
  const b = Math.floor(s.length * 0.7);
  return [s.slice(0, a), s.slice(a, b), s.slice(b)];
}

/** Offsets in the sentence where a content form puts a run boundary. */
function contentSeams(kind: ContentKind, sentence: string): number[] {
  if (kind === 'text-prop' || kind === 'string-children') return [];
  if (kind === 'three-runs') {
    return [
      Math.floor(sentence.length * 0.3),
      Math.floor(sentence.length * 0.7),
    ];
  }
  return [splitOffset(sentence)];
}

/** The sentence with its second half inside one styled span. */
function spanned(sentence: string, props: TxtProps, span: TxtProps): Txt {
  const [first, second] = splitAtSpace(sentence);
  return new Txt({
    ...props,
    children: [
      new Txt({children: first}),
      new Txt({...span, children: second}),
    ],
  });
}

/**
 * The same sentence in one of the forms a `Txt` can hold it. A string child
 * goes through the same text property a plain node does, so that form crosses
 * the child API rather than a second layout path.
 */
function buildContent(
  kind: ContentKind,
  sentence: string,
  props: TxtProps,
): Txt {
  switch (kind) {
    case 'text-prop':
      return new Txt({...props, text: sentence});
    case 'string-children':
      return new Txt({...props, children: sentence});
    case 'two-runs': {
      const [first, second] = splitAtSpace(sentence);
      return new Txt({
        ...props,
        children: [
          new Txt({fill: 'red', children: first}),
          new Txt({children: second}),
        ],
      });
    }
    case 'three-runs': {
      const [first, second, third] = splitMidWord(sentence);
      return new Txt({
        ...props,
        children: [
          new Txt({children: first}),
          new Txt({fill: 'red', children: second}),
          new Txt({children: third}),
        ],
      });
    }
    case 'mixed-metric':
      return spanned(sentence, props, {fontSize: 24});
    case 'color-span':
      return spanned(sentence, props, {fill: 'red'});
    case 'opacity-span':
      return spanned(sentence, props, {opacity: 0.5});
    case 'bold-span':
      return spanned(sentence, props, {fontWeight: 700});
    case 'italic-span':
      return spanned(sentence, props, {fontStyle: 'italic'});
    case 'monospace-span':
      return spanned(sentence, props, {fontFamily: 'monospace'});
    case 'letter-spacing-span':
      return spanned(sentence, props, {letterSpacing: 2});
    case 'bold-italic-nested': {
      const [first, second] = splitAtSpace(sentence);
      return new Txt({
        ...props,
        children: [
          new Txt({children: first}),
          new Txt({
            fill: 'red',
            children: new Txt({
              fontWeight: 700,
              fontStyle: 'italic',
              children: second,
            }),
          }),
        ],
      });
    }
  }
}

type LineShape = {
  fragments: {text: string; style: {font: string; letterSpacing: number}}[];
};

/**
 * The fragment texts of a line, optionally without the whitespace run each
 * run boundary inside the line falls in.
 */
function fragmentTexts(line: LineShape, dropSeamSpace: boolean): string[] {
  const texts = line.fragments.map(fragment => fragment.text);
  if (!dropSeamSpace) return texts;
  for (let at = 0; at + 1 < texts.length; at++) {
    if (/\s$/.test(texts[at]) || /^\s/.test(texts[at + 1])) {
      texts[at] = texts[at].replace(/\s+$/, '');
      texts[at + 1] = texts[at + 1].replace(/^\s+/, '');
    }
  }
  return texts;
}

function naturalLineWidth(line: LineShape, dropSeamSpace = false): number {
  const texts = fragmentTexts(line, dropSeamSpace);
  let width = 0;
  let hanging = true;
  for (let f = texts.length - 1; f >= 0; f--) {
    const {style} = line.fragments[f];
    const inked: string = hanging ? texts[f].replace(/\s+$/, '') : texts[f];
    hanging = hanging && inked.length === 0;
    width +=
      measureGlyphs(inked, style.font) + inked.length * style.letterSpacing;
  }
  return width;
}

class DrawProbe extends Txt {
  public probeDraw(context: CanvasRenderingContext2D) {
    this.draw(context);
  }
}

/** Every text fill a node paints, in draw order. */
function fillCalls(txt: DrawProbe): PaintCall[] {
  const {calls, context} = recordingTextContext();
  txt.probeDraw(context);
  return calls.filter(call => call.kind === 'fill');
}

/**
 * Left edge of the glyph each paint call begins with, in draw order, and how
 * many glyphs the calls cover. The queries report one unit per painted
 * grapheme, so the two walk in step.
 */
function paintStartXs(
  txt: Txt,
  calls: PaintCall[],
): {starts: number[]; covered: number; units: number} {
  const glyphs = txt.textGlyphs();
  const starts: number[] = [];
  let covered = 0;
  for (const call of calls) {
    const glyph = glyphs[covered];
    if (glyph) starts.push(glyph.x - glyph.width / 2);
    covered += segment(call.text, 'grapheme').length;
  }
  return {starts, covered, units: glyphs.length};
}

type Crossing = {
  content: ContentKind | 'inline-child' | 'whitespace-span';
  align?: TextAlign;
  wrap?: TextWrap;
  wrapMode?: TxtWrapMode;
  box?: string;
};

function crossKey(at: Crossing): string {
  return [
    at.content,
    at.align ?? 'any-align',
    String(at.wrap ?? 'any-wrap'),
    at.wrapMode ?? 'any-mode',
    at.box ?? 'any-box',
  ].join('|');
}

function overflowFindings(
  at: Crossing,
  txt: Txt,
  limit: number,
  exempt: (line: string, lineIndex: number, lineCount: number) => boolean,
): Finding[] {
  const {lines} = txt.textLines();
  const findings: Finding[] = [];
  lines.forEach((line, lineIndex) => {
    const natural = naturalLineWidth(line);
    const joined = line.fragments
      .map(fragment => fragment.text)
      .join('')
      .trim();
    if (natural > limit + 0.01 && !exempt(joined, lineIndex, lines.length)) {
      findings.push({
        kind: 'overflow',
        key: crossKey(at),
        evidence: [round(natural - limit), round(natural), joined],
      });
    }
  });
  return findings;
}

/**
 * Every advance one space can have on a line: one per font it paints with,
 * and, where the line is justified, the same plus the slack justification
 * spreads over each of its spaces.
 */
function spaceAdvances(line: LineShape, justifiedTo: number | null): number[] {
  const bare = line.fragments.map(
    fragment =>
      measureGlyphs(' ', fragment.style.font) + fragment.style.letterSpacing,
  );
  if (justifiedTo === null) return bare;
  const runs =
    fragmentTexts(line, false).join('').replace(/\s+$/, '').match(/\s+/g)
      ?.length ?? 0;
  if (runs === 0) return bare;
  const slack = (justifiedTo - naturalLineWidth(line, true)) / runs;
  return [...bare, ...bare.map(space => space + slack)];
}

function overlapFindings(
  at: Crossing,
  txt: Txt,
  justifiedTo: number | null,
): Finding[] {
  const lines = txt.textLines().lines;
  const byLine = new Map<number, {text: string; x: number; width: number}[]>();
  for (const word of txt.textWords()) {
    const words = byLine.get(word.lineIndex) ?? [];
    words.push(word);
    byLine.set(word.lineIndex, words);
  }
  const findings: Finding[] = [];
  for (const [lineIndex, words] of byLine) {
    const spaces = spaceAdvances(lines[lineIndex], justifiedTo);
    const sorted = [...words].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      const into = prev.x + prev.width / 2 - (next.x - next.width / 2);
      if (into > 0.01) {
        findings.push({
          kind: 'overlap',
          key: crossKey(at),
          evidence: [
            round(into),
            `${prev.text}+${next.text}`,
            spaces.map(round).join(','),
          ],
        });
      }
    }
  }
  return findings;
}

function sizeFindings(at: Crossing, txt: Txt, box: BoxVariant): Finding[] {
  const layout = txt.textLines();
  const size = txt.size();
  const findings: Finding[] = [];
  const report = (axis: string, actual: number, expected: number) =>
    findings.push({
      kind: `size-${axis}`,
      key: crossKey(at),
      evidence: [round(actual), round(expected)],
    });
  if (box.placement === 'root') {
    if (box.width !== undefined) {
      if (Math.abs(size.x - box.width) > 0.01) {
        report('width', size.x, box.width);
      }
    } else {
      const widest = Math.max(
        0,
        ...layout.lines.map(line => naturalLineWidth(line)),
      );
      const spaces = layout.lines.flatMap(line => spaceAdvances(line, null));
      if (Math.abs(size.x - widest) > 0.5) {
        findings.push({
          kind: 'size-auto-width',
          key: crossKey(at),
          evidence: [round(size.x), round(widest), spaces.map(round).join(',')],
        });
      }
    }
  }
  const expectedHeight = layout.lines.length * layout.lineHeight;
  if (Math.abs(size.y - expectedHeight) > 0.5) {
    report('height', size.y, expectedHeight);
  }
  return findings;
}

/**
 * The text a node holds, read off its lines. A line break takes the
 * whitespace it falls in with it, so each line gives up its trailing space and
 * two nodes that broke at different words still read alike. A line that ends
 * on a chosen hyphen joins the next one without it, so two nodes that
 * hyphenated a word at different parts read alike too.
 */
function paragraphText(txt: Txt): string {
  return linesOf(txt)
    .map(line => line.replace(/\s+$/, ''))
    .reduce(
      (text, line, index) =>
        index === 0
          ? line
          : text.endsWith('-')
            ? text.slice(0, -1) + line
            : `${text} ${line}`,
      '',
    );
}

const LINE_CACHE = new WeakMap<Txt, string[]>();
const WORD_CACHE = new WeakMap<Txt, WordRecord[]>();

/** Lines of a node, read once. A reference serves many content forms. */
function linesOf(txt: Txt): string[] {
  const found = LINE_CACHE.get(txt) ?? lineTexts(txt);
  LINE_CACHE.set(txt, found);
  return found;
}

/** Words of a node, measured from the left edge of its own box, read once. */
function wordsFromLeftEdge(txt: Txt, source: string): WordRecord[] {
  const cached = WORD_CACHE.get(txt);
  if (cached) return cached;
  const half = txt.size().x / 2;
  const found = wordRecords(txt, source).map(word => ({
    ...word,
    left: word.left + half,
    right: word.right + half,
  }));
  WORD_CACHE.set(txt, found);
  return found;
}

/** How a content form differs from plain text in what it holds and where. */
function comparisonFindings(
  at: Crossing,
  txt: Txt,
  reference: Txt,
  sentence: string,
  metricEqual: boolean,
): Finding[] {
  const findings: Finding[] = [];
  const key = crossKey(at);
  const actualText = paragraphText(txt);
  const expectedText = paragraphText(reference);
  if (actualText !== expectedText) {
    findings.push({
      kind: 'text',
      key,
      evidence: [JSON.stringify(expectedText), JSON.stringify(actualText)],
    });
  }

  if (!metricEqual) return findings;

  const actual = linesOf(txt);
  const expected = linesOf(reference);
  const same =
    actual.length === expected.length &&
    actual.every((line, i) => line === expected[i]);
  if (actualText === expectedText && !same) {
    findings.push({
      kind: 'lines',
      key,
      evidence: [JSON.stringify(expected), JSON.stringify(actual)],
    });
  }

  const actualWords = wordsFromLeftEdge(txt, sentence);
  const expectedWords = wordsFromLeftEdge(reference, sentence);
  const pairs = matchedUnits(
    expectedWords.map(word => `${word.text}@${word.from}`),
    actualWords.map(word => `${word.text}@${word.from}`),
  ).filter(([left]) => expectedWords[left].from >= 0);
  for (const [left, right] of pairs) {
    const word = expectedWords[left];
    const other = actualWords[right];
    if (sameWord(word, other)) continue;
    findings.push({
      kind: 'word-x',
      key,
      evidence: [
        describeWord(word),
        describeWord(other),
        round(other.left - word.left),
      ],
    });
  }
  return findings;
}

type MainSweep = {
  overflow: Finding[];
  overlap: Finding[];
  size: Finding[];
  text: Finding[];
  lines: Finding[];
  wordX: Finding[];
};

function collectMainSweep(): MainSweep {
  const sweep: MainSweep = {
    overflow: [],
    overlap: [],
    size: [],
    text: [],
    lines: [],
    wordX: [],
  };
  for (const align of ALIGNS) {
    for (const wrap of MAIN_WRAPS) {
      for (const wrapMode of WRAP_MODES) {
        for (const box of BOX_VARIANTS) {
          const props: TxtProps = {
            fontSize: 16,
            lineHeight: 20,
            textAlign: align,
            textWrap: wrap,
            wrapMode,
            ...(box.width !== undefined ? {width: box.width} : {}),
          };
          const byContent = new Map<ContentKind, Txt>();
          for (const content of CONTENTS) {
            const at: Crossing = {
              content,
              align,
              wrap,
              wrapMode,
              box: box.name,
            };
            const txt = buildContent(content, SHORT_WORDS, props);
            place(txt, box);
            byContent.set(content, txt);

            if (wrap === true && box.width !== undefined) {
              sweep.overflow.push(
                ...overflowFindings(
                  at,
                  txt,
                  box.width,
                  (line, lineIndex, lineCount) =>
                    (line.length > 0 && !/\s/.test(line)) ||
                    (wrapMode === 'knuth-plass' &&
                      align === 'justify' &&
                      lineIndex < lineCount - 1),
                ),
              );
            }
            sweep.overlap.push(
              ...overlapFindings(
                at,
                txt,
                align === 'justify' && box.width !== undefined
                  ? box.width
                  : null,
              ),
            );
            sweep.size.push(...sizeFindings(at, txt, box));
          }

          const reference = byContent.get('text-prop');
          if (!reference) continue;
          for (const content of CONTENTS) {
            const other = byContent.get(content);
            if (content === 'text-prop' || !other) continue;
            const found = comparisonFindings(
              {content, align, wrap, wrapMode, box: box.name},
              other,
              reference,
              SHORT_WORDS,
              METRIC_EQUAL.includes(content),
            );
            for (const finding of found) {
              if (finding.kind === 'text') sweep.text.push(finding);
              else if (finding.kind === 'lines') sweep.lines.push(finding);
              else sweep.wordX.push(finding);
            }
          }
        }
      }
    }
  }
  return sweep;
}

function collectWideWordSweep(): Finding[] {
  const findings: Finding[] = [];
  const aligns: TextAlign[] = ['left', 'justify'];
  for (const content of CONTENTS) {
    for (const align of aligns) {
      for (const wrapMode of WRAP_MODES) {
        const at: Crossing = {content, align, wrapMode, box: 'w120'};
        const txt = buildContent(content, WIDE_WORD_SENTENCE, {
          fontSize: 16,
          lineHeight: 20,
          width: 120,
          textAlign: align,
          textWrap: true,
          wrapMode,
        });
        add(txt);
        findings.push(
          ...overflowFindings(
            at,
            txt,
            120,
            line => line.length > 0 && !/\s/.test(line),
          ),
        );
      }
    }
  }
  return findings;
}

function collectNewlineSweep(): Finding[] {
  const contents = ['text-prop', 'two-runs'] as const;
  const findings: Finding[] = [];
  const props: TxtProps = {
    fontSize: 16,
    lineHeight: 20,
    width: NEWLINE_WIDTH,
    textWrap: 'pre',
    textAlign: 'left',
  };
  for (const content of contents) {
    const txt = buildContent(content, NEWLINE_SENTENCE, props);
    add(txt);
    const lines = lineTexts(txt).map(line => line.trimEnd());
    const expected = NEWLINE_SENTENCE.split('\n');
    if (JSON.stringify(lines) !== JSON.stringify(expected)) {
      findings.push({
        kind: 'newline',
        key: crossKey({content, wrap: 'pre'}),
        evidence: [JSON.stringify(expected), JSON.stringify(lines)],
      });
    }
  }
  return findings;
}

const WHITESPACE_SPANS: {
  name: string;
  wrap: TextWrap;
  parts: string[];
  whole: string;
}[] = [
  {
    name: 'pre-double-space',
    wrap: 'pre',
    parts: ['one ', ' two three'],
    whole: 'one  two three',
  },
  {
    name: 'nowrap-double-space',
    wrap: false,
    parts: ['a  ', 'b'],
    whole: 'a  b',
  },
  {
    name: 'nowrap-leading-space',
    wrap: false,
    parts: ['  a ', ' b'],
    whole: '  a  b',
  },
];

function collectWhitespaceSpans(): Finding[] {
  const findings: Finding[] = [];
  const aligns: TextAlign[] = ['left', 'justify'];
  for (const fixture of WHITESPACE_SPANS) {
    for (const align of aligns) {
      const at: Crossing = {
        content: 'whitespace-span',
        align,
        wrap: fixture.wrap,
        box: fixture.name,
      };
      const props: TxtProps = {
        fontSize: 16,
        lineHeight: 20,
        width: 200,
        textWrap: fixture.wrap,
        textAlign: align,
      };
      const plain = new Txt({...props, text: fixture.whole});
      const split = new Txt({
        ...props,
        children: fixture.parts.map(
          part => new Txt({fill: 'red', children: part}),
        ),
      });
      add(plain);
      add(split);
      findings.push(
        ...comparisonFindings(at, split, plain, fixture.whole, true),
      );
    }
  }
  return findings;
}

function collectAutoSizeSweep(): Finding[] {
  const sentence = 'pack my box with five dozen liquor jugs';
  const contents = ['text-prop', 'two-runs'] as const;
  const aligns: TextAlign[] = ['left', 'justify'];
  const wraps: TextWrap[] = [true, false];
  const findings: Finding[] = [];
  for (const content of contents) {
    for (const align of aligns) {
      for (const wrapMode of WRAP_MODES) {
        for (const wrap of wraps) {
          const txt = buildContent(content, sentence, {
            autoSize: true,
            fontSize: 40,
            width: 200,
            height: 80,
            textAlign: align,
            textWrap: wrap,
            wrapMode,
          });
          add(txt);
          const effective = txt.effectiveFontSize();
          const layout = txt.textLines();
          const widest = Math.max(
            0,
            ...layout.lines.map(line => naturalLineWidth(line)),
          );
          const scale = effective / 40;
          const fits = widest * scale <= 200.5 && layout.height <= 80.5;
          if (!fits && effective > 1.01) {
            findings.push({
              kind: 'autosize',
              key: crossKey({content, align, wrapMode, wrap}),
              evidence: [
                `${effective}`,
                round(widest * scale),
                round(layout.height),
              ],
            });
          }
        }
      }
    }
  }
  return findings;
}

function collectExclusionSweep(): Finding[] {
  const exclusions: TextExclusion[] = [
    {kind: 'rect', x: 0, y: 0, width: 80, height: 400},
  ];
  const props: TxtProps = {
    fontSize: 16,
    lineHeight: 20,
    width: 200,
    textWrap: true,
    exclusions,
  };
  const nodes: [Crossing['content'], Txt][] = CONTENTS.map(content => [
    content,
    buildContent(content, SHORT_WORDS, props),
  ]);
  nodes.push([
    'inline-child',
    new Txt({
      ...props,
      children: ['hello ', new Rect({width: 30, height: 20}), ' world again'],
    }),
  ]);

  const findings: Finding[] = [];
  for (const [content, txt] of nodes) {
    add(txt);
    for (const line of txt.textLines().lines) {
      const first = line.fragments[0];
      if (first && first.x < 80 - 0.01) {
        const text = line.fragments.map(fragment => fragment.text).join('');
        findings.push({
          kind: 'exclusion',
          key: crossKey({content}),
          evidence: [round(first.x), JSON.stringify(text)],
        });
      }
    }
  }
  return findings;
}

/** The fill each content form declares for each inked character it holds. */
function declaredFills(kind: ContentKind, sentence: string): string[] {
  const inked: string[] = [];
  const seams = contentSeams(kind, sentence);
  const spanFill =
    kind === 'color-span' || kind === 'bold-italic-nested' ? 'red' : 'base';
  for (let at = 0; at < sentence.length; at++) {
    if (/\s/.test(sentence[at])) continue;
    if (kind === 'two-runs') {
      inked.push(at < seams[0] ? 'red' : 'base');
    } else if (kind === 'three-runs') {
      inked.push(at >= seams[0] && at < seams[1] ? 'red' : 'base');
    } else if (seams.length === 0) {
      inked.push('base');
    } else {
      inked.push(at < seams[0] ? 'base' : spanFill);
    }
  }
  return inked;
}

/** The canvas fill style each declared fill name resolves to. */
const FILL_STYLES = new Map<string, string>([
  ['base', ''],
  ['red', 'rgb(255 0 0)'],
]);

function collectPaintSweep(): Finding[] {
  const findings: Finding[] = [];
  for (const content of CONTENTS) {
    for (const wrapMode of WRAP_MODES) {
      const at: Crossing = {content, wrapMode};
      const props: TxtProps = {
        fontSize: 16,
        lineHeight: 20,
        width: 200,
        textAlign: 'left',
        textWrap: true,
        wrapMode,
      };
      const txt = new DrawProbe({
        ...props,
        children: buildContent(content, SHORT_WORDS, {}).children(),
      });
      add(txt);
      const firstGlyph = txt.textGlyphs()[0];
      const calls = fillCalls(txt);
      const {starts, covered, units} = paintStartXs(txt, calls);

      if (covered !== units || starts.length !== calls.length) {
        findings.push({
          kind: 'paint-count',
          key: crossKey(at),
          evidence: [`${covered}`, `${units}`],
        });
        continue;
      }
      calls.forEach((call, index) => {
        if (Math.abs(call.x - starts[index]) > 0.01) {
          findings.push({
            kind: 'paint-x',
            key: crossKey(at),
            evidence: [
              `${index}`,
              round(starts[index]),
              round(call.x),
              round(call.x - starts[index]),
            ],
          });
        }
      });
      if (firstGlyph) {
        const offset = calls[0].y - firstGlyph.y;
        if (Math.abs(offset - FALLBACK_BASELINE) > 0.01) {
          findings.push({
            kind: 'paint-y',
            key: crossKey(at),
            evidence: [round(FALLBACK_BASELINE), round(offset)],
          });
        }
      }

      const fills = declaredFills(content, SHORT_WORDS);
      let inkAt = 0;
      const declared = calls.map(call => {
        const name = fills[Math.min(inkAt, fills.length - 1)] ?? 'base';
        inkAt += call.text.replace(/\s/g, '').length;
        return name;
      });
      calls.forEach((call, index) => {
        if (call.fillStyle !== FILL_STYLES.get(declared[index])) {
          findings.push({
            kind: 'paint-fill',
            key: crossKey(at),
            evidence: [
              `${index}`,
              declared[index],
              `${FILL_STYLES.get(declared[index])}`,
              call.fillStyle,
            ],
          });
          return;
        }
        for (let other = 0; other < index; other++) {
          const alike = declared[index] === declared[other];
          if (alike !== (call.fillStyle === calls[other].fillStyle)) {
            findings.push({
              kind: 'paint-fill',
              key: crossKey(at),
              evidence: [
                `${other}-${index}`,
                `${declared[other]}+${declared[index]}`,
                `${calls[other].fillStyle}+${call.fillStyle}`,
              ],
            });
          }
        }
      });

      if (
        content === 'opacity-span' &&
        !calls.some(call => Math.abs(call.globalAlpha - 0.5) < 0.01)
      ) {
        findings.push({
          kind: 'paint-alpha',
          key: crossKey(at),
          evidence: ['0.5'],
        });
      }
    }
  }
  return findings;
}

/** Strings whose normalization, whitespace or breaking is easy to get wrong. */
const HARD_TEXTS: {name: string; text: string}[] = [
  {name: 'newlines', text: 'first here\r\nsecond there\rthirdfourth'},
  {name: 'tabs', text: 'one\ttwo\tthree four'},
  {name: 'space-runs', text: 'one  two   three  four'},
  {name: 'edge-space', text: '  leading and trailing  '},
  {
    name: 'soft-hyphens',
    text: 'un­break­able ex­tra­ordi­nary words',
  },
  {name: 'long-word', text: 'short supercalifragilisticexpialidocious after'},
  {name: 'empty', text: ''},
];

const DIRECTIONS: CanvasDirection[] = ['ltr', 'rtl'];
const HARD_WRAPS: TextWrap[] = [true, 'pre'];
const HARD_EXCLUSIONS: {name: string; value: TextExclusion[]}[] = [
  {name: 'none', value: []},
  {name: 'left', value: [{kind: 'rect', x: 0, y: 0, width: 60, height: 400}]},
];
const HARD_PLACEMENTS: Placement[] = ['root', 'row'];
const HARD_CONTENTS: ContentKind[] = [
  'string-children',
  'two-runs',
  'three-runs',
  'mixed-metric',
  'bold-span',
];

type HardCase = {
  text: {name: string; text: string};
  direction: CanvasDirection;
  wrap: TextWrap;
  align: TextAlign;
  wrapMode: TxtWrapMode;
  exclusions: string;
  hyphenated: boolean;
  placement: Placement;
};

function hardKey(one: HardCase): string {
  return [
    one.text.name,
    one.direction,
    String(one.wrap),
    one.align,
    one.wrapMode,
    one.exclusions,
    one.hyphenated ? 'hyphen' : 'plain-break',
    one.placement,
  ].join('|');
}

/** Split every word into three-letter parts, so a hyphen can be chosen. */
function everyThird(word: string): string[] {
  const parts: string[] = [];
  for (let at = 0; at < word.length; at += 3) {
    parts.push(word.slice(at, at + 3));
  }
  return parts.length > 1 ? parts : [word];
}

function hardCase(partial: Partial<HardCase>): HardCase {
  return {
    text: HARD_TEXTS[0],
    direction: 'ltr',
    wrap: true,
    align: 'left',
    wrapMode: 'greedy',
    exclusions: 'none',
    hyphenated: false,
    placement: 'root',
    ...partial,
  };
}

const HARD_REQUIRED: HardCase[] = [
  hardCase({direction: 'rtl', align: 'center'}),
  hardCase({direction: 'rtl', align: 'justify'}),
  hardCase({align: 'justify', wrapMode: 'knuth-plass'}),
  hardCase({exclusions: 'left', wrapMode: 'knuth-plass'}),
  hardCase({hyphenated: true, text: HARD_TEXTS[5]}),
  hardCase({placement: 'row', text: HARD_TEXTS[3]}),
  hardCase({wrap: 'pre', text: HARD_TEXTS[0], align: 'right'}),
  hardCase({text: HARD_TEXTS[6]}),
];

function hardCases(): HardCase[] {
  const pick = seededPicker(24680);
  const cases = [...HARD_REQUIRED];
  for (let index = 0; index < 32; index++) {
    cases.push({
      text: pick(HARD_TEXTS),
      direction: pick(DIRECTIONS),
      wrap: pick(HARD_WRAPS),
      align: pick(ALIGNS),
      wrapMode: pick(WRAP_MODES),
      exclusions: pick(HARD_EXCLUSIONS).name,
      hyphenated: pick([true, false]),
      placement: pick(HARD_PLACEMENTS),
    });
  }
  const seen = new Set(cases.map(hardKey));
  expect(HARD_REQUIRED.map(hardKey).filter(each => !seen.has(each))).toEqual(
    [],
  );
  return cases;
}

function collectHardTextSweep(): Finding[] {
  const findings: Finding[] = [];
  for (const one of hardCases()) {
    const exclusions =
      HARD_EXCLUSIONS.find(each => each.name === one.exclusions)?.value ?? [];
    const props: TxtProps = {
      fontSize: 16,
      lineHeight: 20,
      width: 200,
      textAlign: one.align,
      textDirection: one.direction,
      textWrap: one.wrap,
      wrapMode: one.wrapMode,
      exclusions,
      ...(one.hyphenated ? {hyphenate: () => everyThird} : {}),
    };
    const box: BoxVariant = {
      name: one.placement,
      width: 200,
      placement: one.placement,
    };
    const reference = buildContent('text-prop', one.text.text, props);
    place(reference, box);
    for (const content of HARD_CONTENTS) {
      const other = buildContent(content, one.text.text, props);
      place(other, box);
      const at: Crossing = {content, align: one.align, wrapMode: one.wrapMode};
      for (const finding of comparisonFindings(
        at,
        other,
        reference,
        one.text.text,
        METRIC_EQUAL.includes(content),
      )) {
        findings.push({...finding, key: `${hardKey(one)}|${content}`});
      }
    }
  }
  return findings;
}

describe('Txt content forms across align, wrapping and box size', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext((text, state) => measureGlyphs(text, state.font));

  let cached: MainSweep | null = null;
  const sweep = () => (cached ??= collectMainSweep());

  it('keeps every line inside a fixed wrapped width', () => {
    expectNoFindings(sweep().overflow);
  }, 60000);

  it('keeps the words of a line from overlapping', () => {
    expectNoFindings(sweep().overlap);
  });

  it('sizes the box to the lines it lays out', () => {
    expectNoFindings(sweep().size);
  });

  it('holds the same text as plain text', () => {
    expectNoFindings(sweep().text);
  });

  it('breaks every content form at the same words as plain text', () => {
    expectNoFindings(sweep().lines);
  });

  it('places every word where plain text places it', () => {
    expectNoFindings(sweep().wordX);
  });
});

describe('Txt over-wide words across content forms', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext((text, state) => measureGlyphs(text, state.font));

  it('keeps every breakable line inside the box', () => {
    expectNoFindings(collectWideWordSweep());
  }, 60000);
});

describe('Txt rich text beside plain text', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext((text, state) => measureGlyphs(text, state.font));

  it('breaks hard text at the same words as plain text', () => {
    expectNoFindings(collectHardTextSweep());
  }, 60000);

  it('keeps a newline as a line break', () => {
    expectNoFindings(collectNewlineSweep());
  });

  it('lays out a span boundary inside whitespace like plain text', () => {
    expectNoFindings(collectWhitespaceSpans());
  });

  it('keeps autosized text inside its box', () => {
    expectNoFindings(collectAutoSizeSweep());
  });

  it('starts every line past an exclusion', () => {
    expectNoFindings(collectExclusionSweep());
  });
});

describe('Txt paint across content forms', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext((text, state) => measureGlyphs(text, state.font));

  let cached: Finding[] | null = null;
  const findings = () => (cached ??= collectPaintSweep());
  const of = (kinds: string[]) =>
    findings().filter(finding => kinds.includes(finding.kind));

  it('paints one fill per fragment where the layout places it', () => {
    expectNoFindings(of(['paint-count', 'paint-x', 'paint-y']));
  }, 60000);

  it('paints two fragments alike exactly when they share a fill', () => {
    expectNoFindings(of(['paint-fill']));
  });

  it('paints a span at the opacity of its own node', () => {
    expectNoFindings(of(['paint-alpha']));
  });
});

describe('Txt tween settling across content forms', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext((text, state) => measureGlyphs(text, state.font));

  const tweenFrom = 'quick fox runs';
  const aligns: TextAlign[] = ['left', 'justify'];
  const contents = ['text-prop', 'two-runs'] as const;
  for (const align of aligns) {
    for (const wrapMode of WRAP_MODES) {
      for (const content of contents) {
        it(
          `settles to the lines of a fresh node: ${align} ${wrapMode} ${content}`,
          generatorTest(function* () {
            const props: TxtProps = {
              fontSize: 16,
              lineHeight: 20,
              width: 150,
              textAlign: align,
              textWrap: true,
              wrapMode,
            };
            const tweened = new Txt({...props, text: tweenFrom});
            add(tweened);

            yield tweened.text(SHORT_WORDS, 0.5, linear);
            yield* waitFor(0.6);

            const fresh = buildContent(content, SHORT_WORDS, props);
            add(fresh);

            expect(lineTexts(tweened)).toEqual(lineTexts(fresh));
          }),
        );
      }
    }
  }
});
