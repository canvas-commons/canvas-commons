/* eslint-disable @typescript-eslint/no-unused-vars */

import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {PlaybackManager, PlaybackStatus} from '../app';
import {threads} from '../threading';
import {endPlayback, startPlayback} from '../utils';
import {loopFor} from './loopFor';

describe('loopFor()', () => {
  const playback = new PlaybackManager();
  const status = new PlaybackStatus(playback);
  beforeAll(() => startPlayback(status));
  afterAll(() => endPlayback(status));

  test('Iterates once per frame at any playback speed', () => {
    const iterations = (speed: number) => {
      playback.fps = 10;
      playback.frame = 0;
      playback.speed = speed;
      let count = 0;
      const task = threads(() =>
        loopFor(1, () => {
          count++;
        }),
      );
      for (const _ of task) {
        playback.frame++;
      }
      playback.speed = 1;
      return count;
    };

    expect(iterations(1)).toBe(10);
    expect(iterations(0.5)).toBe(20);
    expect(iterations(2)).toBe(5);
  });
});
