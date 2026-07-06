import {CompoundSignal, DEFAULT, SimpleSignal} from '@canvas-commons/core';
import {beforeEach, describe, expect, test, vi} from 'vitest';
import {compound} from './compound';
import {computed} from './computed';
import {
  getPropertiesOf,
  getPropertyMetaOrCreate,
  initial,
  initializeSignals,
  interpolation,
  parser,
  signal,
} from './signal';

interface OwnerProps {
  integer?: number;
  custom?: number;
}

class Owner {
  @initial(2.2)
  @parser((value: number) => Math.round(value))
  @signal()
  declare public readonly integer: SimpleSignal<number>;

  @initial(0)
  @signal()
  declare public readonly custom: SimpleSignal<number>;
  public getCustom() {
    return 4;
  }
  public setCustom() {
    // do nothing
  }

  public constructor(props: OwnerProps = {}) {
    initializeSignals(this, props);
  }
}

const GetterMock = vi.spyOn(Owner.prototype, 'getCustom');
const SetterMock = vi.spyOn(Owner.prototype, 'setCustom');

describe('signal', () => {
  beforeEach(() => {
    GetterMock.mockClear();
    SetterMock.mockClear();
  });

  test('Has initial value', () => {
    const instance = new Owner();

    expect(instance.integer()).toBe(2);
    expect(instance.integer.isInitial()).toBe(true);
  });

  test('Overrides the value', () => {
    const instance = new Owner({integer: 4});

    expect(instance.integer()).toBe(4);
    expect(instance.integer.isInitial()).toBe(false);
  });

  test('Resets the value to default', () => {
    const instance = new Owner({integer: 4});
    instance.integer(DEFAULT);

    expect(instance.integer()).toBe(2);
    expect(instance.integer.isInitial()).toBe(true);
  });

  test('Parses the value', () => {
    const instance = new Owner();
    instance.integer(2.7);

    expect(instance.integer()).toBe(3);
  });

  test('Uses the custom getter', () => {
    const instance = new Owner();
    const value = instance.custom();

    expect(value).toBe(4);
    expect(GetterMock).toBeCalledTimes(1);
  });

  test('Calls the setter with the initial value', () => {
    new Owner();

    expect(SetterMock).toBeCalledWith(0);
  });

  test('Uses the setter', () => {
    const instance = new Owner({custom: 1});
    instance.custom(2);

    expect(SetterMock).toBeCalledTimes(3);
  });
});

