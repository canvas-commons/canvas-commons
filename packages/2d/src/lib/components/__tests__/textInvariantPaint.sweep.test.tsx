import {describe, expect, it} from 'vitest';
import {TextAlign} from '../../partials/types';
import {segment} from '../../text';
import {Txt, TxtProps, TxtWrapMode} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {add, fontSizeOf} from './sceneFixtures';
import {
  ALIGNS,
  ContentForm,
  DIRECTIONS,
  DrawProbe,
  EXCLUSION_SETS,
  Finding,
  LETTER_SPACINGS,
  PAINT_ONLY_FORMS,
  PaintedGlyph,
  TEXTS,
  WRAPS,
  WRAP_MODES,
  WordRecord,
  baselineOffset,
  buildForm,
  describeWord,
  everyThirdHyphenator,
  expectNoFindings,
  fakeFont,
  fillCalls,
  fixedFormText,
  lineStrings,
  matchedUnits,
  mockFontWidth,
  paintedGlyphs,
  round,
  sameWord,
  seededPicker,
  wordRecords,
} from './textInvariants';

const TOLERANCE = 0.05;
const SOFT_HYPHEN = '­';
const BOX_WIDTH = 200;
const FONT_SIZE = 16;

type Case = {
  text: string;
  textName: string;
  align: TextAlign;
  direction: CanvasDirection;
  wrapMode: TxtWrapMode;
  wrap: string;
  exclusions: string;
  letterSpacing: number;
  hyphenated: boolean;
  autoSize: boolean;
  form: ContentForm;
};

function key(one: Case): string {
  return [
    one.textName,
    one.align,
    one.direction,
    one.wrapMode,
    one.wrap,
    one.exclusions,
    `ls${one.letterSpacing}`,
    one.hyphenated ? 'hyphen' : 'plain-break',
    one.autoSize ? 'autosize' : 'fixed',
    one.form,
  ].join('|');
}

function propsFor(one: Case): TxtProps {
  const set = EXCLUSION_SETS.find(each => each.name === one.exclusions);
  return {
    fontSize: FONT_SIZE,
    lineHeight: 20,
    width: BOX_WIDTH,
    ...(one.autoSize ? {autoSize: true, height: 120} : {}),
    textAlign: one.align,
    textDirection: one.direction,
    wrapMode: one.wrapMode,
    textWrap: one.wrap === 'pre' ? 'pre' : one.wrap === 'true',
    letterSpacing: one.letterSpacing,
    exclusions: set ? set.at(BOX_WIDTH) : [],
    ...(one.hyphenated ? {hyphenate: () => everyThirdHyphenator} : {}),
  };
}

function textOf(form: ContentForm, text: string): string {
  return fixedFormText(form) ?? text;
}

function generate(
  seed: number,
  count: number,
  forms: readonly ContentForm[],
): Case[] {
  const pick = seededPicker(seed);
  const cases: Case[] = [];
  for (let index = 0; index < count; index++) {
    const text = pick(TEXTS);
    cases.push({
      text: text.text,
      textName: text.name,
      align: pick(ALIGNS),
      direction: pick(DIRECTIONS),
      wrapMode: pick(WRAP_MODES),
      wrap: String(pick(WRAPS)),
      exclusions: pick(EXCLUSION_SETS).name,
      letterSpacing: pick(LETTER_SPACINGS),
      hyphenated: pick([true, false]),
      autoSize: pick([true, false]),
      form: pick(forms),
    });
  }
  return cases;
}

function required(partial: Partial<Case>): Case {
  return {
    text: TEXTS[0].text,
    textName: TEXTS[0].name,
    align: 'left',
    direction: 'ltr',
    wrapMode: 'greedy',
    wrap: 'true',
    exclusions: 'none',
    letterSpacing: 0,
    hyphenated: false,
    autoSize: false,
    form: 'plain',
    ...partial,
  };
}

function expectCoverage(cases: Case[], demanded: Case[]): void {
  const seen = new Set(cases.map(key));
  expect(demanded.map(key).filter(each => !seen.has(each))).toEqual([]);
}

const PAINT_ONLY_REQUIRED: Case[] = [
  required({align: 'center', direction: 'rtl', wrapMode: 'greedy'}),
  required({align: 'justify', direction: 'rtl', wrapMode: 'greedy'}),
  required({align: 'justify', wrapMode: 'knuth-plass', exclusions: 'middle'}),
  required({autoSize: true, textName: 'edge-space', text: TEXTS[6].text}),
  required({hyphenated: true, textName: 'soft-hyphens', text: TEXTS[2].text}),
  required({letterSpacing: 2, textName: 'tabs', text: TEXTS[4].text}),
];

function sameWords(one: WordRecord[], other: WordRecord[]): boolean {
  return (
    one.length === other.length &&
    one.every((word, index) => sameWord(word, other[index]))
  );
}

/**
 * Every difference a split of one run into two makes to the lines, the box
 * size and the words. Each property is checked on its own, and a word that
 * survives a line difference is still compared with the word of the same
 * source range.
 */
