import {Vector2, createRef, waitFor} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Txt} from '../Txt';
import {generatorTest} from './generatorTest';
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

    it('should resolve a percent-sized layout root against its parent', () => {
      const view = useScene2D().getView();
      const rect = (<Rect width={'50%'} height={'50%'} />) as Rect;
      view.add(rect);

      const size = rect.size();
      expect(size.x).toBe(960);
      expect(size.y).toBe(540);
    });

    it('should resolve stacked percent-sized layout roots recursively', () => {
      const view = useScene2D().getView();
      const child = createRef<Rect>();
      const parent = (
        <Rect width={'50%'} height={'50%'}>
          <Rect ref={child} width={'50%'} height={'50%'} />
        </Rect>
      ) as Rect;
      view.add(parent);

      expect(child().size.x()).toBe(480);
      expect(child().size.y()).toBe(270);
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

    it('should apply anchor to computed position', () => {
      const view = useScene2D().getView();
      const child = createRef<Rect>();
      const parent = (
        <Layout layout={true} width={400} height={300} alignItems={'start'}>
          <Rect
            ref={child}
            layout={true}
            width={100}
            height={50}
            anchor={[-1, -1]}
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

    it('should treat child of a non-flex-hosting parent as a root', () => {
      const view = useScene2D().getView();
      const inline = (<Rect width={32} height={32} />) as Rect;
      const wrapper = (
        <Layout layout={true}>
          <Txt fontSize={10}>
            before
            {inline}
            after
          </Txt>
        </Layout>
      ) as Layout;
      view.add(wrapper);

      // Txt never hosts yoga children, so the inline Rect detaches from the
      // yoga tree and self-calculates its declared size.
      expect(inline.isLayoutRoot()).toBe(true);
      expect(inline.size().x).toBe(32);
      expect(inline.size().y).toBe(32);
    });
  });

  describe('layout inheritance', () => {
    it('Inherits layout=true from parent when unset', () => {
      const view = useScene2D().getView();
      const child = createRef<Layout>();
      const parent = (
        <Layout layout={true}>
          <Layout ref={child} />
        </Layout>
      ) as Layout;
      view.add(parent);

      expect(child().layoutEnabled()).toBe(true);
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

  describe('dispose', () => {
    it('should tolerate disposing a layout tree more than once', () => {
      const view = useScene2D().getView();
      const child = createRef<Rect>();
      const parent = (
        <Layout layout={true}>
          <Rect ref={child} layout={true} width={100} height={50} />
        </Layout>
      ) as Layout;
      view.add(parent);
      parent.size();

      expect(() => {
        child().dispose();
        parent.dispose();
        child().dispose();
        parent.dispose();
      }).not.toThrow();
    });
  });
});

interface LayoutInternals {
  layoutLockCounter(): number;
}

function lockCounter(layout: Layout): number {
  return (layout as unknown as LayoutInternals).layoutLockCounter();
}

describe('Layout', () => {
  mockScene2D();

  describe('translate', () => {
    it('defaults to zero', () => {
      const layout = (<Layout />) as Layout;
      expect(layout.translate().equals(Vector2.zero)).toBe(true);
    });

    it('reads x and y from props', () => {
      const layout = (<Layout translateX={20} translateY={-15} />) as Layout;
      expect(layout.translate().x).toBe(20);
      expect(layout.translate().y).toBe(-15);
    });

    it('reads a compound translate prop', () => {
      const layout = (<Layout translate={[10, 30]} />) as Layout;
      expect(layout.translate().x).toBe(10);
      expect(layout.translate().y).toBe(30);
    });

    it('is independently tweenable from position', () => {
      const layout = (<Layout x={10} translate={[40, 50]} />) as Layout;
      expect(layout.position.x()).toBe(10);
      expect(layout.translate().x).toBe(40);

      layout.translate([0, 0]);
      expect(layout.translate().x).toBe(0);
      expect(layout.position.x()).toBe(10);
    });
  });

  describe('layoutSelf / layoutChildren split', () => {
    it('defaults both to null so the legacy `layout` is the source of truth', () => {
      const layout = (<Layout layout />) as Layout;
      expect(layout.layoutSelf()).toBe(null);
      expect(layout.layoutChildren()).toBe(null);
      expect(layout.layoutEnabled()).toBe(true);
      expect(layout.canLayoutChildren()).toBe(true);
    });

    it('falls back to `layout` when the new signals are null', () => {
      const off = (<Layout layout={false} />) as Layout;
      expect(off.layoutEnabled()).toBe(false);
      expect(off.canLayoutChildren()).toBe(false);

      const on = (<Layout layout />) as Layout;
      expect(on.layoutEnabled()).toBe(true);
      expect(on.canLayoutChildren()).toBe(true);
    });

    it('`layoutSelf` overrides `layout` for the self axis only', () => {
      const layout = (<Layout layout={false} layoutSelf />) as Layout;
      expect(layout.layoutEnabled()).toBe(true);
      expect(layout.canLayoutChildren()).toBe(false);
    });

    it('`layoutChildren` overrides `layout` for the children axis only', () => {
      const layout = (<Layout layout layoutChildren={false} />) as Layout;
      expect(layout.layoutEnabled()).toBe(true);
      expect(layout.canLayoutChildren()).toBe(false);
    });

    it('a parent with `layoutChildren=false` stops a layoutSelf=true child from being laid out', () => {
      const view = useScene2D().getView();
      const parent = createRef<Layout>();
      const child = createRef<Layout>();
      view.add(
        <Layout ref={parent} layout layoutChildren={false}>
          <Layout ref={child} layoutSelf />
        </Layout>,
      );

      expect(parent().canLayoutChildren()).toBe(false);
      expect(child().layoutEnabled()).toBe(true);
      expect(child().isLayoutRoot()).toBe(true);
    });
  });

  describe('layout lock', () => {
    it('lockLayout increments and releaseLayout decrements the counter', () => {
      const layout = (<Layout />) as Layout;
      expect(lockCounter(layout)).toBe(0);

      layout.lockLayout();
      expect(lockCounter(layout)).toBe(1);
      layout.lockLayout();
      expect(lockCounter(layout)).toBe(2);

      layout.releaseLayout();
      expect(lockCounter(layout)).toBe(1);
      layout.releaseLayout();
      expect(lockCounter(layout)).toBe(0);
    });

    it(
      'padding tween acquires the layout lock for its full duration',
      generatorTest(function* () {
        const layout = (<Layout padding={0} />) as Layout;
        expect(lockCounter(layout)).toBe(0);

        const task = yield layout.padding(20, 1);

        yield* waitFor(0.5);
        expect(lockCounter(layout)).toBeGreaterThan(0);

        yield* task;
        expect(lockCounter(layout)).toBe(0);
      }),
    );

    it(
      'margin tween acquires the layout lock for its full duration',
      generatorTest(function* () {
        const layout = (<Layout margin={0} />) as Layout;
        const task = yield layout.margin(20, 1);

        yield* waitFor(0.5);
        expect(lockCounter(layout)).toBeGreaterThan(0);

        yield* task;
        expect(lockCounter(layout)).toBe(0);
      }),
    );

    it(
      'gap tween acquires the layout lock for its full duration',
      generatorTest(function* () {
        const layout = (<Layout gap={0} />) as Layout;
        const task = yield layout.gap(20, 1);

        yield* waitFor(0.5);
        expect(lockCounter(layout)).toBeGreaterThan(0);

        yield* task;
        expect(lockCounter(layout)).toBe(0);
      }),
    );

    it(
      'concurrent size + padding tweens compose their locks',
      generatorTest(function* () {
        const layout = (<Layout size={100} padding={0} />) as Layout;
        const task = yield layout.padding(20, 1);
        const sizeTask = yield layout.size(200, 0.5);

        yield* waitFor(0.25);
        expect(lockCounter(layout)).toBeGreaterThanOrEqual(2);

        yield* sizeTask;
        expect(lockCounter(layout)).toBeGreaterThan(0);

        yield* task;
        expect(lockCounter(layout)).toBe(0);
      }),
    );
  });

  describe('animated insert', () => {
    it(
      "doesn't mutate the user node's scale signal during the tween",
      generatorTest(function* () {
        const stack = createRef<Layout>();
        const view = useScene2D().getView();
        view.add(
          <Layout ref={stack} layout direction="row" gap={20}>
            <Rect width={100} height={100} />
            <Rect width={100} height={100} />
          </Layout>,
        );

        const newItem = (<Rect width={100} height={100} />) as Rect;
        const task = yield stack().insert(newItem, 1, 1);

        // The animation tweens a wrapper's scale, not the user node's.
        yield* waitFor(0.5);
        expect(newItem.scale.x()).toBe(1);
        expect(newItem.scale.y()).toBe(1);

        yield* task;
        expect(newItem.scale.x()).toBe(1);
        expect(newItem.scale.y()).toBe(1);
      }),
    );

    it(
      'inserts the node at the requested index after the tween',
      generatorTest(function* () {
        const stack = createRef<Layout>();
        const view = useScene2D().getView();
        view.add(
          <Layout ref={stack} layout direction="row" gap={20}>
            <Rect width={100} height={100} />
            <Rect width={100} height={100} />
          </Layout>,
        );

        const newItem = (<Rect width={120} height={80} />) as Rect;
        yield* stack().insert(newItem, 1, 0.5);

        expect(stack().children()[1]).toBe(newItem);
      }),
    );
  });
});
