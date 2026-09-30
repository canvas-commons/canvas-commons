import {Page} from 'playwright';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import type {FlowProbe} from '../tests/scenes/flow-timing.probe';
import {openScene} from './helpers/render';

describe('flow timing', () => {
  let page: Page;
  let probe: FlowProbe;

  beforeAll(async () => {
    page = await openScene('flow-timing');
    probe = await page.evaluate(async () => {
      if (!window.flowProbe) {
        throw new Error('The flow-timing scene did not publish its probe.');
      }
      return window.flowProbe;
    });
  });

  afterAll(async () => {
    await page?.close();
  });

  describe('harness', () => {
    test('the scene published its probe and the control cases completed', () => {
      expect(probe.fps).toBe(30);
      expect(probe.allDoneAt).toBeGreaterThan(0.15);
      expect(probe.frames).toHaveLength(12);
    });

    test('an interval of whole frames ticks once per interval', () => {
      expect(probe.wholeFrameTicks).toBeGreaterThanOrEqual(39);
      expect(probe.wholeFrameTicks).toBeLessThanOrEqual(42);
    });

    test('a task that is not canceled runs to its end', () => {
      expect(probe.controlProgress).toBe(1);
    });

    test('canceling a direct child runs its finally block', () => {
      expect(probe.finalizedByCancel).toContain('leaf');
    });

    test('whole-frame durations measure whole frames for short waits', () => {
      const shortWait = probe.frames.find(
        sample => sample.construct === 'waitFor' && sample.seconds === 0.1,
      );
      expect(shortWait?.frames).toBe(3);
    });

    test('secondsToFrames rounds partial frames up', async () => {
      const mismatched = await page.evaluate(() => {
        const {player} = window.commons;
        const fps = player.playback.fps;
        const wrong: number[] = [];
        for (let frame = 0; frame <= fps; frame++) {
          if (
            player.status.secondsToFrames((frame + 0.4) / fps) !==
            frame + 1
          ) {
            wrong.push(frame);
          }
        }
        return wrong;
      });
      expect(mismatched).toEqual([]);
    });

    test('secondsToFrames is exact for the first second of frames', async () => {
      const mismatched = await page.evaluate(() => {
        const {player} = window.commons;
        const fps = player.playback.fps;
        const wrong: number[] = [];
        for (let frame = 0; frame <= fps; frame++) {
          if (player.status.secondsToFrames(frame / fps) !== frame) {
            wrong.push(frame);
          }
        }
        return wrong;
      });
      expect(mismatched).toEqual([]);
    });
  });

  test('every() ticks at its interval when the interval is not a whole number of frames', () => {
    expect(probe.ticks).toBeGreaterThanOrEqual(79);
    expect(probe.ticks).toBeLessThanOrEqual(82);
  });

  test('every() ticks at the new interval after it is shortened', () => {
    expect(probe.retimedTicksAfterChange).toBeGreaterThanOrEqual(3);
    expect(probe.retimedTicksAfterChange).toBeLessThanOrEqual(4);
  });

  test('a spawned task can be canceled from a nested thread', () => {
    expect(probe.canceledSpawnProgress).toBeGreaterThanOrEqual(0);
    expect(probe.canceledSpawnProgress).toBeLessThan(0.3);
  });

  test('canceling a task runs the finally blocks of its child tasks', () => {
    expect(probe.finalizedByCancel).toContain('a');
    expect(probe.finalizedByCancel).toContain('b');
  });

  test('any() without tasks ends at once', () => {
    expect(probe.anyWithoutTasksDoneAt).toBeGreaterThanOrEqual(0);
    expect(probe.anyWithoutTasksDoneAt).toBeLessThan(0.2);
  });

  test('join(false, task) on a finished task returns at once', () => {
    expect(probe.joinFinishedDoneAt).toBeGreaterThanOrEqual(0.5);
    expect(probe.joinFinishedDoneAt).toBeLessThan(1);
  });

  test('waits and tweens of whole-frame durations take exactly that many frames', () => {
    const wrong = probe.frames
      .map(sample => ({
        ...sample,
        expected: Math.round(sample.seconds * probe.fps),
      }))
      .filter(sample => sample.frames !== sample.expected);
    expect(wrong).toEqual([]);
  });

  test('secondsToFrames returns k for k / fps', async () => {
    const wrong = await page.evaluate(() => {
      const {player} = window.commons;
      const fps = player.playback.fps;
      const mismatched: number[] = [];
      for (let frame = 0; frame <= 900; frame++) {
        if (player.status.secondsToFrames(frame / fps) !== frame) {
          mismatched.push(frame);
        }
      }
      return mismatched;
    });
    expect(wrong).toEqual([]);
  });
});
