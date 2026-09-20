import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Node} from '../Node';
import {Txt, TxtProps} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

const SENTENCE = 'aaaa bbbb cccc dddd';
const OVERWIDE = 'short words and supercalifragilisticexpialidocious after';

/** Half the font size per character, so a fit has to re-measure every scale. */
function fontSizeOf(font: string): number {
  return Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
}

function add(node: Node): void {
  useScene2D().getView().add(node);
}

function fitted(props: TxtProps): Txt {
  const txt = (<Txt autoSize height={200} fontSize={40} {...props} />) as Txt;
  add(txt);
  return txt;
}

/** Widest line, measured from the fragments the layout actually reports. */
function widestFragmentEnd(txt: Txt): number {
  let widest = 0;
  for (const line of txt.textLines().lines) {
    for (const fragment of line.fragments) {
      const end =
        fragment.x +
        fragment.text.length * fontSizeOf(fragment.style.font) * 0.5;
      if (end > widest) widest = end;
    }
  }
  return widest;
}

describe('Txt autoSize fit', () => {
  mockScene2D();
  mockTextContext((text, font) => text.length * fontSizeOf(font) * 0.5);

  it('fits the drawn line when textWrap is false', () => {
    const txt = fitted({width: 100, textWrap: false, text: SENTENCE});

    expect(txt.effectiveFontSize()).toBeLessThan(40);
    expect(txt.textLines().lines).toHaveLength(1);
    expect(widestFragmentEnd(txt)).toBeLessThanOrEqual(100);
  });

  it('fits every wrapped line under Knuth-Plass', () => {
    const txt = fitted({
      width: 120,
      textWrap: true,
      wrapMode: 'knuth-plass',
      text: SENTENCE,
    });

    expect(widestFragmentEnd(txt)).toBeLessThanOrEqual(120);
  });

  it('fits an over-wide word through the isolated-word layout', () => {
    const txt = fitted({width: 120, textWrap: true, text: OVERWIDE});

    expect(widestFragmentEnd(txt)).toBeLessThanOrEqual(120);
  });

  it('fits text made of two runs', () => {
    const txt = fitted({
      width: 120,
      textWrap: true,
      children: [new Txt({text: 'aaaa bbbb '}), new Txt({text: 'cccc dddd'})],
    });

    expect(widestFragmentEnd(txt)).toBeLessThanOrEqual(120);
  });

  it('fits text that flows around an exclusion', () => {
    const txt = fitted({
      width: 120,
      textWrap: true,
      text: SENTENCE,
      exclusions: [{kind: 'rect', x: 0, y: 0, width: 40, height: 40}],
    });

    expect(widestFragmentEnd(txt)).toBeLessThanOrEqual(120);
  });

  it('resolves in any read order', () => {
    const props: TxtProps = {width: 100, textWrap: false, text: SENTENCE};
    const first = fitted(props);
    const second = fitted(props);
    const third = fitted(props);

    const size = first.size().x;
    first.effectiveFontSize();
    first.textLines();

    second.textLines();
    second.effectiveFontSize();
    second.size();

    third.effectiveFontSize();
    third.size();
    third.textLines();

    expect(size).toBe(100);
    expect(second.effectiveFontSize()).toBe(first.effectiveFontSize());
    expect(third.effectiveFontSize()).toBe(first.effectiveFontSize());
  });
});

describe('Txt yoga measurement', () => {
  mockScene2D();
  mockTextContext((text, font) => text.length * fontSizeOf(font) * 0.5);

  it('sizes an auto-width Txt to the layout it draws', () => {
    const txt = (<Txt fontSize={20} padding={10} text={'aaaa bbbb'} />) as Txt;
    add(
      <Layout layout direction={'row'} width={400}>
        {txt}
      </Layout>,
    );

    expect(txt.size().x).toBeCloseTo(txt.textLines().width + 20, 5);
  });
});
