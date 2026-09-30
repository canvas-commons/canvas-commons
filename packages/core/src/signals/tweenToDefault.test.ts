import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {PlaybackManager, PlaybackStatus} from '../app';
import {threads} from '../threading';
import {map} from '../tweening';
import {Vector2} from '../types';
import {endPlayback, startPlayback} from '../utils';
import {SignalContext} from './SignalContext';
import {DEFAULT} from './symbols';

describe('tweening to DEFAULT', () => {
  const playback = new PlaybackManager();
  const status = new PlaybackStatus(playback);
  beforeAll(() => startPlayback(status));
  afterAll(() => endPlayback(status));

  test('a compound signal is initial afterwards', () => {
    const source = Vector2.createSignal(() => new Vector2(3, 4));
    const signal = Vector2.createSignal(() => source());
    signal(new Vector2(1, 1));
    expect(signal.isInitial()).toBe(false);

    playback.fps = 60;
    playback.frame = 0;
    const task = threads(function* () {
      yield* signal(DEFAULT, 0.1);
    });
    while (!task.next().done) {
      playback.frame++;
    }

    expect(signal.isInitial()).toBe(true);
    expect(signal().toArray()).toEqual([3, 4]);
  });

  test('a custom setter receives the initial value', () => {
    const received: unknown[] = [];
    const signal = new SignalContext<number, number>(
      1,
      map,
      undefined,
      value => value,
      {
        setter(value) {
          received.push(value);
          return undefined;
        },
      },
    ).toSignal();

    const task = threads(function* () {
      yield* signal(DEFAULT, 0.1);
    });
    while (!task.next().done) {
      playback.frame++;
    }

    expect(received.at(-1)).toBe(1);
  });
});
