import {describe, expect, it} from 'vitest';
import {Length, TextAlign} from '../../partials/types';
import {clearPretextCache} from '../../text';
import {requestFontLoad} from '../../utils';
import {Txt, TxtProps, TxtWrapMode} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {TextState, mockTextContext} from './mockTextContext';
import type {PaintCall} from './recordingTextContext';
import {add, fontSizeOf} from './sceneFixtures';
import {
  ALIGNS,
  DrawProbe,
  EXCLUSION_SETS,
  TEXTS,
  WRAP_MODES,
  anchoredLeft,
  declaredIn,
  everyThirdHyphenator,
  fillCalls,
  glyphCount,
  hintingFactor,
  seededPicker,
} from './textInvariants';

const TOLERANCE = 1e-6;
const CAP = 24;
/** A child size the root scale almost never lands on a whole pixel. */
const CHILD_SIZE = 13;
const REGULAR_RATIO = 0.5;
const ASCENT_RATIO = 0.8;
const DESCENT_RATIO = 0.25;

/** True while the face steps with its size instead of scaling with it. */
let Hinted = false;
/** True once the narrow face has finished loading and replaces the fallback. */
let Loaded = false;
/** How much narrower the face that loads is than the fallback it replaces. */
const LOADED_RATIO = 0.6;

function faceWidth(text: string, state: TextState): number {
  const size = fontSizeOf(state.font);
  const glyphs = glyphCount(text);
  const spacing = parseFloat(state.letterSpacing) || 0;
  const factor =
    (Hinted ? hintingFactor(size) : 1) * (Loaded ? LOADED_RATIO : 1);
  return glyphs * (size * factor * REGULAR_RATIO + spacing);
}

/** Advance a painted run occupies: spacing follows every glyph, as on canvas. */
function paintedExtent(call: PaintCall): number {
  return faceWidth(call.text, {
    font: call.font,
    letterSpacing: `${call.letterSpacing}px`,
  });
}

/**
 * Report a web font as freshly loaded, which is what clears the measurement
 * caches and bumps the epoch every memo key has to hold.
 */
async function finishFontLoad(): Promise<void> {
  Object.defineProperty(document, 'fonts', {
    value: {
      addEventListener: () => {},
      check: () => false,
      load: () => Promise.resolve([]),
    },
    configurable: true,
  });
  requestFontLoad('400 99px a-face-no-case-asks-for');
  await Promise.resolve();
  await Promise.resolve();
  Reflect.deleteProperty(document, 'fonts');
}

function faceBounds(state: TextState): {ascent: number; descent: number} {
  const size = fontSizeOf(state.font);
  return {ascent: size * ASCENT_RATIO, descent: size * DESCENT_RATIO};
}

type Case = {
  text: string;
  textName: string;
  box: string;
  width: number;
  height: number;
  lineHeight: Length;
  letterSpacing: number;
  align: TextAlign;
  wrapMode: TxtWrapMode;
  exclusions: string;
  hyphenated: boolean;
  fractionalChild: boolean;
};

const BOXES: {name: string; width: number; height: number}[] = [
  {name: 'narrow', width: 80, height: 60},
  {name: 'wide', width: 200, height: 48},
  {name: 'tall', width: 120, height: 120},
];

const LINE_HEIGHTS: Length[] = ['140%', '100%', 30];
const LETTER_SPACINGS = [0, -1.5, 2];

function key(one: Case): string {
  return [
    one.textName,
    one.box,
    one.align,
    one.wrapMode,
    one.exclusions,
    `lh${one.lineHeight}`,
    `ls${one.letterSpacing}`,
    one.hyphenated ? 'hyphen' : 'plain-break',
    one.fractionalChild ? 'child13' : 'plain',
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
    wrapMode: one.wrapMode,
    exclusions: set
      ? declaredIn({width: one.width, height: one.height}, set.at(one.width))
      : [],
    ...(one.hyphenated ? {hyphenate: () => everyThirdHyphenator} : {}),
  };
}

function splitAt(text: string): [string, string] {
  const at = text.indexOf(' ', Math.floor(text.length / 3));
  return at === -1 ? [text, ''] : [text.slice(0, at + 1), text.slice(at + 1)];
}

function childrenOf(one: Case): Txt[] {
  const [first, second] = splitAt(one.text);
  return [
    new Txt({children: first}),
    new Txt({fontSize: CHILD_SIZE, children: second}),
  ];
}

/** The node autoSize picks a size for. */
function fittedNode(one: Case): Txt {
  const props = {...propsFor(one), autoSize: true, fontSize: CAP};
  return one.fractionalChild
    ? new Txt({...props, children: childrenOf(one)})
    : new Txt({...props, text: one.text});
}

/**
 * A probe of the same content with autoSize off, and the one way to move it to
 * a size: every declared size and spacing rides the root, as it does when
 * autoSize scales the tree.
 */
function probeOf(one: Case): {probe: DrawProbe; at: (size: number) => void} {
  const props = {...propsFor(one), autoSize: false};
  if (!one.fractionalChild) {
    const probe = new DrawProbe({...props, text: one.text});
    return {
      probe,
      at: size => {
        probe.fontSize(size);
        probe.letterSpacing((one.letterSpacing * size) / CAP);
      },
    };
  }
  const children = childrenOf(one);
  const probe = new DrawProbe({...props, children});
  return {
    probe,
    at: size => {
      const ratio = size / CAP;
      probe.fontSize(size);
      probe.letterSpacing(one.letterSpacing * ratio);
      children[1].fontSize(CHILD_SIZE * ratio);
    },
  };
}

