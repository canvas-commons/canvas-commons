import {describe, expect, it} from 'vitest';
import {TextAlign, TextShapeExclusion} from '../../partials/types';
import {OverflowWrapMode, breakParagraph, measureLineSpanFit} from '../../text';
import {needsInkFit} from '../../text/pretext-derived/lineBreak';
import {Layout} from '../Layout';
import {TxtProps, TxtWrapMode} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {add} from './sceneFixtures';
import {
  ContentForm,
  DrawProbe,
  EXCLUSION_SETS,
  Finding,
  aHyphenLineIsAlignedShortOfItsInk,
  buildForm,
  declaredIn,
  everyThirdHyphenator,
  expectNoFindings,
  fakeFont,
  fillCalls,
  inkSpan,
  lineStrings,
  round,
  seededPicker,
} from './textInvariants';
import {contentFloorOf, paragraphOf} from './txtInternals';

const TOLERANCE = 0.05;
const BOX_WIDTH = 120;
const BOX_HEIGHT = 400;
const FONT_SIZE = 16;
const LINE_HEIGHT = 20;

/** Only the long word of each text is wider than the box. */
const TEXTS = [
  {
    name: 'long-word',
    text: 'short and supercalifragilisticexpialidocious after',
    overWide: 'supercalifragilisticexpialidocious',
  },
  {
    name: 'soft-hyphens',
    text: 'un­break­able ex­tra­ordi­nary words',
    overWide: null,
  },
  {
    name: 'short-words',
    text: 'pack my box AV five dozen jugs now',
    overWide: null,
  },
  {
    name: 'newline',
    text: 'first here\nsupercalifragilisticexpialidocious',
    overWide: 'supercalifragilisticexpialidocious',
  },
];

const FORMS: ContentForm[] = ['plain', 'span-bold', 'span-spaced'];

type Case = {
  textName: string;
  text: string;
  overWide: string | null;
  overflowWrap: OverflowWrapMode;
  wrapMode: TxtWrapMode;
  align: TextAlign;
  placement: 'root' | 'row-item';
  hyphenated: boolean;
  exclusions: string;
  letterSpacing: number;
  form: ContentForm;
};

function key(one: Case): string {
  return [
    one.textName,
    one.overflowWrap,
    one.wrapMode,
    one.align,
    one.placement,
    one.hyphenated ? 'hyphen' : 'plain-break',
    one.exclusions,
    `ls${one.letterSpacing}`,
    one.form,
  ].join('|');
}

function exclusionsOf(one: Case): TextShapeExclusion[] {
  const set = EXCLUSION_SETS.find(each => each.name === one.exclusions);
  return set ? set.at(BOX_WIDTH) : [];
}

function propsFor(one: Case): TxtProps {
  return {
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    textWrap: true,
    overflowWrap: one.overflowWrap,
    wrapMode: one.wrapMode,
    textAlign: one.align,
    letterSpacing: one.letterSpacing,
    exclusions: declaredIn(
      {width: BOX_WIDTH, height: BOX_HEIGHT},
      exclusionsOf(one),
    ),
    ...(one.hyphenated ? {hyphenate: () => everyThirdHyphenator} : {}),
  };
}

/** Painted ink of every line, grouped by the baseline it was drawn on. */
function paintedLines(probe: DrawProbe): {left: number; right: number}[] {
  const lines: {left: number; right: number}[] = [];
  let previous: number | null = null;
  for (const call of fillCalls(probe)) {
    const ink = inkSpan(call);
    if (!ink) continue;
    if (previous === null || Math.abs(call.y - previous) > TOLERANCE) {
      lines.push(ink);
      previous = call.y;
      continue;
    }
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = {
      left: Math.min(last.left, ink.left),
      right: Math.max(last.right, ink.right),
    };
  }
  return lines;
}

function buildProbe(one: Case): DrawProbe {
  const props = propsFor(one);
  const probe = new DrawProbe({
    ...props,
    children: buildForm(one.form, one.text, {}).children(),
  });
  if (one.placement === 'row-item') {
    add(
      new Layout({
        layout: true,
        direction: 'row',
        width: BOX_WIDTH * 3,
        height: BOX_HEIGHT,
        children: probe,
      }),
    );
  } else {
    add(probe);
  }
  return probe;
}

