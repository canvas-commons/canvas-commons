import {Color, createRef} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';

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

  it('a Txt with layout={false} still inherits font properties', () => {
    const view = useScene2D().getView();
    view.fontSize(100);
    view.fontFamily('Comic Sans');
    const txt = createRef<Txt>();

    view.add(
      <Txt ref={txt} layout={false}>
        hello
      </Txt>,
    );

    expect(txt().fontSize()).toBe(100);
    expect(txt().fontFamily()).toBe('Comic Sans');
  });

  it('inherits the full set of text properties from the view', () => {
    const view = useScene2D().getView();
    view.fontWeight(800);
    view.fontStyle('italic');
    view.lineHeight(42);
    view.letterSpacing(3);
    view.textAlign('center');
    view.wordBreak('keep-all');
    const txt = createRef<Txt>();

    view.add(<Txt ref={txt}>hello</Txt>);

    expect(txt().fontWeight()).toBe(800);
    expect(txt().fontStyle()).toBe('italic');
    expect(txt().lineHeight()).toBe(42);
    expect(txt().letterSpacing()).toBe(3);
    expect(txt().textAlign()).toBe('center');
    expect(txt().wordBreak()).toBe('keep-all');
  });

  it('defaults textWrap to true', () => {
    const view = useScene2D().getView();
    const txt = createRef<Txt>();

    view.add(<Txt ref={txt}>hello</Txt>);

    expect(view.textWrap()).toBe(true);
    expect(txt().textWrap()).toBe(true);
  });

  it('inherits textWrap set on an ancestor', () => {
    const view = useScene2D().getView();
    view.textWrap('pre');
    const txt = createRef<Txt>();

    view.add(
      <Layout>
        <Txt ref={txt}>hello</Txt>
      </Layout>,
    );

    expect(txt().textWrap()).toBe('pre');
  });

  it('nested Txt inherits fill, stroke, and fontSize from the outer Txt', () => {
    const view = useScene2D().getView();
    const inner = createRef<Txt>();

    view.add(
      <Txt fill={'#ff0000'} stroke={'#00ff00'} fontSize={30}>
        outer <Txt ref={inner}>inner</Txt>
      </Txt>,
    );

    const fill = inner().fill();
    const stroke = inner().stroke();
    expect(fill instanceof Color ? fill.hex() : fill).toBe('#ff0000');
    expect(stroke instanceof Color ? stroke.hex() : stroke).toBe('#00ff00');
    expect(inner().fontSize()).toBe(30);
  });

  it('nested Txt overrides inherited fill with its own', () => {
    const view = useScene2D().getView();
    const inner = createRef<Txt>();

    view.add(
      <Txt fill={'#ff0000'}>
        outer{' '}
        <Txt ref={inner} fill={'#0000ff'}>
          inner
        </Txt>
      </Txt>,
    );

    const fill = inner().fill();
    expect(fill instanceof Color ? fill.hex() : fill).toBe('#0000ff');
  });
});
