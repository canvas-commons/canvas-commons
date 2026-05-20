import {describe, expect, it} from 'vitest';
import {knuthPlass} from '../../text/knuthPlass';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';

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

  it('handles empty input', () => {
    const lines = knuthPlass(fakePrepared([], []), 100, {
      normalSpaceWidth: 4,
      hyphenWidth: 3,
    });
    expect(lines).toEqual([]);
  });
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
