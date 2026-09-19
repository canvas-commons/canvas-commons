import type {CompileResult} from './compiler';
import {compileFiddle} from './compiler';

/**
 * A compile job posted to the worker.
 *
 * @example
 * ```ts
 * const request: WorkerCompileRequest = {
 *   type: 'compile',
 *   generation: 0,
 *   source: 'export default 1;',
 *   extraSpecifiers: [],
 * };
 * worker.postMessage(request);
 * ```
 */
export interface WorkerCompileRequest {
  type: 'compile';
  generation: number;
  source: string;
  extraSpecifiers: string[];
}

/**
 * The worker's answer to a {@link WorkerCompileRequest}, echoing its
 * generation.
 */
export interface WorkerCompileResponse {
  type: 'compiled';
  generation: number;
  result: CompileResult;
}

interface WorkerScope {
  postMessage(message: WorkerCompileResponse): void;
  onmessage: ((event: {data: WorkerCompileRequest}) => void) | null;
}

/* eslint-disable-next-line @typescript-eslint/naming-convention -- the worker
   global is named self. */
declare const self: WorkerScope;

self.onmessage = event => {
  const request = event.data;
  const result = compileFiddle(request.source, {
    extraSpecifiers: request.extraSpecifiers,
  });
  self.postMessage({type: 'compiled', generation: request.generation, result});
};
