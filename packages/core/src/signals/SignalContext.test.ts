import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest';
import {PlaybackManager, PlaybackStatus} from '../app';
import {ThreadGenerator, threads} from '../threading';
import {interpolators, map} from '../tweening';
import {endPlayback, startPlayback} from '../utils';
import {createSignal} from './createSignal';

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

describe('SignalContext', () => {
  const playback = new PlaybackManager();
  const status = new PlaybackStatus(playback);
  beforeAll(() => startPlayback(status));
  afterAll(() => endPlayback(status));

  function run(task: Generator) {
    playback.fps = 10;
    playback.frame = 0;
    while (!task.next().done) {
      playback.frame++;
    }
  }

  describe('extend()', () => {
    test('Replaces the getter', () => {
      const signal = createSignal(1);
      const result = signal.context.extend({
        getter: () => signal.context.getter() * 2,
      });

      expect(signal()).toBe(2);
      expect(result).toBe(signal.context);
    });

    test('Replaces the setter', () => {
      const signal = createSignal(0);
      signal.context.extend({
        setter: value =>
          signal.context.setter(
            typeof value === 'number' ? Math.min(value, 10) : value,
          ),
      });

      signal(5);
      expect(signal()).toBe(5);

      signal(15);
      expect(signal()).toBe(10);
    });

    test('Replaces the tweener', () => {
      const signal = createSignal(0);
      const tweener = vi.fn(function* (): ThreadGenerator {
        return;
      });
      signal.context.extend({tweener});

      run(
        threads(function* () {
          yield* signal(10, 1);
        }),
      );

      expect(tweener).toHaveBeenCalledOnce();
      expect(signal()).toBe(10);
    });
  });

  describe('interpolator registry', () => {
    test('Default tweens consult the registry', () => {
      const lerp = vi.fn(fractionLerp);
      const uninstall = interpolators.register({
        name: 'test/fraction',
        test: (a, b) => isFraction(a) && isFraction(b),
        lerp,
      });

      try {
        const signal = createSignal<Fraction>({numerator: 0, denominator: 2});
        run(
          threads(function* () {
            yield* signal({numerator: 10, denominator: 4}, 1);
          }),
        );

        expect(lerp).toHaveBeenCalled();
        expect(signal()).toEqual({numerator: 10, denominator: 4});
      } finally {
        uninstall();
      }
    });

    test('Explicit interpolation functions take precedence', () => {
      const registered = vi.fn(fractionLerp);
      const explicit = vi.fn(fractionLerp);
      const uninstall = interpolators.register({
        name: 'test/fraction',
        test: (a, b) => isFraction(a) && isFraction(b),
        lerp: registered,
      });

      try {
        const signal = createSignal<Fraction>({numerator: 0, denominator: 2});
        run(
          threads(function* () {
            yield* signal(
              {numerator: 10, denominator: 4},
              1,
              undefined,
              explicit,
            );
          }),
        );

        expect(explicit).toHaveBeenCalled();
        expect(registered).not.toHaveBeenCalled();
      } finally {
        uninstall();
      }
    });
  });
});