describe('property metadata chain-walk', () => {
  class Base {
    @initial(1)
    @signal()
    declare public readonly length: SimpleSignal<number>;

    public constructor(props: {length?: number} = {}) {
      initializeSignals(this, props);
    }
  }

  class Derived extends Base {}

  test('a property declared on a base class is visible on a subclass', () => {
    const instance = new Derived();

    expect(instance.length()).toBe(1);
  });

  test('a property registered on a base class after a subclass is declared becomes usable on that subclass', () => {
    class LateBase {
      @initial(2)
      @signal()
      declare public readonly width: SimpleSignal<number>;

      public constructor(props: {width?: number} = {}) {
        initializeSignals(this, props);
      }
    }

    class LateDerived extends LateBase {}

    // Warm the subclass caches before the base gains the property.
    expect(Object.keys(getPropertiesOf(LateDerived))).toEqual(['width']);
    expect(new LateDerived({width: 5}).width()).toBe(5);

    signal<number>()(LateBase.prototype, 'height');
    initial(3)(LateBase.prototype, 'height');

    expect(Object.keys(getPropertiesOf(LateDerived))).toEqual([
      'width',
      'height',
    ]);

    const instance = new LateDerived({width: 5}) as LateDerived & {
      height: SimpleSignal<number>;
    };
    expect(instance.height()).toBe(3);
    instance.height(7);
    expect(instance.height()).toBe(7);
  });

  test('a subclass can decorate a property for the same key differently than its base', () => {
    class Wrapper {
      @initial(1)
      @signal()
      declare public readonly value: SimpleSignal<number>;

      public constructor(props: {value?: number} = {}) {
        initializeSignals(this, props);
      }
    }

    class Overridden extends Wrapper {
      @initial(1)
      @interpolation((from: number, to: number, t: number) => from + to + t)
      @signal()
      declare public readonly value: SimpleSignal<number>;

      public constructor(props: {value?: number} = {}) {
        super(props);
      }
    }

    const properties = getPropertiesOf(Overridden);
    expect(properties.value.interpolationFunction!(1, 2, 3)).toBe(6);
  });

  test('a compound signal declared on a base class resolves on a subclass', () => {
    class CompoundOwner {
      @initial({x: 0, y: 0})
      @parser((value: {x: number; y: number}) => value)
      @compound({x: 'scaleX', y: 'scaleY'})
      declare public readonly scale: CompoundSignal<
        {x: number; y: number},
        {x: number; y: number}
      >;

      public constructor() {
        initializeSignals(this, {});
      }
    }

    class CompoundDerived extends CompoundOwner {}

    const properties = getPropertiesOf(CompoundDerived);
    expect(properties.scale.compound).toBe(true);
    expect(properties.scale.compoundEntries).toEqual([
      ['x', 'scaleX'],
      ['y', 'scaleY'],
    ]);

    const instance = new CompoundDerived();
    expect(instance.scale.x()).toBe(0);
    instance.scale({x: 3, y: 4});
    expect(instance.scale.x()).toBe(3);
    expect(instance.scale.y()).toBe(4);
  });

  test('a computed method registered on a base class after a subclass is cached runs on that subclass', () => {
    class ComputedBase {
      @computed()
      public label() {
        return 'base';
      }

      public extra() {
        return 'late';
      }

      public constructor() {
        initializeSignals(this, {});
      }
    }

    class ComputedDerived extends ComputedBase {}

    // Warm the subclass caches before the base gains the computed method.
    expect(new ComputedDerived().label()).toBe('base');

    const descriptor = Object.getOwnPropertyDescriptor(
      ComputedBase.prototype,
      'extra',
    );
    if (!descriptor) {
      throw new Error('expected "extra" to be declared on ComputedBase');
    }
    computed()(ComputedBase.prototype, 'extra', descriptor);

    const instance = new ComputedDerived();
    expect(instance.label()).toBe('base');
    expect(instance.extra()).toBe('late');
  });

  test('getDefault* resolves through a prototype patched after the class declares its signal', () => {
    class Owner {
      @signal()
      declare public readonly amount: SimpleSignal<number>;

      public constructor(props: {amount?: number} = {}) {
        initializeSignals(this, props);
      }
    }

    Object.assign(Owner.prototype, {getDefaultAmount: () => 42});

    const instance = new Owner();
    expect(instance.amount()).toBe(42);
  });

  test('resolution is cached per constructor and only recomputed after metadata changes', () => {
    class Cached extends Base {}

    const first = getPropertiesOf(Cached);
    const second = getPropertiesOf(Cached);
    expect(second).toBe(first);

    getPropertyMetaOrCreate<number>(Cached.prototype, 'extraCached').default =
      5;

    const third = getPropertiesOf(Cached);
    expect(third).not.toBe(first);
    expect(third.extraCached.default).toBe(5);
  });

  test('constructing a thousand instances stays cheap once the chain is cached', () => {
    class Benchmarked extends Base {
      @initial(0)
      @signal()
      declare public readonly a: SimpleSignal<number>;
      @initial(0)
      @signal()
      declare public readonly b: SimpleSignal<number>;
      @initial(0)
      @signal()
      declare public readonly c: SimpleSignal<number>;

      public constructor(props: {length?: number} = {}) {
        super(props);
      }
    }

    // Warm the per-constructor cache.
    new Benchmarked();

    const propertiesBefore = getPropertiesOf(Benchmarked);

    // Counting chain walks instead of timing keeps this machine-independent.
    const getPrototypeOfSpy = vi.spyOn(Object, 'getPrototypeOf');
    for (let i = 0; i < 1000; i++) {
      new Benchmarked();
    }
    const chainWalkCallsPerInstance =
      getPrototypeOfSpy.mock.calls.length / 1000;
    getPrototypeOfSpy.mockRestore();

    expect(getPropertiesOf(Benchmarked)).toBe(propertiesBefore);
    expect(chainWalkCallsPerInstance).toBeLessThan(1);
  });
});
