/**
 * Terminate a worker and detach its message handlers.
 *
 * @remarks
 * A worker terminated during `importScripts` still dispatches the aborted
 * load as an error, which the page reports as uncaught unless it is handled.
 */
export function terminateWorker(worker: Worker): void {
  worker.onmessage = null;
  worker.onmessageerror = null;
  worker.onerror = event => event.preventDefault();
  worker.terminate();
}
