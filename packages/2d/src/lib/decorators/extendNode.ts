import {addInitializer, Constructor, Initializer} from './initializers';
import {
  getPropertiesOf,
  getPropertyMeta,
  invalidatePropertyMetaCache,
  PropertyMetadata,
} from './signal';

export type ExtensionSlot = 'tweener' | 'parser' | 'interpolation' | 'default';

type SlotValue<
  TSlot extends ExtensionSlot,
  TValue = unknown,
> = TSlot extends 'tweener'
  ? PropertyMetadata<TValue>['tweener']
  : TSlot extends 'parser'
    ? PropertyMetadata<TValue>['parser']
    : TSlot extends 'interpolation'
      ? PropertyMetadata<TValue>['interpolationFunction']
      : PropertyMetadata<TValue>['default'];

export interface AddOperation {
  op: 'add';
  decorators: PropertyDecorator[];
}

export interface DecorateOperation<
  TSlot extends ExtensionSlot,
  TValue = unknown,
> {
  op: 'decorate';
  slot: TSlot;
  wrap: (next: SlotValue<TSlot, TValue>) => SlotValue<TSlot, TValue>;
}

export interface ReplaceOperation<
  TSlot extends ExtensionSlot,
  TValue = unknown,
> {
  op: 'replace';
  slot: TSlot;
  value: SlotValue<TSlot, TValue>;
}

type AnyDecorateOperation = {
  [TSlot in ExtensionSlot]: DecorateOperation<TSlot>;
}[ExtensionSlot];

type AnyReplaceOperation = {
  [TSlot in ExtensionSlot]: ReplaceOperation<TSlot>;
}[ExtensionSlot];

export type ExtensionOperation =
  | AddOperation
  | AnyDecorateOperation
  | AnyReplaceOperation;

export interface ExtendNodeOptions {
  identity: string;
}

interface AppliedOperation {
  identity: string;
  operation: ExtensionOperation;
}

const EXTENSIONS = Symbol.for('@canvas-commons/2d/decorators/extensions');
const APPLIED_IDENTITIES = Symbol.for(
  '@canvas-commons/2d/decorators/extensions/applied',
);

type ExtensionLog = Record<string, AppliedOperation[]>;

function getOwnExtensionLog(target: object): ExtensionLog | null {
  return Object.prototype.hasOwnProperty.call(target, EXTENSIONS)
    ? (target as Record<symbol, ExtensionLog>)[EXTENSIONS]
    : null;
}

function getAppliedLog(target: object, property: string): AppliedOperation[] {
  if (!Object.prototype.hasOwnProperty.call(target, EXTENSIONS)) {
    (target as Record<symbol, ExtensionLog>)[EXTENSIONS] = {};
  }
  const lookup = (target as Record<symbol, ExtensionLog>)[EXTENSIONS];
  lookup[property] ??= [];
  return lookup[property];
}

function getAppliedRegistry(target: object): Map<string, string> {
  if (!Object.prototype.hasOwnProperty.call(target, APPLIED_IDENTITIES)) {
    (target as Record<symbol, Map<string, string>>)[APPLIED_IDENTITIES] =
      new Map();
  }
  return (target as Record<symbol, Map<string, string>>)[APPLIED_IDENTITIES];
}

function fingerprintOf(operations: Record<string, ExtensionOperation>): string {
  return Object.entries(operations)
    .map(([property, operation]) =>
      operation.op === 'add'
        ? `${property}:add:${operation.decorators.length}`
        : `${property}:${operation.op}:${operation.slot}`,
    )
    .sort()
    .join(',');
}

