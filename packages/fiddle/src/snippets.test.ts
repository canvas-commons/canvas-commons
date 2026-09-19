import {describe, expect, it} from 'vitest';
import {parseFiddle} from './snippets';

describe('parseFiddle', () => {
  it('keeps an unmarked source in the default tab', () => {
    expect(parseFiddle('const value = 1;')).toEqual([
      {name: 'Default', lines: ['const value = 1;']},
    ]);
  });

  it('splits named tabs without adding a leading empty tab', () => {
    expect(
      parseFiddle(
        '// snippet First\nconst one = 1;\n// snippet Second\nconst two = 2;',
      ),
    ).toEqual([
      {name: 'First', lines: ['const one = 1;']},
      {name: 'Second', lines: ['const two = 2;']},
    ]);
  });

  it('removes documentation markers and keeps ordinary comments', () => {
    expect(
      parseFiddle(
        '// highlight-start\n// Explain the animation.\nconst value = 1;\n// highlight-end\n// prettier-ignore',
      )[0].lines,
    ).toEqual(['// Explain the animation.', 'const value = 1;']);
  });

  it('preserves marker text inside executable lines', () => {
    const source = [
      'const value = 1; // highlight-next-line',
      'const label = "// snippet Example";',
      'const comment = "// highlight-start example";',
    ];

    expect(parseFiddle(source.join('\n'))).toEqual([
      {name: 'Default', lines: source},
    ]);
  });

  it('recognizes indented standalone markers', () => {
    expect(
      parseFiddle(
        '  // snippet First\n  // highlight-next-line\nconst value = 1;',
      ),
    ).toEqual([{name: 'First', lines: ['const value = 1;']}]);
  });
});
