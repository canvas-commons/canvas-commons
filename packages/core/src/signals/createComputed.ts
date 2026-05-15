import {Computed, ComputedContext} from '../signals/index.js';

export function createComputed<TValue>(
  factory: (...args: any[]) => TValue,
  owner?: any,
): Computed<TValue> {
  return new ComputedContext<TValue>(factory, owner).toSignal();
}
