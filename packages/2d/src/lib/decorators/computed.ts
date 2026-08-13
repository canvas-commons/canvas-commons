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

/** Unsubscribe from dependencies that can outlive the node. */
export function disposeComputed(instance: object) {
  for (const computed of COMPUTED.get(instance) ?? []) {
    computed.context.dispose();
  }
  COMPUTED.delete(instance);
}
