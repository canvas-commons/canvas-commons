/**
 * Let the browser paint and handle pending events, then resume.
 *
 * @remarks
 * Nested `setTimeout` calls wait at least 4 ms, and longer on coarse OS
 * timers. A `MessageChannel` message does not.
 */
export function yieldToEventLoop(): Promise<void> {
  const {port1, port2} = new MessageChannel();
  return new Promise(resolve => {
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
}
