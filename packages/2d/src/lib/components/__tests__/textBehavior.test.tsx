import {createSignal, linear, useLogger, waitFor} from '@canvas-commons/core';
import {describe, expect, it, vi} from 'vitest';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Txt} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {add, lineTexts} from './sceneFixtures';
import {
  DrawProbe,
  fakeFont,
  fillCalls,
  inkSpan,
  paintedRuns,
} from './textInvariants';

// The fake font: half its size a regular glyph (10px at 20px, 8px at 16px),
// 0.6 of its size a bold one, and an `AV` pair kerned by a tenth of its size.

/** Every run a node paints, with the left edge of its ink and its baseline. */
function runsOnBaselines(txt: DrawProbe): [string, number, number][] {
  const calls = fillCalls(txt);
  return paintedRuns(txt).map(([text, left], index) => [
    text,
    left,
    Math.round(calls[index].y * 1000) / 1000,
  ]);
}

describe('Txt behavior', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('breaks a CRLF once and drops the spaces beside a line break', () => {
    const probe = new DrawProbe({text: 'one \r\n two', fontSize: 20});
    add(probe);

    expect(lineTexts(probe)).toEqual(['one', 'two']);
    expect(paintedRuns(probe)).toEqual([
      ['one', -15],
      ['two', -15],
    ]);
  });

  it('hangs the space at a soft wrap, so a wrapped node shrinks to its ink', () => {
    const probe = new DrawProbe({
      text: 'aaaa bbbb',
      fontSize: 20,
      maxWidth: 45,
    });
    add(probe);

    expect(lineTexts(probe)).toEqual(['aaaa', 'bbbb']);
    expect(probe.size().x).toBe(40);
  });

  it('puts runs of two sizes on one baseline', () => {
    const probe = new DrawProbe({
      fontSize: 20,
      children: [
        new Txt({text: 'small ', fontSize: 10}),
        new Txt({text: 'BIG', fontSize: 30}),
      ],
    });
    add(probe);

    expect(runsOnBaselines(probe)).toEqual([
      ['small ', -37.5, 8.25],
      ['BIG', -7.5, 8.25],
    ]);
  });

  it('keeps the kerning of a word a colour change cuts', () => {
    const probe = new DrawProbe({
      fontSize: 20,
      children: [new Txt({text: 'A', fill: 'red'}), new Txt({text: 'VB'})],
    });
    add(probe);

    expect(paintedRuns(probe)).toEqual([
      ['A', -14],
      ['VB', -6],
    ]);
    expect(probe.textWords().map(word => [word.text, word.width])).toEqual([
      ['AVB', 28],
    ]);
  });

  it('justifies every line but the one a hard break ends and the last', () => {
    const probe = new DrawProbe({
      text: 'aaa bb cc dd\nee ff',
      fontSize: 20,
      width: 100,
      textAlign: 'justify',
    });
    add(probe);

    expect(paintedRuns(probe)).toEqual([
      ['aaa ', -50],
      ['bb ', -5],
      ['cc', 30],
      ['dd', -50],
      ['ee ff', -50],
    ]);
  });

  it('starts a line wider than its box at its start edge', () => {
    const at = (
      textAlign: 'center' | 'right',
      textDirection: 'ltr' | 'rtl',
    ) => {
      const probe = new DrawProbe({
        text: 'supercalifragilistic',
        fontSize: 20,
        width: 100,
        textAlign,
        textDirection,
      });
      add(probe);
      return paintedRuns(probe);
    };

    expect(at('center', 'ltr')).toEqual([['supercalifragilistic', -50]]);
    expect(at('right', 'ltr')).toEqual([['supercalifragilistic', -50]]);
    expect(at('center', 'rtl')).toEqual([['supercalifragilistic', -150]]);
  });

  it('breaks an over-wide word only under overflowWrap anywhere', () => {
    const at = (overflowWrap: 'normal' | 'anywhere') => {
      const probe = new DrawProbe({
        text: 'supercalifragilistic',
        fontSize: 20,
        width: 100,
        overflowWrap,
      });
      add(probe);
      return lineTexts(probe);
    };

    expect(at('normal')).toEqual(['supercalifragilistic']);
    expect(at('anywhere')).toEqual(['supercalif', 'ragilistic']);
  });

  it('lines text up to the top, middle or bottom of its box', () => {
    const at = (verticalAlign: 'top' | 'middle' | 'bottom') => {
      const probe = new DrawProbe({
        text: 'one',
        fontSize: 20,
        lineHeight: 20,
        width: 100,
        height: 100,
        verticalAlign,
      });
      add(probe);
      return fillCalls(probe).map(call => call.y);
    };

    expect(at('top')).toEqual([-34.5]);
    expect(at('middle')).toEqual([5.5]);
    expect(at('bottom')).toEqual([45.5]);
  });

  it('returns placed lines from positionedLines', () => {
    const probe = new DrawProbe({
      text: 'aaaa bbbb',
      fontSize: 20,
      lineHeight: 20,
      width: 60,
    });
    add(probe);

    expect(
      probe
        .probeLines()
        .map(line => [line.top, line.baseline, line.left, line.segment.right]),
    ).toEqual([
      [0, 15.5, 0, 60],
      [20, 35.5, 0, 60],
    ]);
  });
});

