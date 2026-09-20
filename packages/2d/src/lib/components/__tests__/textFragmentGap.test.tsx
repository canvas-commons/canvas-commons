import {describe, expect, it} from 'vitest';
import {Txt, TxtProps} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

const CHAR_WIDTH = 10;

/**
 * A per-call overhead makes a whole string measure narrower than the sum of
 * the pieces the layout measured. That drift is what a fragment-gap heuristic
 * based on re-measurement reads as a space between two touching fragments.
 */
describe('Txt fragment gaps', () => {
  mockScene2D();
  mockTextContext(text => text.length * CHAR_WIDTH + 0.3);

  const spans = (): Txt[] => [
    new Txt({text: 'o/o'}),
    new Txt({text: 'ZZ\nlast'}),
  ];

  it('keeps two touching fragments touching on a justified line', () => {
    const base: TxtProps = {
      width: 100,
      fontSize: 10,
      lineHeight: 20,
      textWrap: 'pre',
    };
    const justified = new Txt({
      ...base,
      textAlign: 'justify',
      children: spans(),
    });
    const left = new Txt({...base, textAlign: 'left', children: spans()});

    const onFirstLine = (txt: Txt) =>
      txt.textWords().filter(word => word.lineIndex === 0);
    const justifiedWords = onFirstLine(justified);
    const leftWords = onFirstLine(left);

    expect(justifiedWords.map(word => word.text)).toEqual(['o', 'o', 'ZZ']);
    expect(leftWords.map(word => word.text)).toEqual(['o', 'o', 'ZZ']);
    // The line holds no space, so justify has nothing to stretch.
    for (let i = 0; i < leftWords.length; i++) {
      expect(justifiedWords[i].x).toBeCloseTo(leftWords[i].x, 2);
    }
  });
});
