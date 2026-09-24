import {Vector2, createSignal, threads} from '@canvas-commons/core';
import 'geometry-polyfill';
import {beforeEach, describe, expect, test} from 'vitest';
import {Layout} from '../components/Layout';
import {Rect} from '../components/Rect';
import {mockScene2D} from '../components/__tests__/mockScene2D';
import {useScene2D} from '../scenes';

// mockScene2D centers the view in the 1920x1080 scene, so abs = view + this.
const VIEW_ORIGIN = new Vector2(960, 540);

function expectVector(actual: Vector2, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x);
  expect(actual.y).toBeCloseTo(y);
}

describe('transform signals', () => {
  mockScene2D();

  let parent: Rect;
  let child: Rect;
  let other: Rect;

  beforeEach(() => {
    parent = new Rect({position: [100, 0], rotation: 90, scale: 2});
    child = new Rect({position: [10, 0]});
    other = new Rect({position: [-50, 30], rotation: 30, scale: 4});
    parent.add(child);
    useScene2D().getView().add([parent, other]);
  });

  describe('position', () => {
    test('reads in every space', () => {
      expectVector(child.position.local(), 10, 0);
      expectVector(child.position.view(), 100, 20);
      expectVector(child.position.abs(), 1060, 560);
    });

    test('reads relativeTo as the absolute offset from the other node', () => {
      // The other node's rotation and scale do not apply.
      expectVector(child.position.relativeTo(other)(), 150, -10);
    });

    test('sets through abs, view, and relativeTo', () => {
      child.position.abs([1060, 580]);
      expectVector(child.position(), 20, 0);

      child.position.abs([1040, 540]);
      expectVector(child.position(), 0, 10);

      child.position.view([100, 40]);
      expectVector(child.position(), 20, 0);
      expectVector(child.position.abs(), 1060, 580);

      child.position.relativeTo(other)([0, 0]);
      expectVector(child.position(), 15, 75);
      expectVector(child.position.abs(), 910, 570);
    });

    test('sets through local as plain position', () => {
      child.position.local([30, 40]);
      expectVector(child.position(), 30, 40);

      child.position.local.x(5);
      child.position.local.y(6);
      expectVector(child.position(), 5, 6);
      expectVector(child.position.abs(), 1048, 550);
    });

    test('sets one component in a space and keeps the other', () => {
      expect(child.position.abs.x(1080)).toBe(child);
      expectVector(child.position(), 10, -10);
      expect(child.position.abs.y()).toBeCloseTo(560);

      child.position([10, 0]);
      child.position.view.y(40);
      expectVector(child.position(), 20, 0);

      child.position([10, 0]);
      child.position.relativeTo(other).x(170);
      expectVector(child.position(), 10, -10);
    });

    test('reaches spaces from components in either order', () => {
      child.x.abs(1080);
      expectVector(child.position(), 10, -10);
      expect(child.x.abs()).toBeCloseTo(1080);

      child.position([10, 0]);
      child.y.view(40);
      expectVector(child.position(), 20, 0);

      child.position([10, 0]);
      child.x.relativeTo(other)(170);
      expectVector(child.position(), 10, -10);
    });

    test('follows a reactive value set in another space', () => {
      const target = createSignal(1060);
      child.position.abs.x(() => target());
      target(1080);

      expectVector(child.position(), 10, -10);
    });

    test('tweens to a value in another space', () => {
      Array.from(threads(() => child.position.abs([1060, 580], 1)));
      expectVector(child.position(), 20, 0);

      Array.from(threads(() => child.x.abs(1080, 1)));
      expectVector(child.position.abs(), 1080, 580);
    });

    test('converts through a deep hierarchy', () => {
      let deep = child;
      for (let i = 0; i < 10; i++) {
        const next = new Rect({position: [10, 10]});
        deep.add(next);
        deep = next;
      }
      child.position(0);

      expectVector(deep.position.relativeTo(parent)(), -200, 200);

      deep.position.abs(parent.position.abs());
      expectVector(deep.position(), -90, -90);
    });

    test('treats abs as local for a node without a parent', () => {
      const orphan = new Rect({position: [5, 5]});
      expectVector(orphan.position.abs(), 5, 5);

      orphan.position.abs([7, 8]);
      expectVector(orphan.position(), 7, 8);
    });
  });

  describe('scale', () => {
    test('reads in abs and relativeTo', () => {
      expectVector(child.scale.abs(), 2, 2);
      expectVector(child.scale.relativeTo(other)(), 0.5, 0.5);
    });

    test('sets through abs and relativeTo', () => {
      child.scale.abs([4, 6]);
      expectVector(child.scale(), 2, 3);
      expectVector(child.scale.abs(), 4, 6);

      child.scale.relativeTo(other)([1, 2]);
      expectVector(child.scale(), 2, 4);
    });

    test('sets one component in a space', () => {
      child.scale.abs.y(6);
      expectVector(child.scale(), 1, 3);

      child.scale(1);
      child.scale.y.abs(6);
      expectVector(child.scale(), 1, 3);

      child.scale(1);
      child.scale.relativeTo(other).x(1);
      expectVector(child.scale(), 2, 1);

      child.scale(1);
      child.scale.local.x(3);
      expectVector(child.scale(), 3, 1);
    });
  });

  describe('rotation', () => {
    test('reads in abs and relativeTo', () => {
      expect(child.rotation.abs()).toBeCloseTo(90);
      expect(child.rotation.relativeTo(other)()).toBeCloseTo(60);
    });

    test('sets through abs and relativeTo', () => {
      child.rotation.abs(135);
      expect(child.rotation()).toBeCloseTo(45);
      expect(child.rotation.abs()).toBeCloseTo(135);

      child.rotation.relativeTo(other)(15);
      expect(child.rotation()).toBeCloseTo(-45);
    });

    test('tweens to a value in abs', () => {
      Array.from(threads(() => child.rotation.abs(135, 1)));
      expect(child.rotation()).toBeCloseTo(45);
    });
  });

  test('chains setters across signals', () => {
    const result = child.position.abs
      .x(1080)
      .scale.abs.y(6)
      .rotation.relativeTo(other)(15);

    expect(result).toBe(child);
    expectVector(child.position(), 10, -10);
    expectVector(child.scale(), 1, 3);
    expect(child.rotation()).toBeCloseTo(-45);
  });

  describe('layout origins', () => {
    let nested: Layout;
    let reference: Layout;

    beforeEach(() => {
      const nestedParent = new Layout({size: 200, position: [100, 50]});
      nested = new Layout({size: 100, position: [50, 25]});
      nestedParent.add(nested);
      reference = new Layout({size: 100, position: [-200, 100]});
      useScene2D().getView().add([nestedParent, reference]);
    });

    test('reads origins in local, view, and abs space', () => {
      expectVector(nested.left.local(), 0, 25);
      expectVector(nested.right.local(), 100, 25);
      expectVector(nested.top.local(), 50, -25);
      expectVector(nested.bottom.local(), 50, 75);

      expectVector(nested.right.view(), 200, 75);
      expectVector(nested.right.abs(), 200 + VIEW_ORIGIN.x, 75 + VIEW_ORIGIN.y);
    });

    test('rotates the origin offset with the node', () => {
      nested.rotation(90);

      expectVector(nested.right.local(), 50, 75);
      expectVector(nested.right.view(), 150, 125);
    });

    test('moves the node so the origin lands on the value', () => {
      nested.right.abs([1260, 615]);
      expectVector(nested.position(), 150, 25);

      nested.position([50, 25]);
      nested.rotation(90);
      nested.right.view([300, 75]);
      expectVector(nested.position(), 200, -25);
    });

    test('keeps the node in place when an origin is set to itself', () => {
      nested.rotation(90);

      nested.right.abs(nested.right.abs());
      nested.right.view(nested.right.view());
      nested.bottom.relativeTo(reference)(
        nested.bottom.relativeTo(reference)(),
      );
      expectVector(nested.position(), 50, 25);
    });

    test('sets one component of an origin in a space', () => {
      nested.right.x.abs(1260);
      expectVector(nested.position(), 150, 25);
      expect(nested.right.abs.x()).toBeCloseTo(1260);

      nested.position([50, 25]);
      nested.top.y.view(-40);
      expectVector(nested.position(), 50, -40);
      expect(nested.top.view.y()).toBeCloseTo(-40);

      nested.position([50, 25]);
      nested.bottom.y(80);
      expectVector(nested.position(), 50, 30);
      expect(nested.bottom.y.local()).toBeCloseTo(80);
    });

    test('gets and sets origins relative to another node', () => {
      const relative = nested.left.relativeTo(reference);
      expectVector(relative(), 300, -25);

      relative([10, 20]);
      expectVector(nested.position(), -240, 70);

      relative.x(30);
      expectVector(relative(), 30, 20);

      nested.left.x.relativeTo(reference)(15);
      expectVector(relative(), 15, 20);
    });

    test('tweens origins relative to another node', () => {
      const relative = nested.left.relativeTo(reference);
      Array.from(threads(() => relative([10, 20], 1)));

      expectVector(relative(), 10, 20);
      expectVector(nested.position(), -240, 70);
    });

    test('follows a reactive component value', () => {
      const target = createSignal(1160);
      nested.right.x.abs(() => target());
      target(1260);

      expectVector(nested.position(), 150, 25);
    });
  });
});