describe('Txt nested span', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  const build = (spanProps = {}) => {
    const span = new Txt({fill: 'red', text: 'bbbb cccc', ...spanProps});
    const root = new DrawProbe({
      fontSize: 20,
      lineHeight: 20,
      width: 100,
      children: ['aaaa ', span, ' dddd'],
    });
    add(root);
    return {root, span};
  };

  it('takes its box from the text it paints in the root paragraph', () => {
    const {root, span} = build();

    expect(lineTexts(root)).toEqual(['aaaa bbbb', 'cccc dddd']);
    expect([span.size().x, span.size().y]).toEqual([90, 40]);
    const box = span.cacheBBox();
    expect([box.y, box.height]).toEqual([-20, 40]);
  });

  it('reads its lines from the root placement', () => {
    const {span} = build();

    expect(
      span
        .textLines()
        .lines.map(line => [
          line.top,
          line.fragments.map(fragment => [fragment.text, fragment.x]),
        ]),
    ).toEqual([
      [0, [['bbbb', 50]]],
      [20, [['cccc', 0]]],
    ]);
  });

  it('warns once that it ignores its sizing props', () => {
    const warn = vi.spyOn(useLogger(), 'warn');
    const {root, span} = build({width: 500, padding: 20});
    span.size();
    span.size();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(lineTexts(root)).toEqual(['aaaa bbbb', 'cccc dddd']);
    warn.mockRestore();
  });
});