function geometryFindings(one: Case, plain: Txt, split: Txt): Finding[] {
  const at = key(one);
  const findings: Finding[] = [];

  const plainLines = lineStrings(plain);
  const splitLines = lineStrings(split);
  if (JSON.stringify(plainLines) !== JSON.stringify(splitLines)) {
    findings.push({
      kind: 'lines',
      key: at,
      evidence: [JSON.stringify(plainLines), JSON.stringify(splitLines)],
    });
  }

  const plainSize = plain.size();
  const splitSize = split.size();
  if (
    Math.abs(splitSize.x - plainSize.x) > TOLERANCE ||
    Math.abs(splitSize.y - plainSize.y) > TOLERANCE
  ) {
    findings.push({
      kind: 'size',
      key: at,
      evidence: [
        `${round(plainSize.x)}x${round(plainSize.y)}`,
        `${round(splitSize.x)}x${round(splitSize.y)}`,
      ],
    });
  }

  const plainWords = wordRecords(plain, one.text);
  const splitWords = wordRecords(split, one.text);
  if (sameWords(plainWords, splitWords)) return findings;
  const pairs = matchedUnits(
    plainWords.map(word => `${word.text}@${word.from}`),
    splitWords.map(word => `${word.text}@${word.from}`),
  );
  if (plainWords.length !== splitWords.length) {
    findings.push({
      kind: 'word-count',
      key: at,
      evidence: [
        JSON.stringify(plainWords.map(word => word.text)),
        JSON.stringify(splitWords.map(word => word.text)),
      ],
    });
  }
  for (const [left, right] of pairs) {
    const word = plainWords[left];
    const other = splitWords[right];
    if (word.from < 0 || sameWord(word, other)) continue;
    findings.push({
      kind: 'word',
      key: at,
      evidence: [describeWord(word), describeWord(other)],
    });
  }
  return findings;
}

function collectPaintOnly(): Finding[] {
  const bases = [...PAINT_ONLY_REQUIRED, ...generate(20260921, 36, ['plain'])];
  expectCoverage(
    bases.flatMap(one => PAINT_ONLY_FORMS.map(form => ({...one, form}))),
    PAINT_ONLY_REQUIRED.map(one => ({...one, form: PAINT_ONLY_FORMS[0]})),
  );

  const findings: Finding[] = [];
  for (const base of bases) {
    const props = propsFor(base);
    const plain = buildForm('plain', base.text, props);
    add(plain);
    for (const form of PAINT_ONLY_FORMS) {
      const one = {...base, form};
      const split = buildForm(form, one.text, props);
      add(split);
      findings.push(...geometryFindings(one, plain, split));
    }
  }
  return findings;
}

function isInk(text: string): boolean {
  return text.trim().length > 0 && text !== SOFT_HYPHEN;
}

type InkGlyph = PaintedGlyph & {font: string};

function paintedInk(probe: DrawProbe): InkGlyph[] {
  return fillCalls(probe).flatMap(call =>
    paintedGlyphs(call)
      .filter(glyph => isInk(glyph.text))
      .map(glyph => ({...glyph, font: call.font})),
  );
}

function queriedInk(probe: DrawProbe): PaintedGlyph[] {
  return probe
    .textGlyphs()
    .filter(unit => isInk(unit.text))
    .map(unit => ({
      text: unit.text,
      left: unit.x - unit.width / 2,
      right: unit.x + unit.width / 2,
      y: unit.y,
    }));
}

/**
 * Compare the glyphs a node paints with the glyphs its queries report: by
 * identity, by interval, and by the baseline offset the font box demands.
 * Glyphs that survive a count difference are still compared with their own
 * counterpart.
 */
function paintFindings(one: Case, probe: DrawProbe): Finding[] {
  const at = key(one);
  const painted = paintedInk(probe);
  const queried = queriedInk(probe);
  const findings: Finding[] = [];

  if (painted.length !== queried.length) {
    findings.push({
      kind: 'glyph-count',
      key: at,
      evidence: [
        `${painted.length}`,
        `${queried.length}`,
        JSON.stringify(painted.map(glyph => glyph.text).join('')),
        JSON.stringify(queried.map(glyph => glyph.text).join('')),
      ],
    });
  }

  const pairs = matchedUnits(
    painted.map(glyph => glyph.text),
    queried.map(unit => unit.text),
  );
  for (const [left, right] of pairs) {
    const glyph = painted[left];
    const unit = queried[right];

    const expected = baselineOffset(fontSizeOf(glyph.font));
    const offset = glyph.y - unit.y;
    if (Math.abs(offset - expected) > TOLERANCE) {
      findings.push({
        kind: 'y',
        key: at,
        evidence: [
          JSON.stringify(glyph.text),
          `${left}`,
          round(expected),
          round(offset),
        ],
      });
    }

    const dLeft = glyph.left - unit.left;
    const dRight = glyph.right - unit.right;
    if (Math.abs(dLeft) > TOLERANCE || Math.abs(dRight) > TOLERANCE) {
      findings.push({
        kind: 'x',
        key: at,
        evidence: [
          JSON.stringify(glyph.text),
          `${left}`,
          round(dLeft),
          round(dRight),
        ],
      });
    }
  }
  return findings;
}

