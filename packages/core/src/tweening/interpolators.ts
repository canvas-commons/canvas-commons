import {useLogger} from '../utils';
import type {InterpolationFunction} from './interpolationFunctions';

/**
 * A named interpolator that can be picked at runtime based on the
 * interpolated values.
 */
export interface InterpolatorEntry<T> {
  /**
   * The unique name identifying this interpolator.
   */
  name: string;
  /**
   * Check if this interpolator can handle the given pair of values.
   */
  test(a: unknown, b: unknown): boolean;
  /**
   * The interpolation function to use when {@link test} passes.
   */
  lerp(from: T, to: T, value: number): T;
  /**
   * Entries with a higher priority win over lower ones. Defaults to `0`.
   */
  priority?: number;
}

/**
 * A serializable identity of a factory-produced interpolation function.
 */
export interface InterpolatorDescriptor {
  id: string;
  params: Record<string, unknown>;
}

/**
 * Options for {@link interpolators.registerFactory}.
 */
export interface InterpolatorFactoryOptions {
  /**
   * The factory's parameter names, in positional order, mapped to a
   * human-readable description of their type.
   *
   * @remarks
   * The names key the produced descriptor's `params`; the descriptions are
   * documentation and are not validated against at runtime.
   */
  params: Record<string, string>;
}

interface RegisteredEntry {
  entry: InterpolatorEntry<unknown>;
  priority: number;
  count: number;
}

interface RegisteredFactory {
  factory: unknown;
  params: Record<string, string>;
}

const Registry = new Map<string, RegisteredEntry>();
const Factories = new Map<string, RegisteredFactory>();
const Descriptors = new WeakMap<object, InterpolatorDescriptor>();
const WarnedFactories = new Set<string>();

function serializeValue(value: unknown): {value: unknown} | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? {value} : null;
  }

  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return {value};
  }

  if (Array.isArray(value)) {
    const values: unknown[] = [];
    for (const element of value) {
      const serialized = serializeValue(element);
      if (serialized === null) {
        return null;
      }
      values.push(serialized.value);
    }
    return {value: values};
  }

  if (typeof value === 'object') {
    if ('serialize' in value && typeof value.serialize === 'function') {
      const serialized: unknown = value.serialize();
      return serialized === value ? null : serializeValue(serialized);
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype === Object.prototype || prototype === null) {
      const values: Record<string, unknown> = {};
      for (const [key, element] of Object.entries(value)) {
        const serialized = serializeValue(element);
        if (serialized === null) {
          return null;
        }
        values[key] = serialized.value;
      }
      return {value: values};
    }
  }

  return null;
}

function serializeParams(
  id: string,
  names: string[],
  args: unknown[],
): Record<string, unknown> | null {
  const params: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === undefined) {
      continue;
    }
    const serialized = serializeValue(args[i]);
    if (serialized === null) {
      if (!WarnedFactories.has(id)) {
        WarnedFactories.add(id);
        useLogger().warn(
          `interpolators.registerFactory("${id}"): called with non-serializable arguments, the produced interpolator will not carry a descriptor.`,
        );
      }
      return null;
    }
    params[names[i] ?? `${i}`] = serialized.value;
  }
  return params;
}

/**
 * A registry of named interpolation functions.
 *
 * @remarks
 * Registered entries are consulted by signal tweens that have no explicit
 * interpolation function configured, before falling back to
 * {@link deepLerp}. Registered factories give the interpolation functions
 * they produce a serializable `{id, params}` identity.
 */
