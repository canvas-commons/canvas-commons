/* eslint-disable @typescript-eslint/no-unused-vars */

import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {PlaybackManager, PlaybackStatus} from '../app/index.js';
import {waitFor} from '../flow/index.js';
import {endPlayback, startPlayback, useTime} from '../utils/index.js';
import {cancel} from './cancel.js';
import {join} from './join.js';
import {threads} from './threads.js';

describe('cancel()', () => {
  const playback = new PlaybackManager();
  const status = new PlaybackStatus(playback);
  beforeAll(() => startPlayback(status));
  afterAll(() => endPlayback(status));

  test('Elapsed time when canceling a thread', () => {
    let time = NaN;
    const task = threads(function* () {
      const waitTask = yield waitFor(2);
      cancel(waitTask);
      yield* join(waitTask);
      time = useTime();
    });

    playback.fps = 10;
    playback.frame = 0;
    for (const _ of task) {
      playback.frame++;
    }

    expect(time).toBeCloseTo(0);
  });
});