describe('Txt in scenes people build', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  const SENTENCE = 'pack my box with five dozen liquor jugs now';

  it(
    'keeps a tweened bold span inside the box and settles as a fresh node',
    generatorTest(function* () {
      const props = {
        fontSize: 16,
        lineHeight: 20,
        maxWidth: 300,
        textAlign: 'center' as const,
        letterSpacing: 2,
      };
      const sentence = 'quick brown fox jumps over the lazy dog';
      const span = new Txt({fontWeight: 700, text: 'quick fox'});
      const node = new DrawProbe({...props, children: ['the ', span]});
      add(node);

      yield span.text(sentence, 1, linear);
      const outside: number[] = [];
      for (let frame = 0; frame < 70; frame++) {
        yield;
        const half = node.size().x / 2;
        for (const call of fillCalls(node)) {
          const ink = inkSpan(call);
          if (ink && (ink.right > half || ink.left < -half)) {
            outside.push(frame);
          }
        }
      }
      const fresh = new DrawProbe({
        ...props,
        children: ['the ', new Txt({fontWeight: 700, text: sentence})],
      });
      add(fresh);

      expect(outside).toEqual([]);
      expect(lineTexts(node)).toEqual([
        'the quick brown fox jumps',
        'over the lazy dog',
      ]);
      expect(paintedRuns(node)).toEqual(paintedRuns(fresh));
    }),
  );

  it(
    'shrink-wraps a flex item to every size a font size tween passes',
    generatorTest(function* () {
      const probe = new DrawProbe({
        fontSize: 16,
        lineHeight: 20,
        textWrap: false,
        text: 'liquor jugs',
      });
      add(
        new Layout({
          layout: true,
          width: 400,
          height: 200,
          children: probe,
        }),
      );

      yield probe.fontSize(40, 0.4, linear);
      const widths: number[] = [];
      for (let frame = 0; frame < 4; frame++) {
        yield* waitFor(0.1);
        widths.push(probe.size().x);
      }
      expect(widths).toEqual([121, 154, 187, 220]);
    }),
  );

  it('aligns wrapped lines to the right at their own line height', () => {
    const probe = new DrawProbe({
      text: SENTENCE,
      fontSize: 16,
      lineHeight: 30,
      width: 200,
      textAlign: 'right',
    });
    add(probe);

    expect(runsOnBaselines(probe)).toEqual([
      ['pack my box with five', -68, -10.6],
      ['dozen liquor jugs now', -68, 19.4],
    ]);
  });

  it('aligns both sides of a hard break to the end edge', () => {
    const at = (textDirection: 'ltr' | 'rtl') => {
      const probe = new DrawProbe({
        text: 'first line here\nsecond line there and more words',
        fontSize: 16,
        lineHeight: 20,
        width: 200,
        textAlign: 'end',
        textDirection,
      });
      add(probe);
      return paintedRuns(probe);
    };

    expect(at('ltr')).toEqual([
      ['first line here', -20],
      ['second line there and', -68],
      ['more words', 20],
    ]);
    expect(at('rtl')).toEqual([
      ['first line here', -100],
      ['second line there and', -100],
      ['more words', -100],
    ]);
  });

  it(
    'settles a tweened colour span inside wrapped text',
    generatorTest(function* () {
      const span = new Txt({fill: 'red', children: 'box'});
      const node = new DrawProbe({
        fontSize: 16,
        lineHeight: 20,
        width: 150,
        textAlign: 'center',
        children: [new Txt({children: 'pack my '}), span],
      });
      add(node);

      yield span.text('box with five dozen liquor jugs', 0.5, linear);
      yield* waitFor(0.6);

      expect(paintedRuns(node)).toEqual([
        ['pack my ', -64],
        ['box with', 0],
        ['five dozen liquor', -68],
        ['jugs', -16],
      ]);
    }),
  );

  it(
    'reveals a centred typewriter text inside its maxWidth',
    generatorTest(function* () {
      const probe = new DrawProbe({
        fontSize: 16,
        lineHeight: 20,
        maxWidth: 200,
        textAlign: 'center',
        text: '',
      });
      add(probe);

      yield probe.text(SENTENCE, 1, linear);
      const frames: [string, number, string[]][] = [];
      for (let frame = 0; frame < 59; frame++) {
        yield;
        if (frame === 10 || frame === 20 || frame === 30) {
          frames.push([probe.text(), probe.size().x, lineTexts(probe)]);
        }
      }
      yield* waitFor(0.2);

      expect(frames).toEqual([
        ['pack my box with', 62, ['pack my', 'box', 'with']],
        [
          'pack my box with five dozen li',
          118,
          ['pack my box', 'with five', 'dozen li'],
        ],
        [
          'pack my box with five dozen liquor jugs now',
          168,
          ['pack my box with five', 'dozen liquor jugs now'],
        ],
      ]);
      expect(paintedRuns(probe)).toEqual([
        ['pack my box with five', -84],
        ['dozen liquor jugs now', -84],
      ]);
    }),
  );

  it('wraps a flex item to its percentage width', () => {
    const probe = new DrawProbe({
      fontSize: 16,
      lineHeight: 20,
      width: '60%',
      text: SENTENCE,
    });
    add(new Layout({layout: true, width: 400, height: 200, children: probe}));

    expect(probe.size().x).toBe(240);
    expect(lineTexts(probe)).toEqual([
      'pack my box with five dozen',
      'liquor jugs now',
    ]);
  });

  it('keeps a reactive readout on the right edge of its cell', () => {
    const value = createSignal(3.14159);
    const probe = new DrawProbe({
      fontSize: 16,
      lineHeight: 20,
      width: 80,
      textAlign: 'right',
      text: () => value().toFixed(1),
    });
    add(
      new Layout({
        layout: true,
        width: 400,
        children: [new Rect({width: 100, height: 20}), probe],
      }),
    );

    expect(paintedRuns(probe)).toEqual([['3.1', 16]]);
    value(123.456);
    expect(paintedRuns(probe)).toEqual([['123.5', 0]]);
  });
});
