import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest';
import {PlaybackManager, PlaybackStatus} from '../app';
import {waitFor} from '../flow';
import {ThreadGenerator, threads} from '../threading';
import {deepLerp} from '../tweening';
import {endPlayback, startPlayback} from '../utils';
import {createSignal} from './createSignal';
import {SignalContext} from './SignalContext';

describe('createSignal()', () => {
  const status = new PlaybackStatus(new PlaybackManager());
  beforeAll(() => startPlayback(status));
  afterAll(() => endPlayback(status));

  test('Works correctly with plain values', () => {
    const signal = createSignal(7);

    expect(signal()).toBe(7);

    signal(3);

    expect(signal()).toBe(3);
  });

  test('Works correctly with computed values', () => {
    const signal = createSignal(() => 7);

    expect(signal()).toBe(7);

    signal(() => 3);

    expect(signal()).toBe(3);
  });

  test('Value is updated when its dependencies change', () => {
    const a = createSignal(1);
    const b = createSignal(true);
    const c = createSignal(2);
    const d = createSignal(() => (b() ? a() : c()));

    expect(d()).toBe(1);

    a(3);

    expect(d()).toBe(3);

    b(false);

    expect(d()).toBe(2);

    c(4);

    expect(d()).toBe(4);
  });

  test('Value is cached and recalculated only when necessary', () => {
    const a = createSignal(1);

    const value = vi.fn(() => a() * 2);
    const c = createSignal(value);

    expect(value.mock.calls.length).toBe(0);

    a(2);

    expect(value.mock.calls.length).toBe(0);

    c();
    c();

    expect(value.mock.calls.length).toBe(1);
  });

  test('A tween ended early by another writer does not set its target', () => {
    class EndedEarly extends SignalContext<number> {
      public override *tweener(): ThreadGenerator {
        this.set(2);
        this.tweening = false;
        yield;
      }
    }
    const signal = new EndedEarly(0, deepLerp).toSignal();

    void [...threads(() => signal(5, 1))];

    expect(signal()).toBe(2);
  });

  test('A tween that ends while a newer tween runs keeps the newer value', () => {
    const signal = createSignal(0);
    const seen: number[] = [];

    void [
      ...threads(function* () {
        yield signal(10, 1);
        yield* waitFor(0.5);
        yield signal(20, 1);
        yield* waitFor(0.6);
        seen.push(signal());
        yield* waitFor(0.5);
        seen.push(signal());
      }),
    ];

    expect(seen[0]).not.toBe(10);
    expect(seen[1]).toBe(20);
  });
});