export const interpolators = {
  /**
   * Register an interpolator.
   *
   * @remarks
   * Names are unique: registering a different entry under an existing name
   * throws, while re-registering an identical entry is a no-op. Ties in
   * {@link InterpolatorEntry.priority} are broken by registration order.
   *
   * @example
   * ```ts
   * const uninstall = interpolators.register({
   *   name: 'myLibrary/quaternion',
   *   test: (a, b) => a instanceof Quaternion && b instanceof Quaternion,
   *   lerp: Quaternion.slerp,
   * });
   * ```
   *
   * @param entry - The interpolator to register.
   *
   * @returns A function that removes the entry from the registry.
   */
  register<T>(entry: InterpolatorEntry<T>): () => void {
    const existing = Registry.get(entry.name);
    let record: RegisteredEntry;
    if (existing) {
      if (
        existing.entry.test !== entry.test ||
        existing.entry.lerp !== entry.lerp ||
        existing.priority !== (entry.priority ?? 0)
      ) {
        throw new Error(
          `interpolators.register("${entry.name}"): already registered with a different implementation`,
        );
      }
      record = existing;
      record.count++;
    } else {
      record = {entry, priority: entry.priority ?? 0, count: 1};
      Registry.set(entry.name, record);
    }

    let active = true;
    return () => {
      if (!active || Registry.get(entry.name) !== record) {
        return;
      }
      active = false;
      record.count--;
      if (record.count === 0) {
        Registry.delete(entry.name);
      }
    };
  },

  /**
   * Find an interpolation function for the given pair of values.
   *
   * @example
   * ```ts
   * const lerp = interpolators.find(from, to) ?? deepLerp;
   * ```
   *
   * @param a - The value interpolated from.
   * @param b - The value interpolated to.
   *
   * @returns The interpolation function of the highest-priority entry whose
   *          test passes, or `null` if none match.
   */
  find<T = unknown>(a: unknown, b: unknown): InterpolationFunction<T> | null {
    let best: RegisteredEntry | null = null;
    for (const record of Registry.values()) {
      if (
        (best === null || record.priority > best.priority) &&
        record.entry.test(a, b)
      ) {
        best = record;
      }
    }

    if (best === null) {
      return null;
    }

    const {lerp} = best.entry;
    // The entry's test vouches for the values this function receives.
    return (from: T, to: T, value: number) => lerp(from, to, value) as T;
  },

  /**
   * Look up a registered interpolator by name.
   *
   * @example
   * ```ts
   * const entry = interpolators.get('myLibrary/quaternion');
   * ```
   *
   * @param name - The name of the interpolator.
   */
  get(name: string): InterpolatorEntry<unknown> | null {
    return Registry.get(name)?.entry ?? null;
  },

  /**
   * Register a factory of interpolation functions.
   *
   * @remarks
   * The returned wrapper stamps every interpolation function it produces
   * with a serializable `{id, params}` descriptor, retrievable through
   * {@link interpolators.describe}. Arguments that can't be serialized -
   * functions, symbols, or non-plain objects without a `serialize` method -
   * skip the stamp and log a one-time warning.
   *
   * Ids are unique: registering a different factory under an existing id
   * throws, while re-registering the same factory is a no-op.
   *
   * @example
   * ```ts
   * Vector2.createPolarLerp = interpolators.registerFactory(
   *   'core/polarLerp',
   *   Vector2.createPolarLerp,
   *   {params: {counterclockwise: 'boolean', center: 'Vector2'}},
   * );
   * ```
   *
   * @param id - The unique id identifying the factory.
   * @param factory - The factory to wrap.
   * @param options - The factory's parameter schema, in positional order.
   *
   * @returns A wrapper with the same signature as the factory.
   */
  registerFactory<TArgs extends unknown[], T>(
    id: string,
    factory: (...args: TArgs) => InterpolationFunction<T>,
    options: InterpolatorFactoryOptions,
  ): (...args: TArgs) => InterpolationFunction<T> {
    const existing = Factories.get(id);
    if (existing && existing.factory !== factory) {
      throw new Error(
        `interpolators.registerFactory("${id}"): already registered with a different factory`,
      );
    }
    if (!existing) {
      Factories.set(id, {factory, params: options.params});
    }

    const names = Object.keys(options.params);
    return (...args: TArgs) => {
      const fn = factory(...args);
      const params = serializeParams(id, names, args);
      if (params !== null) {
        Descriptors.set(fn, {id, params});
      }
      return fn;
    };
  },

  /**
   * Retrieve the descriptor of a factory-produced interpolation function.
   *
   * @example
   * ```ts
   * const descriptor = interpolators.describe(
   *   Vector2.createPolarLerp(true, [120, 40]),
   * );
   * // {id: 'core/polarLerp', params: {counterclockwise: true, center: [120, 40]}}
   * ```
   *
   * @param fn - An interpolation function produced by a registered factory.
   *
   * @returns The `{id, params}` descriptor, or `null` if the function wasn't
   *          produced by a registered factory.
   */
  describe<T>(fn: InterpolationFunction<T>): InterpolatorDescriptor | null {
    return Descriptors.get(fn) ?? null;
  },
};