/**
 * Forms the sweep generates over. An inline child is a REQUIRED case only: no
 * surveyed project puts a non-`Txt` child inside a `Txt`. A paint seam inside
 * one shaping is a known limit with a test of its own.
 */
const PAINT_FORMS: ContentForm[] = [
  'plain',
  'span-at-space',
  'span-paint-only',
  'span-bold',
  'span-italic',
  'span-family',
  'crlf-across-leaves',
];

const PAINT_REQUIRED: Case[] = [
  required({align: 'center', direction: 'rtl', wrapMode: 'greedy'}),
  required({align: 'justify', direction: 'rtl', wrapMode: 'greedy'}),
  required({align: 'right', direction: 'rtl', wrapMode: 'knuth-plass'}),
  required({form: 'crlf-across-leaves', wrap: 'pre'}),
  required({form: 'inline-child'}),
  required({form: 'inline-child', align: 'justify', wrapMode: 'knuth-plass'}),
  required({align: 'justify', exclusions: 'middle', wrapMode: 'knuth-plass'}),
  required({
    form: 'span-italic',
    align: 'justify',
    exclusions: 'middle',
    wrapMode: 'knuth-plass',
  }),
  required({form: 'span-italic', autoSize: true}),
  required({form: 'span-family', direction: 'rtl', align: 'right'}),
  required({
    form: 'span-family',
    hyphenated: true,
    textName: 'long-word',
    text: TEXTS[1].text,
  }),
  required({form: 'span-family', exclusions: 'left'}),
  required({hyphenated: true, textName: 'long-word', text: TEXTS[1].text}),
  required({textName: 'punctuation', text: TEXTS[7].text}),
];

function paintProbe(one: Case): DrawProbe {
  const props = propsFor(one);
  const built = buildForm(one.form, textOf(one.form, one.text), props);
  const probe = new DrawProbe({...props, children: built.children()});
  add(probe);
  return probe;
}

function collectPaint(letterSpacing: number): Finding[] {
  const cases = [...PAINT_REQUIRED, ...generate(970321, 40, PAINT_FORMS)].map(
    one => ({...one, letterSpacing}),
  );
  expectCoverage(
    cases,
    PAINT_REQUIRED.map(one => ({...one, letterSpacing})),
  );

  return cases.flatMap(one => paintFindings(one, paintProbe(one)));
}

/**
 * Where each glyph of a left-aligned line has to sit, from the fake font and
 * the box alone. Nothing here reads a position the layout computed, so an
 * error the paint and the queries share is still caught.
 */
function expectedLefts(txt: Txt): number[] {
  const lefts: number[] = [];
  for (const line of txt.textLines().lines) {
    let cursor = BOX_WIDTH / -2;
    for (const fragment of line.fragments) {
      const state = {
        font: fragment.style.font,
        letterSpacing: `${fragment.style.letterSpacing}px`,
      };
      const base = cursor;
      let prefix = '';
      for (const unit of segment(fragment.text, 'grapheme')) {
        if (isInk(unit.segment)) {
          lefts.push(base + mockFontWidth(prefix, state));
        }
        prefix += unit.segment;
      }
      cursor = base + mockFontWidth(fragment.text, state);
    }
  }
  return lefts;
}

const PLACEMENT_CASES: Case[] = [
  required({}),
  required({letterSpacing: 2}),
  required({textName: 'punctuation', text: TEXTS[7].text}),
  required({textName: 'space-runs', text: TEXTS[5].text, wrap: 'pre'}),
];

function collectPlacement(): Finding[] {
  const findings: Finding[] = [];
  for (const one of PLACEMENT_CASES) {
    const props = propsFor(one);
    const txt = buildForm(one.form, one.text, props);
    add(txt);
    const expected = expectedLefts(txt);
    const glyphs = txt.textGlyphs().filter(unit => isInk(unit.text));
    glyphs.forEach((unit, index) => {
      if (index >= expected.length) return;
      const left = unit.x - unit.width / 2;
      if (Math.abs(left - expected[index]) > TOLERANCE) {
        findings.push({
          kind: 'place',
          key: key(one),
          evidence: [
            JSON.stringify(unit.text),
            `${index}`,
            round(expected[index]),
            round(left),
          ],
        });
      }
    });
    if (glyphs.length !== expected.length) {
      findings.push({
        kind: 'place-count',
        key: key(one),
        evidence: [`${expected.length}`, `${glyphs.length}`],
      });
    }
  }
  return findings;
}

describe('Txt paint-only changes', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('moves nothing a split of one run into two can be seen by', () => {
    expectNoFindings(collectPaintOnly());
  }, 60000);
});

describe('Txt paint against geometry queries', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('paints every glyph where the queries report it', () => {
    expectNoFindings(collectPaint(0));
  }, 60000);

  it('paints every glyph where the queries report it, spaced apart', () => {
    expectNoFindings(collectPaint(2));
  }, 60000);

  it('paints every glyph where the queries report it, spaced closer', () => {
    expectNoFindings(collectPaint(-1.5));
  }, 60000);

  it('places every glyph at the advance its own font demands', () => {
    expectNoFindings(collectPlacement());
  });
});
