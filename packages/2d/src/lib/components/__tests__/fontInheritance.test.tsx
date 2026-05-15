import {createRef} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes/index.js';
import {Layout} from '../Layout.js';
import {Txt} from '../Txt.js';
import {mockScene2D} from './mockScene2D.js';

describe('font inheritance', () => {
  mockScene2D();

  it('inherits fontSize from the view to a direct Txt child', () => {
    const view = useScene2D().getView();
    view.fontSize(100);
    const txt = createRef<Txt>();

    view.add(<Txt ref={txt}>hello</Txt>);

    expect(txt().fontSize()).toBe(100);
  });

  it('inherits fontFamily from the view to a direct Txt child', () => {
    const view = useScene2D().getView();
    view.fontFamily('Comic Sans');
    const txt = createRef<Txt>();

    view.add(<Txt ref={txt}>hello</Txt>);

    expect(txt().fontFamily()).toBe('Comic Sans');
  });

  it('inherits fontSize through a non-layout Layout wrapper', () => {
    const view = useScene2D().getView();
    view.fontSize(72);
    const txt = createRef<Txt>();

    view.add(
      <Layout>
        <Txt ref={txt}>hello</Txt>
      </Layout>,
    );

    expect(txt().fontSize()).toBe(72);
  });

  it('inherits fontSize through a layout-enabled Layout wrapper', () => {
    const view = useScene2D().getView();
    view.fontSize(64);
    const txt = createRef<Txt>();

    view.add(
      <Layout layout>
        <Txt ref={txt}>hello</Txt>
      </Layout>,
    );

    expect(txt().fontSize()).toBe(64);
  });

  it('explicit fontSize on child overrides inherited value', () => {
    const view = useScene2D().getView();
    view.fontSize(100);
    const txt = createRef<Txt>();

    view.add(
      <Txt ref={txt} fontSize={25}>
        hello
      </Txt>,
    );

    expect(txt().fontSize()).toBe(25);
  });

  it('layout={false} on a Layout disables inheritance and falls back to initial', () => {
    const view = useScene2D().getView();
    view.fontSize(100);
    const layout = createRef<Layout>();

    view.add(<Layout ref={layout} layout={false} />);

    expect(layout().fontSize()).toBe(48);
  });

  it('inherits the full set of text properties from the view', () => {
    const view = useScene2D().getView();
    view.fontWeight(800);
    view.fontStyle('italic');
    view.lineHeight(42);
    view.letterSpacing(3);
    view.textAlign('center');
    view.textWrap(true);
    const txt = createRef<Txt>();

    view.add(<Txt ref={txt}>hello</Txt>);

    expect(txt().fontWeight()).toBe(800);
    expect(txt().fontStyle()).toBe('italic');
    expect(txt().lineHeight()).toBe(42);
    expect(txt().letterSpacing()).toBe(3);
    expect(txt().textAlign()).toBe('center');
    expect(txt().textWrap()).toBe(true);
  });
});
