import {linear, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {knuthPlass, SOFT_HYPHEN} from '../../text/knuthPlass';
import {Txt} from '../Txt';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

function fakePrepared(segments: string[], widths: number[]) {
  // The Knuth-Plass implementation reads only `.segments` and `.widths`. We
  // can fabricate a stand-in directly without bouncing through pretext, which
  // needs a real canvas context.
  return {segments, widths} as unknown as Parameters<typeof knuthPlass>[0];
}

describe('knuthPlass', () => {
  it('returns one line for short text that fits', () => {
    const prepared = fakePrepared(['hello', ' ', 'world'], [50, 4, 50]);
    const lines = knuthPlass(prepared, 200, {
      normalSpaceWidth: 4,
      hyphenWidth: 3,
      justified: true,
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].text.trim()).toBe('hello world');
    expect(lines[0].isLast).toBe(true);
  });

  it('fits a line whose width matches the box within float noise', () => {
    const prepared = fakePrepared(['a', ' ', 'b'], [0.1, 0.1, 0.1]);
    expect(0.1 + 0.1 + 0.1).toBeGreaterThan(0.3);

    for (const justified of [true, false]) {
      const lines = knuthPlass(prepared, 0.3, {
        normalSpaceWidth: 0.1,
        hyphenWidth: 0.1,
        justified,
      });
      expect(lines.map(line => line.text)).toEqual(['a b']);
    }
  });

  it('breaks at space boundaries when text overflows', () => {
    const prepared = fakePrepared(
      [
        'the',
        ' ',
        'quick',
        ' ',
        'brown',
        ' ',
        'fox',
        ' ',
        'jumps',
        ' ',
        'over',
      ],
      [30, 4, 50, 4, 50, 4, 30, 4, 50, 4, 40],
    );
    const lines = knuthPlass(prepared, 100, {
      normalSpaceWidth: 4,
      hyphenWidth: 3,
      justified: true,
    });

    expect(lines.length).toBeGreaterThan(1);
    const joined = lines.map(l => l.text).join(' ');
    expect(joined).toContain('the');
    expect(joined).toContain('over');
    expect(lines[lines.length - 1].isLast).toBe(true);
  });

  it('produces a soft-hyphen mark when breaking at a soft hyphen', () => {
    // 'un­break tail' — the full word 'un­break' (45 wide) does not fit
    // in maxWidth 30, but its soft-hyphen prefix 'un' (20) does. KP should
    // pick the hyphenated break.
    const prepared = fakePrepared(
      ['un', '­', 'break', ' ', 'tail'],
      [20, 0, 25, 4, 30],
    );
    const lines = knuthPlass(prepared, 30, {
      normalSpaceWidth: 4,
      hyphenWidth: 3,
      justified: true,
    });

    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0].text.endsWith('-')).toBe(true);
  });

  it('treats manual newlines as mandatory breaks', () => {
    const prepared = fakePrepared(
      ['aa', '\n', 'bb', ' ', 'cc'],
      [20, 0, 20, 4, 20],
    );
    const lines = knuthPlass(prepared, 200, {
      normalSpaceWidth: 4,
      hyphenWidth: 3,
      justified: true,
    });

    expect(lines.map(l => l.text)).toEqual(['aa', 'bb cc']);
    expect(lines[0].endSegmentIndex).toBe(2);
    expect(lines[0].isLast).toBe(false);
    expect(lines[1].isLast).toBe(true);
  });

  it('emits a blank line for consecutive newlines', () => {
    const prepared = fakePrepared(['aa', '\n', '\n', 'bb'], [20, 0, 0, 20]);
    const lines = knuthPlass(prepared, 200, {
      normalSpaceWidth: 4,
      hyphenWidth: 3,
      justified: true,
    });

    expect(lines.map(l => l.text)).toEqual(['aa', '', 'bb']);
  });

  it('folds a trailing newline into the final line', () => {
    const prepared = fakePrepared(['aa', '\n'], [20, 0]);
    const lines = knuthPlass(prepared, 200, {
      normalSpaceWidth: 4,
      hyphenWidth: 3,
      justified: true,
    });

    expect(lines.map(l => l.text)).toEqual(['aa']);
    expect(lines[0].isLast).toBe(true);
    expect(lines[0].endSegmentIndex).toBe(2);
  });

  it('handles empty input', () => {
    const lines = knuthPlass(fakePrepared([], []), 100, {
      normalSpaceWidth: 4,
      hyphenWidth: 3,
      justified: true,
    });
    expect(lines).toEqual([]);
  });
});