function collectCase(one: Case): Finding[] {
  const probe = buildProbe(one);
  const findings: Finding[] = [];

  const texts = lineStrings(probe);
  const lines = probe.textLines().lines;
  const half = probe.size().x / 2;
  for (const [index, line] of paintedLines(probe).entries()) {
    const text = texts[index] ?? '';
    const past = line.right - half;
    // `normal` lets a unit no break can divide keep its whole width.
    const loneUnit =
      one.overflowWrap === 'normal' &&
      !/\s/.test(text.trim()) &&
      !text.trimEnd().endsWith('-');
    if (
      past > TOLERANCE &&
      !loneUnit &&
      !aHyphenLineIsAlignedShortOfItsInk(
        one.align,
        lines[index],
        text.trimEnd(),
        past,
      )
    ) {
      findings.push({
        kind: 'line-past-box',
        key: key(one),
        evidence: [`${index}`, round(past), JSON.stringify(text)],
      });
    }
  }

  // A hyphenator breaks the over-wide word wherever a hyphen fits, so only an
  // unhyphenated text can still hold it whole.
  if (one.overWide !== null && !one.hyphenated) {
    const whole = texts.filter(line => line.includes(one.overWide ?? ''));
    const expected = one.overflowWrap === 'anywhere' ? 0 : 1;
    if (whole.length !== expected) {
      findings.push({
        kind: 'over-wide-word',
        key: key(one),
        evidence: [`${expected}`, `${whole.length}`],
      });
    }
  }

  if (Math.abs(probe.size().x - BOX_WIDTH) > TOLERANCE) {
    findings.push({
      kind: 'box-width',
      key: key(one),
      evidence: [round(BOX_WIDTH), round(probe.size().x)],
    });
  }
  return findings;
}

function required(partial: Partial<Case>): Case {
  return {
    textName: TEXTS[0].name,
    text: TEXTS[0].text,
    overWide: TEXTS[0].overWide,
    overflowWrap: 'normal',
    wrapMode: 'greedy',
    align: 'left',
    placement: 'root',
    hyphenated: false,
    exclusions: 'none',
    letterSpacing: 0,
    form: 'plain',
    ...partial,
  };
}

const REQUIRED: Case[] = [
  required({overflowWrap: 'anywhere'}),
  required({overflowWrap: 'anywhere', wrapMode: 'knuth-plass'}),
  required({overflowWrap: 'anywhere', align: 'justify'}),
  required({
    overflowWrap: 'anywhere',
    wrapMode: 'knuth-plass',
    hyphenated: true,
  }),
  required({overflowWrap: 'anywhere', placement: 'row-item'}),
  required({overflowWrap: 'anywhere', exclusions: 'left'}),
  required({overflowWrap: 'anywhere', exclusions: 'middle'}),
  required({
    overflowWrap: 'anywhere',
    exclusions: 'left',
    wrapMode: 'knuth-plass',
  }),
  required({overflowWrap: 'anywhere', form: 'span-bold'}),
  required({overflowWrap: 'anywhere', form: 'span-spaced'}),
  required({overflowWrap: 'anywhere', letterSpacing: 2}),
  required({overflowWrap: 'anywhere', letterSpacing: -1}),
  required({overflowWrap: 'normal', wrapMode: 'knuth-plass'}),
  required({overflowWrap: 'normal', align: 'justify', placement: 'row-item'}),
  required({overflowWrap: 'normal', hyphenated: true}),
  required({
    overflowWrap: 'anywhere',
    textName: TEXTS[3].name,
    text: TEXTS[3].text,
    overWide: TEXTS[3].overWide,
  }),
  required({
    overflowWrap: 'anywhere',
    textName: TEXTS[1].name,
    text: TEXTS[1].text,
    overWide: TEXTS[1].overWide,
    wrapMode: 'knuth-plass',
  }),
];

function generate(seed: number, count: number): Case[] {
  const pick = seededPicker(seed);
  const cases: Case[] = [];
  for (let index = 0; index < count; index++) {
    const text = pick(TEXTS);
    cases.push({
      textName: text.name,
      text: text.text,
      overWide: text.overWide,
      overflowWrap: pick(['normal', 'anywhere'] as OverflowWrapMode[]),
      wrapMode: pick(['greedy', 'knuth-plass'] as TxtWrapMode[]),
      align: pick(['left', 'center', 'right', 'justify'] as TextAlign[]),
      placement: pick(['root', 'row-item'] as const),
      hyphenated: pick([true, false]),
      exclusions: pick(EXCLUSION_SETS).name,
      letterSpacing: pick([-1, 0, 2]),
      form: pick(FORMS),
    });
  }
  return cases;
}

/* The floor sweep: what the reported minimum content width promises. */

class FloorProbe extends DrawProbe {
  public floor(): number {
    return contentFloorOf(this);
  }

  /** Widest a line of the break pass at a width has to fit, no exclusion. */
  public widestLineAt(maxWidth: number): number {
    const paragraph = paragraphOf(this);
    if (!paragraph) return 0;
    const items = paragraph.items;
    const broken = breakParagraph(items, {
      maxWidth,
      textWrap: this.textWrap() !== false,
      overflowWrap: this.overflowWrap(),
      exclusions: [],
      vertical: paragraph.vertical,
      inkFit: true,
    });
    let widest = 0;
    for (const line of broken.lines) {
      widest = Math.max(
        widest,
        measureLineSpanFit(items, line, 0, needsInkFit(items)),
      );
    }
    return widest;
  }
}

