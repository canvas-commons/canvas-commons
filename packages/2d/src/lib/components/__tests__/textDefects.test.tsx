import {describe, expect, it} from 'vitest';
import {Txt, TxtProps} from '../Txt';
import {referenceVisualIndexes} from './bidiReference';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {add, lineTexts} from './sceneFixtures';
import {
  DrawProbe,
  fakeFont,
  fillCalls,
  inkSpan,
  paintedGlyphs,
  paintedRuns,
  round,
} from './textInvariants';

// The fake font at 20px: 10px a regular glyph, 12px a bold one, and an `AV`
// pair kerned by 2px.

describe('Txt rtl visual order', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('paints a Latin line of an rtl block in reading order', () => {
    const probe = new DrawProbe({
      text: 'Hello world',
      fontSize: 20,
      width: 400,
      textDirection: 'rtl',
    });
    add(probe);

    expect(paintedRuns(probe)).toEqual([['Hello world', 90]]);
  });

  it('orders Latin, Hebrew and numbers of an rtl line as UAX #9 does', () => {
    const text = 'hello \u05e2\u05d5\u05dc\u05dd 12, world!';
    const probe = new DrawProbe({
      text,
      fontSize: 20,
      width: 400,
      textDirection: 'rtl',
    });
    add(probe);

    const runs = paintedRuns(probe);
    expect(runs).toEqual([
      ['hello', 150],
      [' \u05e2\u05d5\u05dc\u05dd ', 90],
      ['12,', 60],
      [' ', 50],
      ['world!', -10],
    ]);
    // Read left to right, the runs follow the order the reference shows
    // their first characters in.
    const shown = referenceVisualIndexes(text, 1);
    const starts = new Map<string, number>();
    let from = 0;
    for (const [run] of runs) {
      starts.set(run, text.indexOf(run, from));
      from = (starts.get(run) ?? 0) + run.length;
    }
    const first = (run: string) => shown[starts.get(run) ?? -1];
    const byX = [...runs].sort((a, b) => a[1] - b[1]).map(([run]) => run);
    const byReference = runs
      .map(([run]) => run)
      .sort((a, b) => first(a) - first(b));
    expect(byX).toEqual(byReference);
  });
});

describe('Txt line end after an over-wide word', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it.each(['greedy', 'knuth-plass'] as const)(
    'opens the next line at its first glyph (%s)',
    wrapMode => {
      const probe = new DrawProbe({
        text: 'aa supercalifragilistic ok',
        fontSize: 20,
        width: 100,
        wrapMode,
      });
      add(probe);

      expect(lineTexts(probe)).toEqual(['aa', 'supercalifragilistic', 'ok']);
      expect(paintedRuns(probe)).toEqual([
        ['aa', -50],
        ['supercalifragilistic', -50],
        ['ok', -50],
      ]);
    },
  );
});

describe('Txt letter spacing at line ends', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('breaks a line whose last glyph inks past the box', () => {
    // `ab cd` advances 45 at -1px spacing, but its last glyph inks to 46.
    const at = (width: number) => {
      const probe = new DrawProbe({
        text: 'ab cd ef',
        fontSize: 20,
        width,
        letterSpacing: -1,
      });
      add(probe);
      return lineTexts(probe);
    };

    expect(at(45)).toEqual(['ab', 'cd', 'ef']);
    expect(at(46)).toEqual(['ab cd', 'ef']);
  });

  it('fits a line by its advance, the spacing after its last glyph included', () => {
    // `aaaa bbbb` inks 106 at 2px spacing and advances 108.
    const at = (width: number) => {
      const probe = new DrawProbe({
        text: 'aaaa bbbb',
        fontSize: 20,
        width,
        letterSpacing: 2,
      });
      add(probe);
      return lineTexts(probe);
    };

    expect(at(107)).toEqual(['aaaa', 'bbbb']);
    expect(at(108)).toEqual(['aaaa bbbb']);
  });

  it('takes a hyphen only where the hyphen inks inside the box', () => {
    const at = (width: number) => {
      const probe = new DrawProbe({
        text: 'ab\u00adcd',
        fontSize: 20,
        width,
        letterSpacing: -1,
      });
      add(probe);
      return paintedRuns(probe);
    };

    // `ab-` advances 27 and inks to 28.
    expect(at(27)).toEqual([
      ['ab', -13.5],
      ['cd', 4.5],
    ]);
    expect(at(28)).toEqual([
      ['ab', -14],
      ['-', 4],
      ['cd', -14],
    ]);
  });

  it('stands a spaced hyphen at the end of the spaced glyphs before it', () => {
    const probe = new DrawProbe({
      text: 'aaa\u00adbbb',
      fontSize: 20,
      width: 48,
      letterSpacing: 2,
    });
    add(probe);

    expect(paintedRuns(probe)).toEqual([
      ['aaa', -24],
      ['-', 12],
      ['bbb', -24],
    ]);
  });
});

