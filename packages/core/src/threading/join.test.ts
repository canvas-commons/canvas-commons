/* eslint-disable @typescript-eslint/no-unused-vars */

import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {PlaybackManager, PlaybackStatus} from '../app/index.js';
import {waitFor} from '../flow/index.js';
import {endPlayback, startPlayback, useTime} from '../utils/index.js';
import {join} from './join.js';
import {threads} from './threads.js';

describe('join()', () => {
  const playback = new PlaybackManager();
  const status = new PlaybackStatus(playback);
  beforeAll(() => startPlayback(status));
  afterAll(() => endPlayback(status));

  test('Elapsed time when joining all threads', () => {
    let time = NaN;
    const task = threads(function* () {
      const taskA = yield waitFor(0.15);
      const taskB = yield waitFor(0.17);
      yield* join(taskA, taskB);
      time = useTime();
    });

    playback.fps = 10;
    playback.frame = 0;
    for (const _ of task) {
      playback.frame++;
    }

    expect(time).toBeCloseTo(0.17);
  });

  test('Elapsed time when joining any thread', () => {
    let time = NaN;
    const task = threads(function* () {
      const taskA = yield waitFor(0.15);
      const taskB = yield waitFor(0.17);
      yield* join(false, taskA, taskB);
      time = useTime();
    });

    playback.fps = 10;
    playback.frame = 0;
    for (const _ of task) {
      playback.frame++;
    }

    expect(time).toBeCloseTo(0.15);
  });

  test('Elapsed time when joining an already canceled thread', () => {
    let time = NaN;
    const task = threads(function* () {
      const waitTask = yield waitFor(0.15);
      yield* waitFor(0.2);
      yield* join(waitTask);
      time = useTime();
    });

    playback.fps = 10;
    playback.frame = 0;
    for (const _ of task) {
      playback.frame++;
    }

    expect(time).toBeCloseTo(0.2);
  });

  test('Elapsed time when joining a thread right after cancellation', () => {
    let time = NaN;
    const task = threads(function* () {
      const waitTask = yield waitFor(0.05);
      yield* join(waitTask);
      time = useTime();
    });

    playback.fps = 10;
    playback.frame = 0;
    for (const _ of task) {
      playback.frame++;
    }

    expect(time).toBeCloseTo(0.05);
  });
});
