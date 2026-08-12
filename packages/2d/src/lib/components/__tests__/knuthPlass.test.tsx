import {linear, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {knuthPlass} from '../../text/knuthPlass';
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
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].text.trim()).toBe('hello world');
    expect(lines[0].isLast).toBe(true);
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
    });

    expect(lines.map(l => l.text)).toEqual(['aa', '', 'bb']);
  });

  it('folds a trailing newline into the final line', () => {
    const prepared = fakePrepared(['aa', '\n'], [20, 0]);
    const lines = knuthPlass(prepared, 200, {
      normalSpaceWidth: 4,
      hyphenWidth: 3,
    });

    expect(lines.map(l => l.text)).toEqual(['aa']);
    expect(lines[0].isLast).toBe(true);
    expect(lines[0].endSegmentIndex).toBe(2);
  });

  it('handles empty input', () => {
    const lines = knuthPlass(fakePrepared([], []), 100, {
      normalSpaceWidth: 4,
      hyphenWidth: 3,
    });
    expect(lines).toEqual([]);
  });
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
    expect(lines[0].justified).not.toBeNull();
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
      expect(lines[0].justified).not.toBeNull();
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