/**
 * Whether the layout the probe really paints fits its box: the line boxes fit
 * the height, and every call stands inside the free segment of the line it was
 * broken in, so an exclusion hole is judged as the pipeline judges it.
 */
function fitsBox(probe: DrawProbe, one: Case): boolean {
  if (probe.textLines().height > one.height + TOLERANCE) return false;
  const lines = probe.probeLines();
  for (const call of fillCalls(probe)) {
    const line = lines.find(
      each => Math.abs(each.baseline - one.height / 2 - call.y) <= TOLERANCE,
    );
    const free = line?.segment ?? {left: 0, right: one.width};
    const left = anchoredLeft(call);
    const right = Number.isFinite(free.right) ? free.right : one.width;
    if (left < free.left - one.width / 2 - TOLERANCE) return false;
    if (left + paintedExtent(call) > right - one.width / 2 + TOLERANCE) {
      return false;
    }
  }
  return true;
}

/** The largest whole size that really fits, or `0` when none does. */
function largestFittingSize(one: Case): number {
  const {probe, at} = probeOf(one);
  add(probe);
  for (let size = CAP; size >= 1; size--) {
    at(size);
    if (fitsBox(probe, one)) return size;
  }
  return 0;
}

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
      lineHeight: pick(LINE_HEIGHTS),
      letterSpacing: pick(LETTER_SPACINGS),
      align: pick(ALIGNS),
      wrapMode: pick(WRAP_MODES),
      exclusions: pick(EXCLUSION_SETS).name,
      hyphenated: pick([true, false]),
      fractionalChild: pick([true, false]),
    });
  }
  return cases;
}

function required(partial: Partial<Case>): Case {
  return {
    text: TEXTS[0].text,
    textName: TEXTS[0].name,
    box: BOXES[2].name,
    width: BOXES[2].width,
    height: BOXES[2].height,
    lineHeight: '140%',
    letterSpacing: 0,
    align: 'left',
    wrapMode: 'greedy',
    exclusions: 'none',
    hyphenated: false,
    fractionalChild: false,
    ...partial,
  };
}

const REQUIRED: Case[] = [
  required({}),
  required({fractionalChild: true}),
  required({fractionalChild: true, letterSpacing: 2}),
  required({fractionalChild: true, wrapMode: 'knuth-plass'}),
  required({fractionalChild: true, exclusions: 'middle'}),
  required({fractionalChild: true, lineHeight: 30}),
  required({
    align: 'justify',
    hyphenated: true,
    textName: 'long-word',
    text: TEXTS[1].text,
  }),
  required({exclusions: 'left', wrapMode: 'knuth-plass', letterSpacing: -1.5}),
];

const CASES: Case[] = [...REQUIRED, ...generate(9173, 24)];

type Sweep = {
  /** Every case whose chosen size is not the exhaustive maximum. */
  findings: string[];
  /** Largest number of whole sizes a chosen size stands from that maximum. */
  worstMiss: number;
};

function sweep(stepped: boolean): Sweep {
  Hinted = stepped;
  Loaded = false;
  clearPretextCache();
  const findings: string[] = [];
  let worstMiss = 0;
  for (const one of CASES) {
    const fitted = fittedNode(one);
    add(fitted);
    const chosen = fitted.effectiveFontSize();
    const largest = largestFittingSize(one);
    const wanted = largest === 0 ? 1 : largest;
    worstMiss = Math.max(worstMiss, Math.abs(chosen - wanted));
    if (chosen !== wanted) findings.push(`${key(one)} ${chosen} ${wanted}`);
  }
  return {findings, worstMiss};
}

describe('Txt autoSize with a face that does not scale', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(faceWidth, faceBounds);

  it('steps enough to leave the proportional model, and no more', () => {
    let worst = 0;
    for (let cap = 2; cap <= CAP; cap++) {
      for (let size = 1; size <= cap; size++) {
        const predicted = hintingFactor(cap) * size;
        const real = hintingFactor(size) * size;
        worst = Math.max(worst, Math.abs(predicted - real) / real);
      }
    }
    expect(worst).toBeGreaterThan(0.02);
    expect(worst).toBeLessThan(0.06);
  });

  it('picks the size it picks for a face that does scale', () => {
    const proportional = sweep(false);
    const stepped = sweep(true);

    expect(stepped.findings).toEqual(proportional.findings);
    expect(stepped.worstMiss).toBe(0);
  }, 120000);

  it('picks a new size when the face it measured finishes loading', async () => {
    Hinted = false;
    Loaded = false;
    clearPretextCache();
    const props = {
      autoSize: true,
      fontSize: CAP,
      width: 120,
      height: 400,
      textWrap: false as const,
      text: 'pack my box with five dozen jugs',
    };
    const txt = new Txt(props);
    add(txt);
    const fallback = txt.effectiveFontSize();

    Loaded = true;
    await finishFontLoad();
    const fresh = new Txt(props);
    add(fresh);

    expect([
      fallback,
      txt.effectiveFontSize(),
      fresh.effectiveFontSize(),
    ]).toEqual([7, 12, 12]);
  });
});
