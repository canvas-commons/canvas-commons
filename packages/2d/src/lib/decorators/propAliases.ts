import type {Node} from '../components/Node';
import {getPropertiesOf} from './signal';

const PROP_ALIASES = new WeakMap<object, Record<string, string>>();

/**
 * Accept additional prop names for the signals of a node class.
 *
 * @remarks
 * A class that declares a signal with the alias name keeps its own signal.
 *
 * @example
 * ```ts
 * addPropAliases(Layout.prototype, {offset: 'anchor'});
 * ```
 */
export function addPropAliases(
  target: object,
  aliases: Record<string, string>,
) {
  PROP_ALIASES.set(target, {...PROP_ALIASES.get(target), ...aliases});
  for (const [alias, key] of Object.entries(aliases)) {
    Object.defineProperty(target, alias, {
      configurable: true,
      get(this: object): unknown {
        return Reflect.get(this, key);
      },
      // A subclass that declares a signal with the alias name assigns it in
      // its constructor. The own property then shadows this accessor.
      set(this: object, value: unknown) {
        Object.defineProperty(this, alias, {
          value,
          configurable: true,
          enumerable: true,
          writable: true,
        });
      },
    });
  }
}

function getPropAliases(prototype: object): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (
    let current: object | null = prototype;
    current;
    current = Object.getPrototypeOf(current)
  ) {
    for (const [alias, key] of Object.entries(
      PROP_ALIASES.get(current) ?? {},
    )) {
      aliases[alias] ??= key;
    }
  }
  return aliases;
}

/** Replace the aliased props with the props they stand for. */
export function resolvePropAliases<T extends Record<string, unknown>>(
  instance: Node,
  props: T,
): T {
  const applicable = Object.entries(
    getPropAliases(Object.getPrototypeOf(instance)),
  ).filter(
    ([alias, key]) => props[alias] !== undefined && props[key] === undefined,
  );
  if (applicable.length === 0) {
    return props;
  }

  const declared = new Set<string>();
  for (const [key, meta] of Object.entries(getPropertiesOf(instance))) {
    declared.add(key);
    for (const [, property] of meta.compoundEntries ?? []) {
      declared.add(property);
    }
  }

  const resolved: T = {...props};
  for (const [alias, key] of applicable) {
    if (!declared.has(alias)) {
      Object.assign(resolved, {[key]: props[alias]});
      delete resolved[alias];
    }
  }
  return resolved;
}
