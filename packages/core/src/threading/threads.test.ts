import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest';
import {PlaybackManager, PlaybackStatus} from '../app';
import {noop, run, waitFor} from '../flow';
import {endPlayback, startPlayback, useThread} from '../utils';
import {Thread} from './Thread';
import {cancel} from './cancel';
import {spawn} from './spawn';
import {threads} from './threads';

function failCleanup(): never {
  throw new Error('cleanup failed');
}

describe('threads()', () => {
  const status = new PlaybackStatus(new PlaybackManager());
  beforeAll(() => startPlayback(status));
  afterAll(() => endPlayback(status));

  test('Execution order - yield', () => {
    const order: number[] = [];
    const task = threads(function* () {
      order.push(0);
      yield run(function* () {
        order.push(1);
        yield;
        order.push(5);
      });
      yield run(function* () {
        order.push(2);
        yield;
        order.push(6);
      });
      order.push(3);
      yield noop();
      order.push(4);
      yield;
      order.push(7);
    });

    [...task];

    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  test('Execution order - spawn', () => {
    const order: number[] = [];
    const task = threads(function* () {
      order.push(0);
      spawn(function* () {
        order.push(3);
        yield;
        order.push(6);
      });
      spawn(function* () {
        order.push(4);
        yield;
        order.push(7);
      });
      order.push(1);
      yield noop();
      order.push(2);
      yield;
      order.push(5);
      yield;
      order.push(8);
    });

    [...task];

    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('Cancellation of child threads', () => {
    const task = threads(function* () {
      yield run(function* () {
        for (let i = 0; i < 10; i++) {
          yield;
        }
      });
      spawn(function* () {
        for (let i = 0; i < 10; i++) {
          yield;
        }
      });
      yield;
      yield;
    });

    expect([...task].length).toBe(2);
  });

  test('Pausing a thread', () => {
    const order: number[] = [];
    const task = threads(function* () {
      order.push(0);
      yield run(function* () {
        order.push(1);
        yield;
        order.push(3);
        yield;
        order.push(8);
      });
      const yieldChild = useThread().children[0];
      spawn(function* () {
        order.push(4);
        yield;
        order.push(9);
      });
      order.push(2);
      yield;

      const spawnChild = useThread().children[1];
      yieldChild.pause(true);
      spawnChild.pause(true);

      order.push(5);
      yield;
      order.push(6);
      yield;

      yieldChild.pause(false);
      spawnChild.pause(false);

      order.push(7);
      yield;
      order.push(10);
    });

    [...task];

    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('Canceled finally blocks run in their own thread', () => {
    let self: Thread | null = null;
    let seen: Thread | null = null;
    const task = threads(function* () {
      const child = yield run(function* () {
        self = useThread();
        try {
          yield;
          yield;
        } finally {
          seen = useThread();
        }
      });
      yield;
      cancel(child);
    });

    [...task];

    expect(seen).not.toBeNull();
    expect(seen).toBe(self);
  });

  test('A yielding finally block warns and does not block the ones around it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let outer = false;
    let continuedAfterYield = false;
    let outerAfterCancel = false;
    const task = threads(function* () {
      const child = yield run(function* () {
        try {
          yield* (function* () {
            try {
              yield;
              yield;
            } finally {
              yield;
              continuedAfterYield = true;
            }
          })();
        } finally {
          outer = true;
        }
      });
      yield;
      cancel(child);
      outerAfterCancel = outer;
    });

    [...task];

    expect(warn).toHaveBeenCalledOnce();
    expect(outerAfterCancel).toBe(true);
    expect(continuedAfterYield).toBe(false);
    warn.mockRestore();
  });

  test('A throwing finally block leaves the thread stack intact', () => {
    let caught: unknown = null;
    let afterCatch = false;
    const task = threads(function* () {
      const child = yield run(function* () {
        try {
          yield;
          yield;
        } finally {
          failCleanup();
        }
      });
      yield;
      try {
        cancel(child);
      } catch (error) {
        caught = error;
      }
      yield;
      afterCatch = true;
    });

    [...task];

    expect(caught).toBeInstanceOf(Error);
    expect(afterCatch).toBe(true);
  });

  test('A task canceled by its own deferred effect runs its finally block', () => {
    let finalized = false;
    let finalizedWhileRootRuns = false;
    const task = threads(function* () {
      yield run(function* () {
        const self = useThread();
        self.onDeferred.subscribe(() => self.cancel());
        try {
          yield* waitFor(5);
        } finally {
          finalized = true;
        }
      });
      yield;
      yield;
      finalizedWhileRootRuns = finalized;
      yield* waitFor(1);
    });

    [...task];

    expect(finalizedWhileRootRuns).toBe(true);
  });

  test('A task that cancels its own ancestor runs its finally block', () => {
    let finalized = false;
    let finalizedWhileRootRuns = false;
    const task = threads(function* () {
      const ancestor = yield run(function* () {
        yield run(function* () {
          try {
            yield;
            cancel(ancestor);
            yield* waitFor(5);
          } finally {
            finalized = true;
          }
        });
        yield* waitFor(5);
      });
      yield;
      yield;
      finalizedWhileRootRuns = finalized;
      yield* waitFor(1);
    });

    [...task];

    expect(finalizedWhileRootRuns).toBe(true);
  });
});