describe('knuthPlass overflow ranking', () => {
  it.each([true, false])(
    'splits into two lines instead of one huge-badness line (justified=%s)',
    justified => {
      const prepared = fakePrepared(['A', ' ', 'B'], [6000, 1, 6000]);
      const lines = knuthPlass(prepared, 10000, {
        normalSpaceWidth: 1,
        hyphenWidth: 1,
        justified,
      });

      expect(lines.map(l => l.text)).toEqual(['A', 'B']);
    },
  );

  it('keeps a wide span in play when its only inner break is a soft hyphen', () => {
    const prepared = fakePrepared(
      ['p', SOFT_HYPHEN, 'G', ' ', 't'],
      [1, 0, 6, 1, 2],
    );
    const lines = knuthPlass(prepared, 2, {
      normalSpaceWidth: 1,
      hyphenWidth: 5,
      justified: false,
    });

    // Breaking at the soft hyphen costs the hyphen's width on top of `G`.
    expect(lines.map(line => line.text.trimEnd())).toEqual(['pG', 't']);
  });

  it.each([true, false])(
    'isolates an over-wide word instead of collapsing the paragraph (justified=%s)',
    justified => {
      const prepared = fakePrepared(
        ['a', ' ', 'L', ' ', 'b'],
        [1, 1, 12, 1, 1],
      );
      const lines = knuthPlass(prepared, 10, {
        normalSpaceWidth: 1,
        hyphenWidth: 1,
        justified,
      });

      expect(lines.map(l => l.text)).toEqual(['a', 'L', 'b']);
    },
  );

  it.each([true, false])(
    'stops absorbing tokens once an interior candidate overflows (justified=%s)',
    justified => {
      const prepared = fakePrepared(['word', ' ', 'tail'], [250, 1, 10]);
      const lines = knuthPlass(prepared, 100, {
        normalSpaceWidth: 1,
        hyphenWidth: 1,
        justified,
      });

      expect(lines.map(l => l.text)).toEqual(['word', 'tail']);
    },
  );
});

class JustifyProbe extends Txt {
  public probeLines() {
    return this.positionedLines();
  }
}

describe('Txt knuth-plass justify', () => {
  mockScene2D();
  mockTextContext();

  it('compresses spaces on lines Knuth-Plass planned overfull', () => {
    const txt = new JustifyProbe({
      width: 100,
      textWrap: true,
      wrapMode: 'knuth-plass',
      textAlign: 'justify',
      text: 'aa bb cc dd ee ff gg hh',
    });

    // KP picks 'aa bb cc dd' (natural 110 > 100) over the badly stretched
    // three-word split; justify must squeeze its three spaces to fit.
    const lines = txt.probeLines();
    expect(lines[0].fragments[0].words).not.toBeNull();
    expect(lines[0].extraPerSpace).toBeCloseTo(-10 / 3);
  });

  it(
    'justifies the typing line with its final spacing mid-tween',
    generatorTest(function* () {
      const txt = new JustifyProbe({
        width: 100,
        textWrap: true,
        wrapMode: 'knuth-plass',
        textAlign: 'justify',
        text: '',
      });

      yield txt.text('aa bb cc dd ee ff gg hh', 2, linear);
      yield* waitFor(0.9);

      // Only 'aa bb cc d' is typed, but the line already uses the finished
      // line's compressed spacing, so it can never overflow the block.
      const lines = txt.probeLines();
      expect(lines).toHaveLength(1);
      expect(lines[0].fragments[0].words).not.toBeNull();
      expect(lines[0].extraPerSpace).toBeCloseTo(-10 / 3);
    }),
  );
});

describe('Txt wrapMode + hyphenate', () => {
  mockScene2D();

  it('accepts wrapMode signal', () => {
    const txt = (<Txt wrapMode={'knuth-plass'}>hello</Txt>) as Txt;
    expect(txt.wrapMode()).toBe('knuth-plass');
    txt.wrapMode('greedy');
    expect(txt.wrapMode()).toBe('greedy');
  });

  it('accepts hyphenate function via reactive setter', () => {
    const fn = (word: string): string[] =>
      word.length > 6 ? [word.slice(0, 3), word.slice(3)] : [word];
    const txt = (<Txt hyphenate={() => fn}>hello world</Txt>) as Txt;
    expect(txt.hyphenate()).toBe(fn);
  });
});

const AVATAR_TEXT =
  'Only the Avatar, master of all four elements, could stop them, but when the world needed him most, he vanished.';

function txtLineTexts(txt: Txt): string[] {
  return txt.textLines().lines.map(l => l.fragments.map(f => f.text).join(''));
}

