import {Computed, createComputed} from '@canvas-commons/core';
import {addInitializer} from './initializers';

const COMPUTED = new WeakMap<object, Computed<unknown>[]>();

/**
 * Create a computed method decorator.
 *
 * @remarks
 * This decorator turns the given method into a computed value.
 * See {@link createComputed} for more information.
 */
export function computed(): MethodDecorator {
  return (target: any, key) => {
    addInitializer(target, (instance: any) => {
      const method = Object.getPrototypeOf(instance)[key];
      const value = createComputed(method.bind(instance), instance);
      instance[key] = value;
      const computeds = COMPUTED.get(instance) ?? [];
      computeds.push(value);
      COMPUTED.set(instance, computeds);
    });
  };
}

/**
 * Dispose every computed value created by the {@link computed} decorator on
 * the given instance.
 *
 * @remarks
 * Disposing a computed clears its cached value and unsubscribes it from its
 * dependencies. Dependencies that outlive the instance would otherwise keep
 * it (and everything it references) from being garbage collected.
 *
 * @param instance - The instance whose computed values should be disposed.
 */
export function disposeComputed(instance: object) {
  for (const computed of COMPUTED.get(instance) ?? []) {
    computed.context.dispose();
  }
  COMPUTED.delete(instance);
}
