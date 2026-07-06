import {afterEach, describe, expect, test, vi} from 'vitest';
import {Vector2} from '../types';
import {map} from './interpolationFunctions';
import {InterpolatorEntry, interpolators} from './interpolators';

interface Fraction {
  numerator: number;
  denominator: number;
}

function isFraction(value: unknown): value is Fraction {
  return (
    typeof value === 'object' &&
    value !== null &&
    'numerator' in value &&
    'denominator' in value
  );
}

function fractionLerp(from: Fraction, to: Fraction, value: number): Fraction {
  return {
    numerator: map(from.numerator, to.numerator, value),
    denominator: map(from.denominator, to.denominator, value),
  };
}

function testFraction(a: unknown, b: unknown) {
  return isFraction(a) && isFraction(b);
}

describe('interpolators', () => {
  const uninstalls: (() => void)[] = [];
  function register<T>(entry: InterpolatorEntry<T>) {
    const uninstall = interpolators.register(entry);
    uninstalls.push(uninstall);
    return uninstall;
  }

  afterEach(() => {
    while (uninstalls.length > 0) {
      uninstalls.pop()?.();
    }
  });

  test('Finds a matching interpolator', () => {
    register({name: 'test/fraction', test: testFraction, lerp: fractionLerp});

    const from: Fraction = {numerator: 0, denominator: 2};
    const to: Fraction = {numerator: 10, denominator: 4};
    const lerp = interpolators.find<Fraction>(from, to);

    expect(lerp).not.toBeNull();
    expect(lerp?.(from, to, 0.5)).toEqual({numerator: 5, denominator: 3});
    expect(interpolators.find(1, 2)).toBeNull();
  });

  test('Higher priority wins', () => {
    const low = vi.fn(fractionLerp);
    const high = vi.fn(fractionLerp);
    register({name: 'test/low', test: testFraction, lerp: low});
    register({name: 'test/high', test: testFraction, lerp: high, priority: 1});

    const from: Fraction = {numerator: 0, denominator: 2};
    interpolators.find<Fraction>(from, from)?.(from, from, 0.5);

    expect(high).toHaveBeenCalled();
    expect(low).not.toHaveBeenCalled();
  });

  test('Ties are broken by registration order', () => {
    const first = vi.fn(fractionLerp);
    const second = vi.fn(fractionLerp);
    register({name: 'test/first', test: testFraction, lerp: first});
    register({name: 'test/second', test: testFraction, lerp: second});

    const from: Fraction = {numerator: 0, denominator: 2};
    interpolators.find<Fraction>(from, from)?.(from, from, 0.5);

    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  test('Registering a different entry under an existing name throws', () => {
    register({name: 'test/fraction', test: testFraction, lerp: fractionLerp});

    expect(() =>
      interpolators.register({
        name: 'test/fraction',
        test: testFraction,
        lerp: (from: Fraction) => from,
      }),
    ).toThrow('interpolators.register("test/fraction")');
  });

  test('An identical entry stays registered until every registration uninstalls', () => {
    const first = register({
      name: 'test/fraction',
      test: testFraction,
      lerp: fractionLerp,
    });
    const second = register({
      name: 'test/fraction',
      test: testFraction,
      lerp: fractionLerp,
    });

    first();
    expect(interpolators.get('test/fraction')).not.toBeNull();

    second();
    expect(interpolators.get('test/fraction')).toBeNull();
  });

  test('Calling the same uninstall twice releases only one registration', () => {
    const first = register({
      name: 'test/fraction',
      test: testFraction,
      lerp: fractionLerp,
    });
    register({name: 'test/fraction', test: testFraction, lerp: fractionLerp});

    first();
    first();

    expect(interpolators.get('test/fraction')).not.toBeNull();
  });

  test('Uninstalling removes the entry', () => {
    const uninstall = register({
      name: 'test/fraction',
      test: testFraction,
      lerp: fractionLerp,
    });

    const from: Fraction = {numerator: 0, denominator: 2};
    expect(interpolators.find(from, from)).not.toBeNull();

    uninstall();

    expect(interpolators.find(from, from)).toBeNull();
    expect(interpolators.get('test/fraction')).toBeNull();
  });

  test('Retrieves entries by name', () => {
    const entry = {
      name: 'test/fraction',
      test: testFraction,
      lerp: fractionLerp,
    };
    register(entry);

    expect(interpolators.get('test/fraction')?.lerp).toBe(fractionLerp);
    expect(interpolators.get('test/missing')).toBeNull();
  });

  test('Factories stamp produced functions with a descriptor', () => {
    const factory =
      (scale: number) => (from: number, to: number, value: number) =>
        map(from, to, value) * scale;
    const wrapped = interpolators.registerFactory('test/scaledLerp', factory, {
      params: {scale: 'number'},
    });

    const lerp = wrapped(2);

    expect(lerp(0, 10, 0.5)).toBe(10);
    expect(interpolators.describe(lerp)).toEqual({
      id: 'test/scaledLerp',
      params: {scale: 2},
    });
    expect(interpolators.describe(factory(2))).toBeNull();
  });

  test('Registering a different factory under an existing id throws', () => {
    const factory = () => (from: number, to: number, value: number) =>
      map(from, to, value);
    interpolators.registerFactory('test/conflicting', factory, {params: {}});

    expect(() =>
      interpolators.registerFactory(
        'test/conflicting',
        () => (from: number) => from,
        {params: {}},
      ),
    ).toThrow('interpolators.registerFactory("test/conflicting")');
    expect(() =>
      interpolators.registerFactory('test/conflicting', factory, {params: {}}),
    ).not.toThrow();
  });

  test('Non-serializable arguments skip the stamp and warn once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const factory =
      (pick: () => number) => (from: number, to: number, value: number) =>
        map(from, to, value) * pick();
    const wrapped = interpolators.registerFactory('test/pickedLerp', factory, {
      params: {pick: 'function'},
    });

    const first = wrapped(() => 1);
    const second = wrapped(() => 2);

    expect(interpolators.describe(first)).toBeNull();
    expect(interpolators.describe(second)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test('Non-finite numbers are not serializable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const factory =
      (scale: number) => (from: number, to: number, value: number) =>
        map(from, to, value) * scale;
    const wrapped = interpolators.registerFactory('test/finiteLerp', factory, {
      params: {scale: 'number'},
    });

    expect(interpolators.describe(wrapped(NaN))).toBeNull();
    expect(interpolators.describe(wrapped(Infinity))).toBeNull();
    expect(interpolators.describe(wrapped(2))).toEqual({
      id: 'test/finiteLerp',
      params: {scale: 2},
    });
    warn.mockRestore();
  });

  test('Undefined arguments are omitted from the descriptor', () => {
    expect(interpolators.describe(Vector2.createPolarLerp())).toEqual({
      id: 'core/polarLerp',
      params: {},
    });
  });

  test('Vector2.createPolarLerp carries a descriptor', () => {
    const lerp = Vector2.createPolarLerp(true, [120, 40]);

    expect(interpolators.describe(lerp)).toEqual({
      id: 'core/polarLerp',
      params: {counterclockwise: true, center: [120, 40]},
    });
    expect(
      interpolators.describe(Vector2.createPolarLerp(false, new Vector2(1, 2))),
    ).toEqual({
      id: 'core/polarLerp',
      params: {counterclockwise: false, center: {x: 1, y: 2}},
    });

    const from = new Vector2(100, 0);
    const to = new Vector2(-100, 0);
    expect(lerp(from, to, 0.5)).toEqual(
      Vector2.polarLerp(from, to, 0.5, true, new Vector2(120, 40)),
    );
  });
});