function chainOf(target: object): object[] {
  const chain: object[] = [];
  let prototype: object | null = target;
  while (prototype && prototype !== Object.prototype) {
    chain.push(prototype);
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return chain;
}

function findAdder(target: object, property: string): string | null {
  for (const prototype of chainOf(target)) {
    const log = getOwnExtensionLog(prototype)?.[property];
    const entry = log?.find(applied => applied.operation.op === 'add');
    if (entry) {
      return entry.identity;
    }
  }
  return null;
}

function applyAdd(
  target: object,
  property: string,
  identity: string,
  operation: AddOperation,
) {
  for (let i = operation.decorators.length - 1; i >= 0; i--) {
    operation.decorators[i](target, property);
  }

  getAppliedLog(target, property).push({identity, operation});
}

function requireOwnMeta(
  target: object,
  property: string,
  identity: string,
  op: string,
): PropertyMetadata<unknown> {
  const own = getPropertyMeta<unknown>(target, property);
  if (own) {
    return own;
  }
  const declaring = chainOf(target).find(prototype =>
    getPropertyMeta(prototype, property),
  );
  if (declaring) {
    throw new Error(
      `extendNode("${identity}"): cannot ${op} property "${property}", it is declared on ${declaring.constructor.name}; extend that class instead`,
    );
  }
  throw new Error(
    `extendNode("${identity}"): cannot ${op} property "${property}", it is not declared on ${target.constructor.name}`,
  );
}

function applyDecorate(
  target: object,
  property: string,
  identity: string,
  operation: AnyDecorateOperation,
) {
  const meta = requireOwnMeta(target, property, identity, 'decorate');
  switch (operation.slot) {
    case 'tweener':
      meta.tweener = operation.wrap(meta.tweener);
      break;
    case 'parser':
      meta.parser = operation.wrap(meta.parser);
      break;
    case 'interpolation':
      meta.interpolationFunction = operation.wrap(meta.interpolationFunction);
      break;
    case 'default':
      meta.default = operation.wrap(meta.default);
      break;
  }
  invalidatePropertyMetaCache();

  getAppliedLog(target, property).push({identity, operation});
}

function checkOperation(
  target: object,
  property: string,
  identity: string,
  operation: ExtensionOperation,
) {
  if (operation.op === 'add') {
    if (property in getPropertiesOf(target)) {
      const adder = findAdder(target, property);
      const owner = adder ? `by "${adder}"` : 'outside of extendNode';
      throw new Error(
        `extendNode("${identity}"): cannot add property "${property}", it is already declared ${owner}`,
      );
    }
    return;
  }

  requireOwnMeta(target, property, identity, operation.op);
  if (operation.op === 'replace') {
    const conflict = getAppliedLog(target, property).find(
      entry =>
        entry.operation.op === 'replace' &&
        entry.operation.slot === operation.slot,
    );
    if (conflict) {
      throw new Error(
        `extendNode("${identity}"): cannot replace slot "${operation.slot}" of property "${property}", already replaced by "${conflict.identity}"`,
      );
    }
  }
}

function applyReplace(
  target: object,
  property: string,
  identity: string,
  operation: AnyReplaceOperation,
) {
  const meta = requireOwnMeta(target, property, identity, 'replace');
  switch (operation.slot) {
    case 'tweener':
      meta.tweener = operation.value;
      break;
    case 'parser':
      meta.parser = operation.value;
      break;
    case 'interpolation':
      meta.interpolationFunction = operation.value;
      break;
    case 'default':
      meta.default = operation.value;
      break;
  }
  invalidatePropertyMetaCache();

  getAppliedLog(target, property).push({identity, operation});
}

/**
 * Register properties and metadata slot decorations on an existing node
 * class.
 *
 * @remarks
 * Re-registering the same identity with the same operations is a no-op; a
 * different set throws. Operations are validated before any of them apply.
 *
 * @example
 * ```ts
 * extendNode(
 *   Shape,
 *   {
 *     rough: {op: 'add', decorators: [initial(false), signal()]},
 *   },
 *   {identity: '@canvas-commons/rough'},
 * );
 * ```
 */
export function extendNode(
  target: Constructor,
  operations: Record<string, ExtensionOperation>,
  {identity}: ExtendNodeOptions,
) {
  const prototype = target.prototype as object;
  const registry = getAppliedRegistry(prototype);
  const fingerprint = fingerprintOf(operations);
  const registered = registry.get(identity);
  if (registered !== undefined) {
    if (registered !== fingerprint) {
      throw new Error(
        `extendNode("${identity}"): already registered on ${prototype.constructor.name} with a different set of operations`,
      );
    }
    return;
  }

  const entries = Object.entries(operations);
  for (const [property, operation] of entries) {
    checkOperation(prototype, property, identity, operation);
  }
  for (const [property, operation] of entries) {
    if (operation.op === 'add') {
      applyAdd(prototype, property, identity, operation);
    } else if (operation.op === 'decorate') {
      applyDecorate(prototype, property, identity, operation);
    } else {
      applyReplace(prototype, property, identity, operation);
    }
  }

  registry.set(identity, fingerprint);
}

/**
 * Register a construction-time hook for every instance of the given class
 * and its subclasses. Re-registering the same identity is a no-op.
 *
 * @example
 * ```ts
 * onInit(Shape, shape => shape.rough(true), {identity: '@canvas-commons/rough'});
 * ```
 */
export function onInit<T extends Constructor>(
  target: T,
  initializer: Initializer<InstanceType<T>>,
  {identity}: ExtendNodeOptions,
) {
  const prototype = target.prototype as object;
  const registry = getAppliedRegistry(prototype);
  const key = `onInit:${identity}`;
  if (registry.has(key)) {
    return;
  }

  addInitializer(prototype, initializer);
  registry.set(key, 'onInit');
}

export interface ExtensionDumpEntry {
  identity: string;
  op: ExtensionOperation['op'];
  slot?: ExtensionSlot;
}

export interface ExtensionDump {
  property: string;
  base: PropertyMetadata<unknown> | null;
  entries: ExtensionDumpEntry[];
}

/**
 * Resolve the chain of contributions made to a property via
 * {@link extendNode}, in application order.
 *
 * @example
 * ```ts
 * const dump = dumpExtensions(Shape, 'rough');
 * ```
 */
export function dumpExtensions(
  target: Constructor,
  property: string,
): ExtensionDump {
  const resolved = getPropertiesOf(target);
  const chain = chainOf(target.prototype as object);

  const entries: ExtensionDumpEntry[] = [];
  for (let i = chain.length - 1; i >= 0; i--) {
    const log = getOwnExtensionLog(chain[i])?.[property];
    if (!log) {
      continue;
    }
    for (const {identity, operation} of log) {
      entries.push({
        identity,
        op: operation.op,
        slot: operation.op === 'add' ? undefined : operation.slot,
      });
    }
  }

  return {
    property,
    base: resolved[property] ?? null,
    entries,
  };
}