type FloorCase = {
  textName: string;
  text: string;
  overflowWrap: OverflowWrapMode;
  wrapMode: TxtWrapMode;
  hyphenated: boolean;
  letterSpacing: number;
  form: ContentForm;
};

function floorKey(one: FloorCase): string {
  return [
    one.textName,
    one.overflowWrap,
    one.wrapMode,
    one.hyphenated ? 'hyphen' : 'plain-break',
    `ls${one.letterSpacing}`,
    one.form,
  ].join('|');
}

function collectFloor(one: FloorCase): Finding[] {
  const props: TxtProps = {
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    textWrap: true,
    overflowWrap: one.overflowWrap,
    wrapMode: one.wrapMode,
    ...(one.hyphenated ? {hyphenate: () => everyThirdHyphenator} : {}),
    letterSpacing: one.letterSpacing,
  };
  const probe = new FloorProbe({
    ...props,
    children: buildForm(one.form, one.text, {}).children(),
  });
  add(probe);

  const findings: Finding[] = [];
  const floor = probe.floor();
  const atZero = probe.widestLineAt(0);
  // A break inside a word is legal only where its hyphen fits, so the pass at
  // width zero cannot take one and the floor is rightly narrower than it.
  const hyphenated = one.hyphenated || one.textName === 'soft-hyphens';

  if (floor > atZero + TOLERANCE) {
    findings.push({
      kind: 'floor-above-the-pass',
      key: floorKey(one),
      evidence: [round(atZero), round(floor)],
    });
  }
  if (!hyphenated && floor < atZero - TOLERANCE) {
    findings.push({
      kind: 'floor-below-the-pass',
      key: floorKey(one),
      evidence: [round(atZero), round(floor)],
    });
  }

  // Every line has to fit the width the floor promises.
  probe.width(floor);
  const texts = lineStrings(probe);
  const half = probe.size().x / 2;
  for (const [index, line] of paintedLines(probe).entries()) {
    const text = texts[index] ?? '';
    const past = line.right - half;
    if (past <= TOLERANCE) continue;
    findings.push({
      kind: 'line-past-the-floor',
      key: floorKey(one),
      evidence: [`${index}`, round(past), JSON.stringify(text)],
    });
  }
  return findings;
}

function floorRequired(partial: Partial<FloorCase>): FloorCase {
  return {
    textName: TEXTS[0].name,
    text: TEXTS[0].text,
    overflowWrap: 'normal',
    wrapMode: 'greedy',
    hyphenated: false,
    letterSpacing: 0,
    form: 'plain',
    ...partial,
  };
}

const FLOOR_CASES: FloorCase[] = TEXTS.flatMap(text =>
  (['normal', 'anywhere'] as OverflowWrapMode[]).flatMap(overflowWrap =>
    (['greedy', 'knuth-plass'] as TxtWrapMode[]).flatMap(wrapMode =>
      [false, true].map(hyphenated =>
        floorRequired({
          textName: text.name,
          text: text.text,
          overflowWrap,
          wrapMode,
          hyphenated,
        }),
      ),
    ),
  ),
).concat([
  floorRequired({letterSpacing: 2}),
  floorRequired({letterSpacing: -1}),
  floorRequired({letterSpacing: 2, overflowWrap: 'anywhere'}),
  floorRequired({form: 'span-bold'}),
  floorRequired({form: 'span-spaced'}),
  floorRequired({form: 'span-bold', overflowWrap: 'anywhere'}),
  floorRequired({form: 'span-spaced', wrapMode: 'knuth-plass'}),
  floorRequired({form: 'inline-child'}),
  floorRequired({form: 'inline-child', overflowWrap: 'anywhere'}),
]);

describe('Txt overflowWrap crossing text layout', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('keeps every line inside the box it was broken for', () => {
    const cases = [...REQUIRED, ...generate(0x0f10, 120)];
    expectNoFindings(cases.flatMap(collectCase));
  }, 60000);
});

describe('Txt minimum content width', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('reports the narrowest width its own lines fit in', () => {
    expectNoFindings(FLOOR_CASES.flatMap(collectFloor));
  }, 60000);
});

describe('Txt over-wide word', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('opens the next line at its first glyph', () => {
    for (const wrapMode of ['greedy', 'knuth-plass'] as TxtWrapMode[]) {
      const probe = new DrawProbe({
        text: 'aa supercalifragilistic ok',
        width: 100,
        fontSize: FONT_SIZE,
        wrapMode,
      });
      add(probe);
      const calls = fillCalls(probe).map(call => [call.text, call.x]);
      expect(calls).toEqual([
        ['aa', -50],
        ['supercalifragilistic', -50],
        ['ok', -50],
      ]);
    }
  });
});
