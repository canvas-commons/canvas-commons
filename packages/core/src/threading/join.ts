import {decorate, threadable} from '../decorators';
import {useThread} from '../utils';
import {Thread, findThread} from './Thread';
import {ThreadGenerator} from './ThreadGenerator';

decorate(join, threadable());
/**
 * Pause the current generator until all listed tasks are finished.
 *
 * @example
 * ```ts
 * const task = yield generatorFunction();
 *
 * // do something concurrently
 *
 * yield* join(task);
 * ```
 *
 * @param tasks - A list of tasks to join.
 */
export function join(...tasks: ThreadGenerator[]): ThreadGenerator;
/**
 * Pause the current generator until listed tasks are finished.
 *
 * @example
 * ```ts
 * const taskA = yield generatorFunctionA();
 * const taskB = yield generatorFunctionB();
 *
 * // do something concurrently
 *
 * // await any of the tasks
 * yield* join(false, taskA, taskB);
 * ```
 *
 * @param all - Whether we should wait for all tasks or for at least one.
 * @param tasks - A list of tasks to join.
 */
export function join(
  all: boolean,
  ...tasks: ThreadGenerator[]
): ThreadGenerator;
export function* join(
  first?: ThreadGenerator | boolean,
  ...tasks: ThreadGenerator[]
): ThreadGenerator {
  let all = true;
  if (typeof first === 'boolean') {
    all = first;
  } else if (first) {
    tasks.push(first);
  }

  const parent = useThread();
  const startTime = parent.time();
  let threads = findThreads(tasks);
  const oneFinished = threads.some(thread => thread.canceled);
  if (threads.length < tasks.length && (all || !oneFinished)) {
    // A spawned task becomes a thread at the end of the current frame.
    yield;
    threads = findThreads(tasks);
  }

  if (threads.length === 0) {
    return;
  }

  let childTime;
  if (all) {
    while (threads.find(thread => !thread.canceled)) {
      yield;
    }
    childTime = Math.max(...threads.map(thread => thread.time()));
  } else {
    while (!threads.find(thread => thread.canceled)) {
      yield;
    }
    const canceled = threads.filter(thread => thread.canceled);
    childTime = Math.min(...canceled.map(thread => thread.time()));
  }

  parent.time(Math.max(startTime, childTime));
}

function findThreads(tasks: ThreadGenerator[]): Thread[] {
  return tasks
    .map(findThread)
    .filter((thread): thread is Thread => thread !== undefined);
}
