import {createSignal, endScene, startScene} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Txt} from '../Txt';
import {TxtLeaf} from '../TxtLeaf';
import {mockScene2D} from './mockScene2D';

function leafAt(node: Txt, index: number): TxtLeaf {
  const child = node.childAs(index);
  if (!(child instanceof TxtLeaf)) {
    throw new Error(`child ${index} is not a TxtLeaf`);
  }
  return child;
}

/** Run `body` with no scene on the stack, as an editor control does. */
function outsideScene<T>(body: () => T): T {
  const scene = useScene2D();
  endScene(scene);
  try {
    return body();
  } finally {
    startScene(scene);
  }
}

describe('Txt leaf reuse', () => {
  mockScene2D();

  it('reuses the leaf across changes to a reactive string', () => {
    const scene = useScene2D();
    const score = createSignal(0);
    const node = new Txt({});
    node.children(() => `Score: ${score()}`);

    const leaf = leafAt(node, 0);
    expect(node.text()).toBe('Score: 0');

    const detachedBefore = Array.from(scene.getDetachedNodes()).length;

    score(1);
    expect(node.childAs(0)).toBe(leaf);
    expect(node.text()).toBe('Score: 1');

    score(2);
    expect(node.childAs(0)).toBe(leaf);
    expect(node.text()).toBe('Score: 2');

    score(3);
    expect(node.childAs(0)).toBe(leaf);
    expect(node.text()).toBe('Score: 3');

    expect(Array.from(scene.getDetachedNodes()).length).toBe(detachedBefore);
  });

  it('keeps both string leaves stable around a nested node', () => {
    const a = createSignal('a1');
    const b = createSignal('b1');
    const nested = new Txt({text: 'mid'});
    const node = new Txt({});
    node.children(() => [a(), nested, b()]);

    const leafA = leafAt(node, 0);
    const leafB = leafAt(node, 2);
    expect(node.childAs(1)).toBe(nested);
    expect(leafA.text()).toBe('a1');
    expect(leafB.text()).toBe('b1');

    a('a2');
    b('b2');

    expect(node.childAs(0)).toBe(leafA);
    expect(node.childAs(1)).toBe(nested);
    expect(node.childAs(2)).toBe(leafB);
    expect(leafA.text()).toBe('a2');
    expect(leafB.text()).toBe('b2');
  });

  it('keeps string leaf identity when a nested node toggles away and back', () => {
    const show = createSignal(true);
    const nested = new Txt({text: 'mid'});
    const node = new Txt({});
    node.children(() => (show() ? ['a', nested, 'b'] : ['a', 'b']));

    const leafA = leafAt(node, 0);
    const leafB = leafAt(node, 2);

    show(false);
    expect(node.children().length).toBe(2);
    expect(node.childAs(0)).toBe(leafA);
    expect(node.childAs(1)).toBe(leafB);

    show(true);
    expect(node.children().length).toBe(3);
    expect(node.childAs(0)).toBe(leafA);
    expect(node.childAs(1)).toBe(nested);
    expect(node.childAs(2)).toBe(leafB);
  });

  it('keeps the first leaf identity across shrinking and growing string counts', () => {
    const node = new Txt({});
    node.children(['a', 'b', 'c']);
    const first = leafAt(node, 0);

    node.children(['a']);
    expect(node.children().length).toBe(1);
    expect(node.childAs(0)).toBe(first);

    node.children(['a', 'b']);
    expect(node.children().length).toBe(2);
    expect(node.childAs(0)).toBe(first);
    expect(leafAt(node, 1).text()).toBe('b');
  });

  it('does not re-run reactive children when the leaf text is set', () => {
    const score = createSignal(0);
    let runs = 0;
    const node = new Txt({});
    node.children(() => {
      runs++;
      return `Score: ${score()}`;
    });

    const leaf = leafAt(node, 0);
    score(1);
    expect(node.text()).toBe('Score: 1');
    expect(runs).toBe(2);

    leaf.text('manual');
    expect(node.text()).toBe('manual');
    expect(runs).toBe(2);

    score(2);
    expect(node.text()).toBe('Score: 2');
    expect(node.childAs(0)).toBe(leaf);
  });

  it('does not rewrite a user-supplied TxtLeaf', () => {
    const node = new Txt({});
    const userLeaf = new TxtLeaf({text: 'kept'});
    node.children([userLeaf]);
    expect(node.childAs(0)).toBe(userLeaf);

    node.children(['x']);
    expect(userLeaf.text()).toBe('kept');
    expect(node.childAs(0)).not.toBe(userLeaf);
    expect(leafAt(node, 0).text()).toBe('x');
  });

  it('keeps one leaf across non-reactive children/text calls', () => {
    const node = new Txt({});
    node.children('x');
    const leaf = leafAt(node, 0);

    node.children('y');
    expect(node.childAs(0)).toBe(leaf);

    node.text('z');
    expect(node.childAs(0)).toBe(leaf);
    expect(leaf.text()).toBe('z');
    expect(node.children().length).toBe(1);
  });

  it('keeps the same leaf when switching from static to reactive children', () => {
    const node = new Txt({});
    node.children(['a']);
    const leaf = leafAt(node, 0);

    const value = createSignal('b');
    node.children(() => value());

    expect(node.childAs(0)).toBe(leaf);
    expect(node.text()).toBe('b');

    value('c');
    expect(node.childAs(0)).toBe(leaf);
    expect(node.text()).toBe('c');
  });

  it('does not reuse or rewrite a leaf moved to another Txt', () => {
    const node = new Txt({});
    node.children(['a']);
    const leaf = leafAt(node, 0);

    const other = new Txt({});
    leaf.remove();
    other.children([leaf]);

    node.children(['z']);
    expect(node.childAs(0)).not.toBe(leaf);
    expect(leafAt(node, 0).text()).toBe('z');
    expect(leaf.text()).toBe('a');
    expect(other.childAs(0)).toBe(leaf);
  });

  it('does not reuse a leaf that collides with an explicit child (leaf first)', () => {
    const node = new Txt({});
    node.children(['a']);
    const leaf = leafAt(node, 0);

    node.children([leaf, 'b']);

    expect(node.childAs(0)).toBe(leaf);
    expect(leaf.text()).toBe('a');
    expect(leafAt(node, 1).text()).toBe('b');
    expect(node.childAs(1)).not.toBe(leaf);
    expect(node.text()).toBe('ab');
  });

  it('does not reuse a leaf that collides with an explicit child (leaf second)', () => {
    const node = new Txt({});
    node.children(['a']);
    const leaf = leafAt(node, 0);

    node.children(['b', leaf]);

    expect(node.childAs(1)).toBe(leaf);
    expect(leaf.text()).toBe('a');
    expect(leafAt(node, 0).text()).toBe('b');
    expect(node.childAs(0)).not.toBe(leaf);
    expect(node.text()).toBe('ba');
  });

  it('does not resurrect a leaf removed with remove()', () => {
    const node = new Txt({});
    node.children(['old']);
    const leaf = leafAt(node, 0);

    leaf.remove();
    leaf.text('kept aside');

    node.children(['new']);

    expect(node.childAs(0)).not.toBe(leaf);
    expect(leafAt(node, 0).text()).toBe('new');
    expect(leaf.text()).toBe('kept aside');
    expect(leaf.parent()).toBe(null);
  });

  it('does not resurrect a leaf removed with removeChildren()', () => {
    const node = new Txt({});
    node.children(['old']);
    const leaf = leafAt(node, 0);

    node.removeChildren();
    leaf.text('kept aside');

    node.children(['new']);

    expect(node.childAs(0)).not.toBe(leaf);
    expect(leafAt(node, 0).text()).toBe('new');
    expect(leaf.text()).toBe('kept aside');
  });

  it('does not reuse a disposed leaf', () => {
    const node = new Txt({});
    node.children(['old']);
    const leaf = leafAt(node, 0);

    leaf.dispose();

    node.children(['new']);

    const child = leafAt(node, 0);
    expect(child).not.toBe(leaf);
    child.text('hello');
    expect(child.text()).toBe('hello');
  });

  it('gives a clone its own leaves for reactive children', () => {
    const n = createSignal(0);
    const original = new Txt({});
    original.children(() => `n=${n()}`);
    const clone = original.clone();

    expect(original.text()).toBe('n=0');
    expect(clone.text()).toBe('n=0');

    n(1);
    expect(original.text()).toBe('n=1');
    expect(clone.text()).toBe('n=1');

    const originalLeaf = original.childAs<TxtLeaf>(0);
    const cloneLeaf = clone.childAs<TxtLeaf>(0);
    expect(originalLeaf).not.toBe(cloneLeaf);
  });

  it('clears its children outside a scene', () => {
    const node = new Txt({});
    node.children(['old']);

    outsideScene(() => node.children([]));

    expect(node.children().length).toBe(0);
  });

  it('accepts an existing node outside a scene', () => {
    const node = new Txt({});
    node.children(['old']);
    const other = new Txt({text: 'other'});

    outsideScene(() => node.children([other]));

    expect(node.childAs(0)).toBe(other);
  });
});
