import {SignalExtensions, capitalize} from '@canvas-commons/core';
import {PropertyMetadata} from '../decorators';

function findHook(owner: object, prefix: string, name: string) {
  const hook: unknown = Reflect.get(owner, `${prefix}${capitalize(name)}`);
  return typeof hook === 'function' ? hook : undefined;
}

/** Build the signal extensions of a property. */
export function makeSignalExtensions<TSetterValue, TValue extends TSetterValue>(
  meta: Partial<PropertyMetadata<TValue>> = {},
  owner?: object,
  name?: string,
) {
  const extensions: Partial<SignalExtensions<TSetterValue, TValue>> = {};

  if (name && owner) {
    const setter = meta.setter ?? findHook(owner, 'set', name);
    if (setter) {
      extensions.setter = setter.bind(owner);
    }

    const getter = meta.getter ?? findHook(owner, 'get', name);
    if (getter) {
      extensions.getter = getter.bind(owner);
    }

    const tweener = meta.tweener ?? findHook(owner, 'tween', name);
    if (tweener) {
      extensions.tweener = tweener.bind(owner);
    }
  }

  return extensions;
}