describe('Txt knuth-plass line width', () => {
  mockScene2D();
  mockTextContext();

  it('does not plan a last line wider than the node when justified', () => {
    const txt = (
      <Txt
        width={270}
        textWrap
        wrapMode={'knuth-plass'}
        textAlign={'justify'}
        text={AVATAR_TEXT}
      />
    ) as Txt;

    const lines = txtLineTexts(txt);
    expect(lines).toEqual([
      'Only the Avatar, master of',
      'all four elements, could',
      'stop them, but when the',
      'world needed him most, he',
      'vanished.',
    ]);
    const lastLine = lines[lines.length - 1].trimEnd();
    expect(lastLine.length * 10).toBeLessThanOrEqual(270);
  });

  it('does not plan any line wider than the node when not justified', () => {
    const txt = (
      <Txt
        width={250}
        textWrap
        wrapMode={'knuth-plass'}
        textAlign={'left'}
        text={AVATAR_TEXT}
      />
    ) as Txt;

    const lines = txtLineTexts(txt);
    expect(lines).toEqual([
      'Only the Avatar, master',
      'of all four elements,',
      'could stop them, but when',
      'the world needed him',
      'most, he vanished.',
    ]);
    for (const line of lines) {
      expect(line.trimEnd().length * 10).toBeLessThanOrEqual(250);
    }
  });

  // Every word is at most 12 characters (120px), so each fits alone at the
  // narrowest width below.
  const generatedSentences = [
    'The quick brown fox jumps over the lazy dog.',
    'A small cat sat on a very old mat.',
    'Programmers often argue about naming conventions endlessly.',
    'She sells seashells by the seashore every single summer.',
    'Short words and outstanding long compound words coexist.',
    'The detailed handbook explains complex settings clearly.',
    'Bright red apples fell from the tall autumn trees today.',
    'Studying recursive algorithms requires patience and practice.',
  ];
  const glyphWidth = 10;
  const infeasibleSpaceRatio = 0.4;

  function checkPlannedLines(
    lines: string[],
    width: number,
    align: 'left' | 'justify',
  ): string[] {
    const failures: string[] = [];
    lines.forEach((rawLine, i) => {
      const line = rawLine.trimEnd();
      const isLast = i === lines.length - 1;
      const spaceCount = (line.match(/ /g) ?? []).length;
      // A single unbreakable word wider than the node has nowhere to go.
      if (spaceCount === 0 && line.length * glyphWidth > width) return;

      const naturalWidth = line.length * glyphWidth;
      if (naturalWidth <= width) return;

      if (isLast || align === 'left') {
        failures.push(`"${line}" natural ${naturalWidth} > ${width}`);
        return;
      }

      // Justified non-last line: only feasible while spaces would not
      // shrink below infeasibleSpaceRatio of their normal width.
      const wordWidth = naturalWidth - spaceCount * glyphWidth;
      const justifiedSpace = (width - wordWidth) / spaceCount;
      if (justifiedSpace < glyphWidth * infeasibleSpaceRatio - 1e-6) {
        failures.push(
          `"${line}" natural ${naturalWidth} > ${width}, space ${justifiedSpace}`,
        );
      }
    });
    return failures;
  }

  it('plans lines the renderer can always fit, across widths and sentences', () => {
    const failures: string[] = [];
    for (const sentence of generatedSentences) {
      for (let width = 120; width <= 320; width += 10) {
        for (const align of ['left', 'justify'] as const) {
          const txt = (
            <Txt
              width={width}
              textWrap
              wrapMode={'knuth-plass'}
              textAlign={align}
              text={sentence}
            />
          ) as Txt;
          for (const failure of checkPlannedLines(
            txtLineTexts(txt),
            width,
            align,
          )) {
            failures.push(`[${sentence}] @${width} ${align}: ${failure}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  // One word per sentence is wider than the node at the narrower widths
  // tested below. The single-over-wide-word exemption above already lets
  // that word's own line overflow; this also checks the word lands alone
  // on its line (never merged with a neighbor) and every other line fits.
  const oversizedWordCases = [
    {
      sentence: 'Short words and extraordinarily long compound words coexist.',
      word: 'extraordinarily',
    },
    {
      sentence: 'The comprehensive handbook explains complex settings clearly.',
      word: 'comprehensive',
    },
  ];

  it('isolates an over-wide word without overflowing any other line', () => {
    const failures: string[] = [];
    for (const {sentence, word} of oversizedWordCases) {
      for (let width = 120; width <= 320; width += 10) {
        for (const align of ['left', 'justify'] as const) {
          const txt = (
            <Txt
              width={width}
              textWrap
              wrapMode={'knuth-plass'}
              textAlign={align}
              text={sentence}
            />
          ) as Txt;
          const lines = txtLineTexts(txt).map(l => l.trimEnd());
          for (const failure of checkPlannedLines(lines, width, align)) {
            failures.push(`[${sentence}] @${width} ${align}: ${failure}`);
          }
          if (word.length * glyphWidth > width) {
            const wordLines = lines.filter(line => line === word);
            if (wordLines.length !== 1) {
              failures.push(
                `[${sentence}] @${width} ${align}: "${word}" not alone, lines ${JSON.stringify(lines)}`,
              );
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('re-measures a Knuth-Plass node when textAlign changes', () => {
    const txt = (
      <Txt
        width={100}
        textWrap
        wrapMode={'knuth-plass'}
        textAlign={'justify'}
        text={'aa bb cc dd ee ff gg'}
      />
    ) as Txt;
    useScene2D().getView().add(txt);

    const justifiedLineCount = txt.textLines().lines.length;
    const justifiedHeight = txt.size().y;

    txt.textAlign('left');

    expect(txt.textLines().lines.length).not.toBe(justifiedLineCount);
    expect(txt.size().y).not.toBe(justifiedHeight);
    expect(txt.size().y).toBeCloseTo(
      txt.textLines().lines.length * txt.resolvedLineHeight(),
      0,
    );
  });
});
