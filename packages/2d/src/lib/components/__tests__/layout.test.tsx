import {createRef} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {mockScene2D} from './mockScene2D';

describe('Layout (yoga)', () => {
  mockScene2D();

  describe('basic sizing', () => {
    it('should report correct computedSize for explicit dimensions', () => {
      const view = useScene2D().getView();
      const rect = (<Rect layout={true} width={200} height={100} />) as Rect;
      view.add(rect);

      const size = rect.size();
      expect(size.x).toBe(200);
      expect(size.y).toBe(100);
    });

    it('should auto-size to fit children in a row', () => {
      const view = useScene2D().getView();
      const parent = (
        <Layout layout={true}>
          <Rect layout={true} width={100} height={50} />
          <Rect layout={true} width={80} height={50} />
        </Layout>
      ) as Layout;
      view.add(parent);

      const size = parent.size();
      expect(size.x).toBe(180);
      expect(size.y).toBe(50);
    });

    it('should report View2D root size', () => {
      const view = useScene2D().getView();
      const size = view.size();
      expect(size.x).toBe(1920);
      expect(size.y).toBe(1080);
    });
  });

  describe('flex direction', () => {
    it('should position children in a row', () => {
      const view = useScene2D().getView();
      const childA = createRef<Rect>();
      const childB = createRef<Rect>();
      const parent = (
        <Layout layout={true}>
          <Rect ref={childA} layout={true} width={100} height={50} />
          <Rect ref={childB} layout={true} width={100} height={50} />
        </Layout>
      ) as Layout;
      view.add(parent);

      const posA = childA().computedPosition();
      const posB = childB().computedPosition();
      expect(posA.x).toBe(-50);
      expect(posA.y).toBe(0);
      expect(posB.x).toBe(50);
      expect(posB.y).toBe(0);
    });

    it('should position children in a column', () => {
      const view = useScene2D().getView();
      const childA = createRef<Rect>();
      const childB = createRef<Rect>();
      const parent = (
        <Layout layout={true} direction={'column'}>
          <Rect ref={childA} layout={true} width={100} height={50} />
          <Rect ref={childB} layout={true} width={100} height={50} />
        </Layout>
      ) as Layout;
      view.add(parent);

      const posA = childA().computedPosition();
      const posB = childB().computedPosition();
      expect(posA.x).toBe(0);
      expect(posA.y).toBe(-25);
      expect(posB.x).toBe(0);
      expect(posB.y).toBe(25);
    });
  });

  describe('coordinate conversion', () => {
    it('should convert yoga top-left coords to center-origin', () => {
      const view = useScene2D().getView();
      const child = createRef<Rect>();
      const parent = (
        <Layout layout={true} width={400} height={300} alignItems={'start'}>
          <Rect ref={child} layout={true} width={100} height={50} />
        </Layout>
      ) as Layout;
      view.add(parent);

      const pos = child().computedPosition();
      expect(pos.x).toBe(-150);
      expect(pos.y).toBe(-125);
    });

    it('should apply offset to computed position', () => {
      const view = useScene2D().getView();
      const child = createRef<Rect>();
      const parent = (
        <Layout layout={true} width={400} height={300} alignItems={'start'}>
          <Rect
            ref={child}
            layout={true}
            width={100}
            height={50}
            offset={[-1, -1]}
          />
        </Layout>
      ) as Layout;
      view.add(parent);

      const pos = child().computedPosition();
      expect(pos.x).toBe(-200);
      expect(pos.y).toBe(-150);
    });
  });

  describe('layout root detection', () => {
    it('should treat layout child of View2D as a root', () => {
      const view = useScene2D().getView();
      const node = (<Layout layout={true} />) as Layout;
      view.add(node);

      expect(node.isLayoutRoot()).toBe(true);
    });

    it('should treat nested layout child as non-root', () => {
      const view = useScene2D().getView();
      const child = createRef<Layout>();
      const parent = (
        <Layout layout={true}>
          <Layout ref={child} layout={true} />
        </Layout>
      ) as Layout;
      view.add(parent);

      expect(parent.isLayoutRoot()).toBe(true);
      expect(child().isLayoutRoot()).toBe(false);
    });

    it('should treat node without layout as a root', () => {
      const view = useScene2D().getView();
      const node = (<Layout />) as Layout;
      view.add(node);

      expect(node.isLayoutRoot()).toBe(true);
    });
  });

  describe('layoutSelf vs layoutChildren', () => {
    it('should allow layoutChildren without layoutSelf', () => {
      const view = useScene2D().getView();
      const node = (
        <Layout
          layoutSelf={false}
          layoutChildren={true}
          width={400}
          height={200}
        >
          <Rect layout={true} width={100} height={50} />
        </Layout>
      ) as Layout;
      view.add(node);

      expect(node.layoutSelfEnabled()).toBe(false);
      expect(node.layoutChildrenEnabled()).toBe(true);
      expect(node.isLayoutRoot()).toBe(true);
    });

    it('should inherit layout mode from parent', () => {
      const view = useScene2D().getView();
      const child = createRef<Layout>();
      const parent = (
        <Layout layout={true}>
          <Layout ref={child} />
        </Layout>
      ) as Layout;
      view.add(parent);

      expect(child().layoutSelfEnabled()).toBe(true);
      expect(child().layoutChildrenEnabled()).toBe(true);
    });
  });

  describe('padding and margin', () => {
    it('should offset children by padding', () => {
      const view = useScene2D().getView();
      const child = createRef<Rect>();
      const parent = (
        <Layout
          layout={true}
          width={400}
          height={300}
          padding={20}
          alignItems={'start'}
        >
          <Rect ref={child} layout={true} width={100} height={50} />
        </Layout>
      ) as Layout;
      view.add(parent);

      const pos = child().computedPosition();
      expect(pos.x).toBe(-130);
      expect(pos.y).toBe(-105);
    });

    it('should apply margin to children', () => {
      const view = useScene2D().getView();
      const child = createRef<Rect>();
      const parent = (
        <Layout layout={true} width={400} height={300} alignItems={'start'}>
          <Rect ref={child} layout={true} width={100} height={50} margin={10} />
        </Layout>
      ) as Layout;
      view.add(parent);

      const pos = child().computedPosition();
      expect(pos.x).toBe(-140);
      expect(pos.y).toBe(-115);
    });
  });

  describe('gap', () => {
    it('should apply gap between row children', () => {
      const view = useScene2D().getView();
      const childA = createRef<Rect>();
      const childB = createRef<Rect>();
      const parent = (
        <Layout layout={true} gap={20}>
          <Rect ref={childA} layout={true} width={100} height={50} />
          <Rect ref={childB} layout={true} width={100} height={50} />
        </Layout>
      ) as Layout;
      view.add(parent);

      const parentSize = parent.size();
      expect(parentSize.x).toBe(220);
      expect(parentSize.y).toBe(50);

      const posA = childA().computedPosition();
      const posB = childB().computedPosition();
      expect(posA.x).toBe(-60);
      expect(posB.x).toBe(60);
    });
  });

  describe('flex grow and shrink', () => {
    it('should distribute extra space with flex grow', () => {
      const view = useScene2D().getView();
      const childA = createRef<Rect>();
      const childB = createRef<Rect>();
      const parent = (
        <Layout layout={true} width={400} height={100} direction={'row'}>
          <Rect ref={childA} layout={true} width={100} height={50} grow={1} />
          <Rect ref={childB} layout={true} width={100} height={50} grow={1} />
        </Layout>
      ) as Layout;
      view.add(parent);

      const sizeA = childA().size();
      const sizeB = childB().size();
      expect(sizeA.x).toBe(200);
      expect(sizeB.x).toBe(200);
    });
  });

  describe('justify and align', () => {
    it('should center child with justify-content center', () => {
      const view = useScene2D().getView();
      const child = createRef<Rect>();
      const parent = (
        <Layout
          layout={true}
          width={400}
          height={200}
          justifyContent={'center'}
          alignItems={'start'}
        >
          <Rect ref={child} layout={true} width={100} height={50} />
        </Layout>
      ) as Layout;
      view.add(parent);

      const pos = child().computedPosition();
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(-75);
    });

    it('should center child with align-items center', () => {
      const view = useScene2D().getView();
      const child = createRef<Rect>();
      const parent = (
        <Layout layout={true} width={400} height={200} alignItems={'center'}>
          <Rect ref={child} layout={true} width={100} height={50} />
        </Layout>
      ) as Layout;
      view.add(parent);

      const pos = child().computedPosition();
      expect(pos.x).toBe(-150);
      expect(pos.y).toBe(0);
    });
  });

  describe('percentage sizing', () => {
    it('should resolve percentage width and height', () => {
      const view = useScene2D().getView();
      const child = createRef<Layout>();
      const parent = (
        <Layout layout={true} width={400} height={200}>
          <Layout ref={child} layout={true} width={'50%'} height={'50%'} />
        </Layout>
      ) as Layout;
      view.add(parent);

      const size = child().size();
      expect(size.x).toBe(200);
      expect(size.y).toBe(100);
    });

    it('should resolve percentage width in auto-sized parent', () => {
      const view = useScene2D().getView();
      const child = createRef<Layout>();
      const Sibling = createRef<Layout>();
      const parent = (
        <Layout layout={true} direction={'column'}>
          <Layout ref={Sibling} layout={true} width={300} height={50} />
          <Layout ref={child} layout={true} width={'100%'} height={10} />
        </Layout>
      ) as Layout;
      view.add(parent);

      expect(child().size().x).toBe(300);
    });

    it('should resolve percentage height in auto-sized parent', () => {
      const view = useScene2D().getView();
      const child = createRef<Layout>();
      const Sibling = createRef<Layout>();
      const parent = (
        <Layout layout={true} direction={'row'}>
          <Layout ref={Sibling} layout={true} width={50} height={200} />
          <Layout ref={child} layout={true} width={10} height={'100%'} />
        </Layout>
      ) as Layout;
      view.add(parent);

      expect(child().size().y).toBe(200);
    });
  });
});
