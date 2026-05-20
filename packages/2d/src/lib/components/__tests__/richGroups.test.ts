import {describe, expect, it} from 'vitest';
import {buildRichGroups} from '../Txt';

const FontA = '16px sans-serif';
const FontB = '16px serif';

describe('buildRichGroups', () => {
  it('keeps a single group when no item contains a newline', () => {
    const groups = buildRichGroups(
      [
        {text: 'hello ', font: FontA},
        {text: 'world', font: FontB},
      ],
      true,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(i => i.text)).toEqual(['hello ', 'world']);
    expect(groups[0].itemMap).toEqual([0, 1]);
  });

  it('splits an item on `\\n` and tracks the original index', () => {
    const groups = buildRichGroups(
      [{text: 'one\ntwo\nthree', font: FontA}],
      true,
    );
    expect(groups.map(g => g.items.map(i => i.text))).toEqual([
      ['one'],
      ['two'],
      ['three'],
    ]);
    for (const group of groups) {
      expect(group.itemMap).toEqual([0]);
    }
  });

  it('splits across items, keeping non-newline items in the active group', () => {
    const groups = buildRichGroups(
      [
        {text: 'a ', font: FontA},
        {text: 'b\nc ', font: FontB},
        {text: 'd', font: FontA},
      ],
      true,
    );
    expect(groups.map(g => g.items.map(i => i.text))).toEqual([
      ['a ', 'b'],
      ['c ', 'd'],
    ]);
    expect(groups[0].itemMap).toEqual([0, 1]);
    expect(groups[1].itemMap).toEqual([1, 2]);
  });

  it('preserves a blank line between adjacent newlines', () => {
    const groups = buildRichGroups([{text: 'a\n\nb', font: FontA}], true);
    expect(groups.map(g => g.items.map(i => i.text))).toEqual([
      ['a'],
      [],
      ['b'],
    ]);
  });

  it('preserves a leading blank line for `\\nfoo`', () => {
    const groups = buildRichGroups([{text: '\nfoo', font: FontA}], true);
    expect(groups.map(g => g.items.map(i => i.text))).toEqual([[], ['foo']]);
  });

  it('preserves a trailing blank line for `foo\\n`', () => {
    const groups = buildRichGroups([{text: 'foo\n', font: FontA}], true);
    expect(groups.map(g => g.items.map(i => i.text))).toEqual([['foo'], []]);
  });

  it('does not split when wrap === false', () => {
    const groups = buildRichGroups(
      [
        {text: 'a\nb', font: FontA},
        {text: 'c', font: FontB},
      ],
      false,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(i => i.text)).toEqual(['a\nb', 'c']);
  });

  it('splits when wrap === "pre"', () => {
    const groups = buildRichGroups([{text: 'a\nb', font: FontA}], 'pre');
    expect(groups).toHaveLength(2);
  });
});
