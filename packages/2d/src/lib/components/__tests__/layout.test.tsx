import {Vector2, createRef} from '@canvas-commons/core';
import 'geometry-polyfill';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

describe('Layout', () => {
  mockScene2D();

  describe('translate', () => {
    it('Defaults to Vector2.zero', () => {
      const view = useScene2D().getView();
      const layout = createRef<Layout>();

      view.add(<Layout ref={layout} layout />);

      expect(layout().translate()).toEqual(Vector2.zero);
    });

    it('Can be set via props', () => {
      const view = useScene2D().getView();
      const rect = createRef<Rect>();

      view.add(
        <Layout layout>
          <Rect ref={rect} translate={[20, 30]} size={100} />
        </Layout>,
      );

      expect(rect().translate.x()).toBe(20);
      expect(rect().translate.y()).toBe(30);
    });

    it('Affects localToParent matrix', () => {
      const view = useScene2D().getView();
      const rect = createRef<Rect>();

      view.add(<Rect ref={rect} size={100} translate={[50, 0]} />);

      const matrix = rect().localToParent();
      expect(matrix.m41).toBe(50);
    });

    it('Does not affect localToParent when zero', () => {
      const view = useScene2D().getView();
      const rectA = createRef<Rect>();
      const rectB = createRef<Rect>();

      view.add(
        <>
          <Rect ref={rectA} size={100} />
          <Rect ref={rectB} size={100} translate={[0, 0]} />
        </>,
      );

      expect(rectA().localToParent()).toEqual(rectB().localToParent());
    });
  });

  describe('addAnimated', () => {
    it(
      'Adds child to layout',
      generatorTest(function* (view) {
        const layout = createRef<Layout>();
        const child = (<Rect size={100} />) as Rect;

        view.add(<Layout ref={layout} layout />);

        expect(layout().children().length).toBe(0);

        yield* layout().addAnimated(child, 0);

        expect(layout().children().length).toBe(1);
        expect(layout().children()[0]).toBe(child);
      }),
    );

    it(
      'Restores target size after animation',
      generatorTest(function* (view) {
        const layout = createRef<Layout>();
        const child = (<Rect width={200} height={100} />) as Rect;

        view.add(<Layout ref={layout} layout />);

        yield* layout().addAnimated(child, 0);

        expect(child.width.context.getter()).toBe(200);
        expect(child.height.context.getter()).toBe(100);
      }),
    );

    it(
      'Supports custom animate callback',
      generatorTest(function* (view) {
        const layout = createRef<Layout>();
        const child = (<Rect size={100} />) as Rect;
        let callbackInvoked = false;

        view.add(<Layout ref={layout} layout />);

        yield* layout().addAnimated(child, 0, function* () {
          callbackInvoked = true;
        });

        expect(callbackInvoked).toBe(true);
        expect(layout().children().length).toBe(1);
      }),
    );
  });

  describe('insertAnimated', () => {
    it(
      'Inserts child at specific index',
      generatorTest(function* (view) {
        const layout = createRef<Layout>();
        const existing = (<Rect size={50} />) as Rect;
        const inserted = (<Rect size={100} />) as Rect;

        view.add(
          <Layout ref={layout} layout>
            {existing}
          </Layout>,
        );

        yield* layout().insertAnimated(inserted, 0, 0);

        expect(layout().children()[0]).toBe(inserted);
        expect(layout().children()[1]).toBe(existing);
      }),
    );
  });

  describe('removeAnimated', () => {
    it(
      'Removes child from layout',
      generatorTest(function* (view) {
        const layout = createRef<Layout>();
        const child = createRef<Rect>();

        view.add(
          <Layout ref={layout} layout>
            <Rect ref={child} size={100} />
          </Layout>,
        );

        expect(layout().children().length).toBe(1);

        yield* layout().removeAnimated(child(), 0);

        expect(layout().children().length).toBe(0);
        expect(child().parent()).toBe(null);
      }),
    );

    it(
      'Restores original size after removal',
      generatorTest(function* (view) {
        const layout = createRef<Layout>();
        const child = createRef<Rect>();

        view.add(
          <Layout ref={layout} layout>
            <Rect ref={child} width={200} height={100} />
          </Layout>,
        );

        yield* layout().removeAnimated(child(), 0);

        expect(child().width.context.getter()).toBe(200);
        expect(child().height.context.getter()).toBe(100);
      }),
    );

    it(
      'Supports custom animate callback',
      generatorTest(function* (view) {
        const layout = createRef<Layout>();
        const child = createRef<Rect>();
        let callbackInvoked = false;

        view.add(
          <Layout ref={layout} layout>
            <Rect ref={child} size={100} />
          </Layout>,
        );

        yield* layout().removeAnimated(child(), 0, function* () {
          callbackInvoked = true;
        });

        expect(callbackInvoked).toBe(true);
        expect(layout().children().length).toBe(0);
      }),
    );
  });
});
