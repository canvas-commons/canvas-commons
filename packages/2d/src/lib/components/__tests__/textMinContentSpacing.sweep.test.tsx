import {describe, expect, it} from 'vitest';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Txt} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {add, lineTexts} from './sceneFixtures';
import {fakeFont} from './textInvariants';

const SHY = '\u00ad';

/** Ten-pixel glyphs, with the letter spacing a canvas applies. */
describe('Txt minimum content width under letter spacing', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  const floorOf = (node: Txt): number => {
    add(
      <Layout layout width={300}>
        {node}
        <Rect width={1000} height={20} shrink={0} />
      </Layout>,
    );
    return node.size.x();
  };

  it('floors a hanging space at the ink beside it', () => {
    const txt = new Txt({
      fontSize: 20,
      lineHeight: 20,
      text: 'a     b',
      textWrap: 'pre',
    });
    expect(floorOf(txt)).toBeCloseTo(10);
    expect(lineTexts(txt)).toEqual(['a', 'b']);
  });

  it('keeps the ink of a lone word in its floor', () => {
    const txt = new Txt({
      fontSize: 20,
      lineHeight: 20,
      letterSpacing: -1,
      text: 'abcdef',
    });
    expect(floorOf(txt)).toBeCloseTo(55);
  });

  it('answers with the narrowest width the breaks of a word reach', () => {
    const txt = new Txt({
      fontSize: 20,
      lineHeight: 20,
      children: [
        new Txt({fontSize: 40, letterSpacing: -14, text: 'a'}),
        new Txt({fontSize: 4, letterSpacing: 0, text: SHY}),
        new Txt({fontSize: 16, letterSpacing: -15, text: 'b'}),
        new Txt({fontSize: 20, letterSpacing: 0, text: SHY}),
        new Txt({fontSize: 24, letterSpacing: 3, text: 'c'}),
      ],
    });
    expect(floorOf(txt)).toBeCloseTo(20);
  });

  it('measures a hyphen in the font that paints it', () => {
    const txt = new Txt({
      fontSize: 20,
      lineHeight: 20,
      children: [
        new Txt({fontSize: 20, text: 'abcdef'}),
        new Txt({fontSize: 60, text: SHY}),
        new Txt({fontSize: 20, text: 'ghijkl'}),
      ],
    });
    expect(floorOf(txt)).toBeCloseTo(90);
    expect(lineTexts(txt)).toEqual(['abcdef-', 'ghijkl']);
  });

  it('leaves a hyphen break the word it splits is narrower without', () => {
    const txt = new Txt({
      fontSize: 20,
      lineHeight: 20,
      children: [
        new Txt({fontSize: 20, text: 'ab'}),
        new Txt({fontSize: 60, text: SHY}),
        new Txt({fontSize: 20, text: 'cd'}),
      ],
    });
    expect(floorOf(txt)).toBeCloseTo(40);
    expect(lineTexts(txt)).toEqual(['abcd']);
  });
});
