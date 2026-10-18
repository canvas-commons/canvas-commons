import {useThread} from '../utils';
import {findThread} from './Thread';
import {ThreadGenerator} from './ThreadGenerator';

/**
 * Cancel all listed tasks.
 *
 * Example:
 * ```ts
 * const task = yield generatorFunction();
 *
 * // do something concurrently
 *
 * yield* cancel(task);
 * ```
 *
 * @param tasks - A list of tasks to cancel.
 */
export function cancel(...tasks: ThreadGenerator[]) {
  const thread = useThread();
  for (const task of tasks) {
    const child = findThread(task);
    if (!child) {
      thread.root.unspawn(task)?.time(thread.time());
    } else if (!child.canceled) {
      child.cancel();
      child.time(thread.time());
    }
  }
}