describe('Txt consumers and the alignment box', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('aligns a shrink-wrapped node in the box it takes', () => {
    const probe = new DrawProbe({
      text: 'aaaa bbbb cccc dddd eeee',
      fontSize: 20,
      lineHeight: 20,
      maxWidth: 150,
      textAlign: 'center',
    });
    add(probe);

    expect(probe.size().x).toBe(140);
    expect(paintedRuns(probe)).toEqual([
      ['aaaa bbbb cccc', -70],
      ['dddd eeee', -45],
    ]);
  });

  it('reports words and splits where it paints them', () => {
    const probe = new DrawProbe({
      fontSize: 20,
      width: 200,
      textAlign: 'center',
      children: ['pack my ', new Txt({fill: 'red', text: 'box'})],
    });
    add(probe);

    expect(paintedRuns(probe)).toEqual([
      ['pack my ', -55],
      ['box', 25],
    ]);
    const edges = (units: {text: string; x: number; width: number}[]) =>
      units.map(unit => [unit.text, unit.x - unit.width / 2, unit.width]);
    expect(edges(probe.textWords())).toEqual([
      ['pack', -55, 40],
      ['my', -5, 20],
      ['box', 25, 30],
    ]);
    expect(
      probe
        .split('word')
        .map(piece => [piece.text(), piece.position().x, piece.size().x]),
    ).toEqual([
      ['pack', -35, 40],
      ['my', 5, 20],
      ['box', 40, 30],
    ]);
  });
});

describe('Txt autoSize', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  const props: TxtProps = {
    text: 'pack my box with five dozen jugs',
    width: 200,
    height: 60,
    lineHeight: '100%',
  };

  it('takes the largest whole-pixel size whose lines fit the box', () => {
    const fitted = new DrawProbe({...props, fontSize: 40, autoSize: true});
    add(fitted);
    // One pixel larger breaks into three lines, 78px tall.
    const larger = new DrawProbe({...props, fontSize: 26});
    add(larger);

    expect(fitted.effectiveFontSize()).toBe(25);
    expect(lineTexts(fitted)).toEqual(['pack my box with', 'five dozen jugs']);
    expect(fitted.textLines().height).toBe(50);
    expect(lineTexts(larger)).toEqual([
      'pack my box',
      'with five dozen',
      'jugs',
    ]);
    expect(larger.textLines().height).toBe(78);
  });
});

describe('Txt open defect and known limits', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  /**
   * Open defect: the placement aligns a hyphen line by a width that counts
   * the hyphen's negative spacing, which its ink does not give back
   * (`aHyphenLineIsAlignedShortOfItsInk`).
   */
  it.fails('paints a hyphen of negative spacing inside a right edge', () => {
    const probe = new DrawProbe({
      fontSize: 16,
      width: 24,
      letterSpacing: -1,
      textAlign: 'right',
      text: 'ab\u00adcd',
    });
    add(probe);
    const hyphen = fillCalls(probe).find(call => call.text === '-');
    expect(hyphen && inkSpan(hyphen)?.right).toBeLessThanOrEqual(12);
  });

  /**
   * Known limit: a slice a paint seam cuts from one shaping is painted from its
   * own shaping, so painted pens overlap by the kerning the query edges tile
   * (`graphemeEdges`), and a combining mark paints its own letter spacing.
   */
  it('paints each slice of a cut shaping on its own', () => {
    const edges = (children: Txt[], letterSpacing: number) => {
      const probe = new DrawProbe({
        fontSize: 16,
        lineHeight: 20,
        width: 200,
        height: 400,
        letterSpacing,
        children,
      });
      add(probe);
      return {
        painted: fillCalls(probe)
          .flatMap(call => paintedGlyphs(call))
          .slice(0, 2)
          .map(glyph => [glyph.text, round(glyph.left), round(glyph.right)]),
        queried: probe
          .textGlyphs()
          .slice(0, 2)
          .map(unit => [
            unit.text,
            round(unit.x - unit.width / 2),
            round(unit.x + unit.width / 2),
          ]),
      };
    };

    const kerned = [
      new Txt({fill: 'red', children: 'A'}),
      new Txt({children: 'VB\n'}),
      new Txt({fontSize: 24, children: 'X'}),
    ];
    expect(edges(kerned, 0)).toEqual({
      painted: [
        ['A', '-100.00', '-92.00'],
        ['V', '-93.60', '-85.60'],
      ],
      queried: [
        ['A', '-100.00', '-92.00'],
        ['V', '-92.00', '-85.60'],
      ],
    });
    const combining = [
      new Txt({children: 'e'}),
      new Txt({fill: 'red', children: '\u0301B'}),
    ];
    expect(edges(combining, 2)).toEqual({
      painted: [
        ['e\u0301', '-100.00', '-80.00'],
        ['B', '-82.00', '-72.00'],
      ],
      queried: [
        ['e\u0301', '-100.00', '-82.00'],
        ['B', '-82.00', '-72.00'],
      ],
    });
  });

  /**
   * Known limit: `pathSplit: 'grapheme'` paints each grapheme on its own, so
   * the glyphs keep the pens of the kerned line but lose any shaping between
   * them (`pathSplit`).
   */
  it('paints each grapheme along a path alone at the pen of the kerned line', () => {
    const probe = new DrawProbe({
      fontSize: 16,
      textPath: 'M -250 0 L 250 0',
      textAlign: 'center',
      text: 'pack AV box',
    });
    add(probe);
    const pens = fillCalls(probe).map(call => [call.text, round(call.penX)]);
    expect(pens).toEqual([
      ['p', '-43.20'],
      ['a', '-35.20'],
      ['c', '-27.20'],
      ['k', '-19.20'],
      [' ', '-11.20'],
      ['A', '-3.20'],
      ['V', '3.20'],
      [' ', '11.20'],
      ['b', '19.20'],
      ['o', '27.20'],
      ['x', '35.20'],
    ]);
  });
});
