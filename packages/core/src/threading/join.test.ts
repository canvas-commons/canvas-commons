/* eslint-disable @typescript-eslint/no-unused-vars */

import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {PlaybackManager, PlaybackStatus} from '../app';
import {all, waitFor} from '../flow';
import {endPlayback, startPlayback, useTime} from '../utils';
import {cancel} from './cancel';
import {join} from './join';
import {spawn} from './spawn';
import {threads} from './threads';

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

  test('Joining without tasks returns at once', () => {
    let framesWaited = NaN;
    const task = threads(function* () {
      const frame = playback.frame;
      yield* join();
      yield* all();
      framesWaited = playback.frame - frame;
    });

    playback.fps = 10;
    playback.frame = 0;
    for (const _ of task) {
      playback.frame++;
    }

    expect(framesWaited).toBe(0);
  });

  test('Joining a task canceled on the frame it was spawned returns at once', () => {
    let framesWaited = NaN;
    const task = threads(function* () {
      const spawned = spawn(waitFor(1));
      cancel(spawned);
      const frame = playback.frame;
      yield* join(spawned);
      framesWaited = playback.frame - frame;
    });

    playback.fps = 10;
    playback.frame = 0;
    for (const _ of task) {
      playback.frame++;
    }

    expect(framesWaited).toBe(0);
  });

  test('Joining any task returns at once when one is already finished', () => {
    let framesWaited = NaN;
    const task = threads(function* () {
      const finished = yield waitFor(0.05);
      yield* waitFor(0.2);
      const spawned = spawn(waitFor(1));
      const frame = playback.frame;
      yield* join(false, finished, spawned);
      framesWaited = playback.frame - frame;
    });

    playback.fps = 10;
    playback.frame = 0;
    for (const _ of task) {
      playback.frame++;
    }

    expect(framesWaited).toBe(0);
  });
});
