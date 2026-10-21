import {SimpleSignal, Vector2Signal} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {addPropAliases, initial, signal, vector2Signal} from '../../decorators';
import {Rect, RectProps} from '../Rect';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

interface AliasedProps extends RectProps {
  tilt?: number;
  pivotX?: number;
}

class AliasedRect extends Rect {
  public constructor(props: AliasedProps) {
    super(props);
  }
}
addPropAliases(AliasedRect.prototype, {tilt: 'rotation', pivotX: 'anchorX'});

class OwnTiltRect extends AliasedRect {
  @initial(0)
  @signal()
  declare public readonly tilt: SimpleSignal<number, this>;
}

interface OwnOffsetProps extends RectProps {
  offset?: [number, number];
  offsetX?: number;
  offsetY?: number;
}
class OffsetAliasedRect extends Rect {
  public constructor(props: OwnOffsetProps) {
    super(props);
  }
}
addPropAliases(OffsetAliasedRect.prototype, {
  offset: 'anchor',
  offsetX: 'anchorX',
  offsetY: 'anchorY',
});
class OwnOffsetSubclass extends OffsetAliasedRect {
  @vector2Signal('offset')
  declare public readonly offset: Vector2Signal<this>;
}

describe('prop aliases', () => {
  mockScene2D();

  it('sets the signal that the alias stands for', () => {
    const rect = new AliasedRect({tilt: 30, pivotX: -1});

    expect(rect.rotation()).toBe(30);
    expect(rect.anchor.x()).toBe(-1);
  });

  it('sets the signal when the alias is a JSX prop', () => {
    const rect = <AliasedRect tilt={30} />;

    expect(rect.rotation()).toBe(30);
  });

  it('reads the signal that the alias stands for', () => {
    const rect = new AliasedRect({tilt: 30});

    expect(Reflect.get(rect, 'tilt')).toBe(rect.rotation);
  });

  it('applies the alias in applyState', () => {
    const rect = new AliasedRect({});

    rect.applyState({tilt: 30});

    expect(rect.rotation()).toBe(30);
  });

  it(
    'tweens the alias in applyState',
    generatorTest(function* () {
      const rect = new AliasedRect({});

      yield* rect.applyState({tilt: 30}, 1);

      expect(rect.rotation()).toBe(30);
    }),
  );

  it('prefers the prop with the original name', () => {
    const rect = new AliasedRect({tilt: 30, rotation: 10});

    expect(rect.rotation()).toBe(10);
  });

  it('applies to subclasses and not to the parent class', () => {
    class Subclass extends AliasedRect {}

    expect(new Subclass({tilt: 30}).rotation()).toBe(30);
    const props: AliasedProps = {tilt: 30};
    expect(new Rect(props).rotation()).toBe(0);
  });

  it('leaves a signal that has the alias name alone', () => {
    const rect = new OwnTiltRect({tilt: 5, pivotX: 1});

    expect(rect.tilt()).toBe(5);
    expect(rect.rotation()).toBe(0);
    expect(rect.anchor.x()).toBe(1);
  });

  it('keeps the values when cloning', () => {
    const clone = new AliasedRect({tilt: 30, pivotX: -1}).clone();

    expect(clone.rotation()).toBe(30);
    expect(clone.anchor.x()).toBe(-1);
  });

  it('applies explicit overrides when cloning', () => {
    const source = new AliasedRect({tilt: 30, pivotX: -1});

    for (const copy of [
      source.clone({tilt: 10, pivotX: 1}),
      source.snapshotClone({tilt: 10, pivotX: 1}),
      source.reactiveClone({tilt: 10, pivotX: 1}),
    ]) {
      expect(copy.rotation()).toBe(10);
      expect(copy.anchor.x()).toBe(1);
    }
  });

  it('does not change the override object when cloning', () => {
    const overrides: AliasedProps = {tilt: 10};

    new AliasedRect({}).clone(overrides);

    expect(overrides).toEqual({tilt: 10});
  });

  it('leaves the signals of a subclass that declares the compound alone', () => {
    const rect = new OwnOffsetSubclass({offsetX: 3, offsetY: 4});

    expect(rect.offset().toArray()).toEqual([3, 4]);
    expect(rect.anchor().toArray()).toEqual([0, 0]);
  });

  it('keeps own compound signals when cloning', () => {
    const source = new OwnOffsetSubclass({offsetX: 3, offsetY: 4});

    for (const copy of [
      source.clone({offsetX: 5}),
      source.snapshotClone({offsetX: 5}),
      source.reactiveClone({offsetX: 5}),
    ]) {
      expect(copy.offset.x()).toBe(5);
      expect(copy.anchor().toArray()).toEqual([0, 0]);
    }
  });

  it('resolves aliases whatever the order of registration', () => {
    class Parent extends Rect {}
    class Child extends Parent {}
    addPropAliases(Child.prototype, {tilt: 'rotation'});
    addPropAliases(Parent.prototype, {pivotX: 'anchorX'});
    const props: AliasedProps = {tilt: 30, pivotX: -1};

    const child = new Child(props);
    const parent = new Parent(props);

    expect(child.rotation()).toBe(30);
    expect(child.anchor.x()).toBe(-1);
    expect(parent.rotation()).toBe(0);
    expect(parent.anchor.x()).toBe(-1);
  });

  it('lets a subclass override the alias of its parent', () => {
    class Parent extends Rect {}
    class Child extends Parent {}
    addPropAliases(Child.prototype, {tilt: 'scaleX'});
    addPropAliases(Parent.prototype, {tilt: 'rotation'});
    const props: AliasedProps = {tilt: 2};

    expect(new Child(props).scale.x()).toBe(2);
    expect(new Parent(props).rotation()).toBe(2);
  });
});
