import {describe, expect, it} from 'vitest';
import {Txt, TxtProps} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {add, fontSizeOf} from './sceneFixtures';
import {
  DrawProbe,
  anchoredLeft,
  buildForm,
  fakeFont,
  fillCalls,
  runWidth,
} from './textInvariants';

/** Where the runs a probe paints reach, in Txt-local coordinates. */
function paintedSpan(probe: DrawProbe): {left: number; right: number} {
  const edges = fillCalls(probe).flatMap(call => {
    const left = anchoredLeft(call);
    return [left, left + runWidth(call, call.text)];
  });
  expect(edges).not.toHaveLength(0);
  return {left: Math.min(...edges), right: Math.max(...edges)};
}

function chosen(props: TxtProps): number {
  const txt = new Txt({...props, autoSize: true});
  add(txt);
  return txt.effectiveFontSize();
}

/** One demand of the contract, and what the source answers instead. */
function miss(name: string, got: number, wanted: number): string[] {
  return got === wanted ? [] : [`${name} ${got} ${wanted}`];
}

function splitKernFindings(): string[] {
  const box: TxtProps = {
    fontSize: 40,
    lineHeight: '140%',
    width: 36,
    height: 56,
    textWrap: false,
  };
  const split = buildForm('span-in-kern', 'AV', {...box, autoSize: true});
  add(split);
  return miss('split-kern', split.effectiveFontSize(), 40);
}

function blankSpanFindings(): string[] {
  const visible = new Txt({
    autoSize: true,
    fontSize: 100,
    lineHeight: 20,
    width: 20,
    height: 20,
    textWrap: false,
    children: [
      new Txt({fontSize: 10, text: 'a'}),
      new Txt({fontSize: 100, text: '   '}),
    ],
  });
  add(visible);
  return miss('blank-span', visible.effectiveFontSize(), 100);
}

function tightLeadingFindings(): string[] {
  const box: TxtProps = {
    text: 'a',
    fontSize: 40,
    width: 200,
    height: 40,
    textWrap: false,
  };
  return [
    ...miss('tight-leading-number', chosen({...box, lineHeight: 40}), 40),
    ...miss('tight-leading-percent', chosen({...box, lineHeight: '100%'}), 40),
  ];
}

function roundingStepFindings(): string[] {
  return miss(
    'rounding-step',
    chosen({
      text: 'a',
      fontSize: 40,
      lineHeight: 40,
      width: 20,
      height: 40 - 1e-7,
      textWrap: false,
    }),
    40,
  );
}

/** The painted extent of rtl preserved whitespace must stay in the box. */
function rtlWhitespaceFindings(): string[] {
  const props: TxtProps = {
    text: 'a  ',
    fontSize: 40,
    lineHeight: '140%',
    width: 24,
    height: 60,
    textWrap: 'pre',
    textDirection: 'rtl',
  };
  const size = chosen(props);
  const probe = new DrawProbe({...props, autoSize: false, fontSize: size});
  add(probe);

  const span = paintedSpan(probe);
  const findings: string[] = [];
  if (span.left < -12) findings.push(`rtl-whitespace-left ${span.left} -12`);
  if (span.right > 12) findings.push(`rtl-whitespace-right ${span.right} 12`);
  return findings;
}

const FROZEN_CONTRACT: string[] = [];

const FROZEN_SPACING: string[] = [];

describe('Txt autoSize fit contract', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('fits the extent it paints', () => {
    const found = [
      ...splitKernFindings(),
      ...blankSpanFindings(),
      ...tightLeadingFindings(),
      ...roundingStepFindings(),
      ...rtlWhitespaceFindings(),
    ];
    expect(found).toEqual(FROZEN_CONTRACT);
  });
});

describe('Txt autoSize under letter spacing', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(
    (text, state) =>
      text.length * fontSizeOf(state.font) * 0.5 +
      text.length * parseFloat(state.letterSpacing),
  );

  const base: TxtProps = {
    text: 'a a a a a a a a a a',
    fontSize: 40,
    lineHeight: 50,
    textWrap: false,
    width: 60,
    height: 50,
  };

  it('carries letter spacing into the size it picks', () => {
    const tight = chosen({...base, letterSpacing: -17});
    const bare = chosen({...base, letterSpacing: 0});
    const found = [
      ...miss('negative-spacing', tight, 40),
      ...(bare < 40 ? [] : [`bare-spacing ${bare} under 40`]),
    ];
    expect(found).toEqual(FROZEN_SPACING);
  });
});