describe('view space', () => {
  mockScene2D();

  let parent: Rect;
  let child: Rect;

  beforeEach(() => {
    parent = new Rect({position: [100, 0], rotation: 90, scale: 2});
    child = new Rect({position: [10, 0], rotation: 15, scale: 1.5});
    parent.add(child);
    useScene2D().getView().add(parent);
  });

  function expectSameWorldMatrix(actual: Rect, expected: Rect) {
    const a = actual.localToWorld();
    const b = expected.localToWorld();
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
      expect(a[key]).toBeCloseTo(b[key]);
    }
  }

  /** A node in the view built from the child's view-space values. */
  function copyInView(): Rect {
    const copy = new Rect({
      position: child.position.view(),
      rotation: child.rotation.view(),
      scale: child.scale.view(),
    });
    useScene2D().getView().add(copy);
    return copy;
  }

  test.each([
    ['an untransformed view', () => {}],
    [
      'a rotated and scaled view',
      () => useScene2D().getView().rotation(30).scale(0.5),
    ],
  ])('reads what a view child needs to cover the node, in %s', (_, setup) => {
    setup();
    expectSameWorldMatrix(copyInView(), child);
  });

  test('keeps x and y apart under non-uniform scales', () => {
    useScene2D().getView().scale([0.5, 0.25]);
    parent.rotation(0).scale([2, 3]);
    child.rotation(0).scale([1.5, 0.5]);

    expectSameWorldMatrix(copyInView(), child);
  });

  test('sets through view so the node matches a view child', () => {
    const view = useScene2D().getView();
    view.rotation(30).scale(0.5);
    const target = new Rect({position: [40, -20], rotation: 45, scale: 3});
    view.add(target);

    child.position.view(target.position());
    child.rotation.view(target.rotation());
    child.scale.view(target.scale());

    expectSameWorldMatrix(child, target);
  });
});
