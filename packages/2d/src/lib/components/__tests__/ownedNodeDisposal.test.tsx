import {createRef} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Node} from '../Node';
import {Rect} from '../Rect';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

function detachedNodes(): Set<Node> {
  return new Set(useScene2D().getDetachedNodes());
}

function addedSince(before: Set<Node>): Node[] {
  return [...detachedNodes()].filter(node => !before.has(node));
}

describe('wrapper layouts the library creates', () => {
  mockScene2D();

  it(
    'are freed after an animated insert and remove',
    generatorTest(function* () {
      const stack = createRef<Layout>();
      useScene2D()
        .getView()
        .add(<Layout ref={stack} layout direction="row" gap={20} />);
      const before = detachedNodes();

      const items: Rect[] = [];
      for (let i = 0; i < 5; i++) {
        const item = (<Rect width={100} height={100} />) as Rect;
        items.push(item);
        yield* stack().insert(item, 0, 0.1);
        yield* item.remove(0.1);
      }

      expect(addedSince(before)).toEqual(items);
    }),
  );

  it(
    'are freed after a transition between layouts',
    generatorTest(function* () {
      const from = createRef<Layout>();
      const to = createRef<Layout>();
      const item = createRef<Rect>();
      useScene2D()
        .getView()
        .add(
          <>
            <Layout ref={from} layout direction="row">
              <Rect ref={item} width={100} height={100} />
            </Layout>
            <Layout ref={to} layout direction="row" />
          </>,
        );
      const before = detachedNodes();

      for (let i = 0; i < 5; i++) {
        yield* item().transitionTo(to(), 0.1);
        yield* item().transitionTo(from(), 0.1);
      }

      expect(addedSince(before)).toEqual([]);
    }),
  );
});
