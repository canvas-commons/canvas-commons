import {describe, expect, it} from 'vitest';
import {Length, TextAlign} from '../../partials/types';
import {TxtProps, TxtWrapMode} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {add} from './sceneFixtures';
import {
  ALIGNS,
  ContentForm,
  DIRECTIONS,
  DrawProbe,
  EXCLUSION_SETS,
  Finding,
  TEXTS,
  WRAPS,
  WRAP_MODES,
  buildForm,
  everyThirdHyphenator,
  expectNoFindings,
  fakeFont,
  largestFittingSize,
  round,
  seededPicker,
} from './textInvariants';

/** The one size {@link Txt.fitFontSize} returns when nothing fits. */
const NO_FIT_SIZE = 1;
const CAP = 40;
const LINE_HEIGHT: Length = '140%';

const LINE_HEIGHTS: Length[] = ['140%', '100%', 30];
const LETTER_SPACINGS = [0, -1.5, 2];

const BOXES: {name: string; width: number; height: number}[] = [
  {name: 'narrow', width: 80, height: 60},
  {name: 'wide', width: 200, height: 48},
  {name: 'tall', width: 120, height: 120},
  {name: 'squat', width: 160, height: 30},
];

const FORMS: ContentForm[] = [
  'plain',
  'span-at-space',
  'span-bold',
  'span-in-kern',
  'span-spaced',
  'inline-tall',
];

type Case = {
  text: string;
  textName: string;
  box: string;
  width: number;
  height: number;
  cap: number;
  lineHeight: Length;
  letterSpacing: number;
  align: TextAlign;
  direction: CanvasDirection;
  wrapMode: TxtWrapMode;
  wrap: string;
  exclusions: string;
  hyphenated: boolean;
  form: ContentForm;
};

function key(one: Case): string {
  return [
    one.textName,
    one.box,
    one.align,
    one.direction,
    one.wrapMode,
    one.wrap,
    one.exclusions,
    `lh${one.lineHeight}`,
    `ls${one.letterSpacing}`,
    one.hyphenated ? 'hyphen' : 'plain-break',
    one.form,
  ].join('|');
}

function propsFor(one: Case): TxtProps {
  const set = EXCLUSION_SETS.find(each => each.name === one.exclusions);
  return {
    lineHeight: one.lineHeight,
    letterSpacing: one.letterSpacing,
    width: one.width,
    height: one.height,
    textAlign: one.align,
    textDirection: one.direction,
    wrapMode: one.wrapMode,
    textWrap: one.wrap === 'pre' ? 'pre' : one.wrap === 'true',
    exclusions: set ? set.at(one.width) : [],
    ...(one.hyphenated ? {hyphenate: () => everyThirdHyphenator} : {}),
  };
}

function required(partial: Partial<Case>): Case {
  return {
    text: TEXTS[0].text,
    textName: TEXTS[0].name,
    box: BOXES[2].name,
    width: BOXES[2].width,
    height: BOXES[2].height,
    cap: CAP,
    lineHeight: LINE_HEIGHT,
    letterSpacing: 0,
    align: 'left',
    direction: 'ltr',
    wrapMode: 'greedy',
    wrap: 'true',
    exclusions: 'none',
    hyphenated: false,
    form: 'plain',
    ...partial,
  };
}

const REQUIRED: Case[] = [
  required({
    textName: 'one-letter',
    text: 'a',
    box: 'tight',
    width: 100,
    height: 10,
    cap: 80,
    lineHeight: 10,
  }),
  required({direction: 'rtl', align: 'right'}),
  required({direction: 'rtl', align: 'justify', wrapMode: 'knuth-plass'}),
  required({exclusions: 'middle', wrapMode: 'knuth-plass'}),
  required({hyphenated: true, textName: 'long-word', text: TEXTS[1].text}),
  required({form: 'inline-tall'}),
  required({form: 'span-bold', exclusions: 'left', wrap: 'pre'}),
  required({letterSpacing: -1.5}),
  required({letterSpacing: 2, wrapMode: 'knuth-plass'}),
  required({letterSpacing: -1.5, wrapMode: 'knuth-plass'}),
  required({letterSpacing: 2, align: 'right'}),
  required({letterSpacing: 2, align: 'center'}),
  required({letterSpacing: 2, align: 'justify'}),
  required({letterSpacing: -1.5, align: 'right'}),
  required({letterSpacing: 2, direction: 'rtl', align: 'right'}),
  required({letterSpacing: 2, exclusions: 'left'}),
  required({letterSpacing: -1.5, exclusions: 'middle'}),
  required({form: 'span-spaced'}),
  required({form: 'span-spaced', align: 'center'}),
  required({form: 'span-in-kern'}),
  required({lineHeight: '100%'}),
  required({lineHeight: 30}),
  required({
    textName: 'one-letter',
    text: 'a',
    box: 'tolerance',
    width: 20,
    height: 40 - 1e-7,
    cap: 40,
    lineHeight: 40,
  }),
  required({
    textName: 'edge-space',
    text: TEXTS[6].text,
    direction: 'rtl',
    wrap: 'pre',
  }),
];

function generate(seed: number, count: number): Case[] {
  const pick = seededPicker(seed);
  const cases: Case[] = [];
  for (let index = 0; index < count; index++) {
    const text = pick(TEXTS);
    const box = pick(BOXES);
    cases.push({
      text: text.text,
      textName: text.name,
      box: box.name,
      width: box.width,
      height: box.height,
      cap: CAP,
      lineHeight: pick(LINE_HEIGHTS),
      letterSpacing: pick(LETTER_SPACINGS),
      align: pick(ALIGNS),
      direction: pick(DIRECTIONS),
      wrapMode: pick(WRAP_MODES),
      wrap: String(pick(WRAPS)),
      exclusions: pick(EXCLUSION_SETS).name,
      hyphenated: pick([true, false]),
      form: pick(FORMS),
    });
  }
  return cases;
}

/** What the scan says about a chosen size under one reading of the anchors. */
function missOf(
  chosen: number,
  largest: number,
): {kind: string; largest: number} | null {
  if (largest === 0) {
    return chosen === NO_FIT_SIZE ? null : {kind: 'no-fit', largest};
  }
  if (chosen === largest) return null;
  return {kind: chosen < largest ? 'small' : 'large', largest};
}

function collectFitSweep(): Finding[] {
  const cases = [...REQUIRED, ...generate(4711, 48)];
  const seen = new Set(cases.map(key));
  expect(REQUIRED.map(key).filter(each => !seen.has(each))).toEqual([]);

  const findings: Finding[] = [];
  for (const one of cases) {
    const props = propsFor(one);
    const fitted = buildForm(one.form, one.text, {
      ...props,
      autoSize: true,
      fontSize: one.cap,
    });
    add(fitted);
    const chosen = fitted.effectiveFontSize();

    const probe = new DrawProbe({
      ...props,
      autoSize: false,
      children: buildForm(one.form, one.text, {}).children(),
    });
    add(probe);
    const miss = missOf(chosen, largestFittingSize(probe, one));
    if (miss === null) continue;
    findings.push({
      kind: miss.kind,
      key: key(one),
      evidence: [`${chosen}`, `${miss.largest}`, round(chosen - miss.largest)],
    });
  }
  return findings;
}

describe('Txt autoSize against an exhaustive scan', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('picks the largest size whose lines really fit', () => {
    expectNoFindings(collectFitSweep());
  }, 60000);
});
