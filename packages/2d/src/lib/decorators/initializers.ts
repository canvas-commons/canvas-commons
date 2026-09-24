const INITIALIZERS = Symbol.for('@canvas-commons/2d/decorators/initializers');

export type Initializer<T> = (instance: T, context?: any) => void;

export type Constructor = new (...args: any[]) => any;

let InitializerEpoch = 0;

const InitializerChainCache = new WeakMap<
  Constructor,
  {epoch: number; initializers: Initializer<any>[]}
>();

export function addInitializer<T>(target: any, initializer: Initializer<T>) {
  if (!Object.prototype.hasOwnProperty.call(target, INITIALIZERS)) {
    target[INITIALIZERS] = [];
  }
  target[INITIALIZERS].push(initializer);
  InitializerEpoch++;
}

function getInitializersOf(ctor: any): Initializer<any>[] {
  if (typeof ctor !== 'function') {
    return [];
  }

  const cached = InitializerChainCache.get(ctor);
  if (cached && cached.epoch === InitializerEpoch) {
    return cached.initializers;
  }

  const chain: any[] = [];
  let prototype = ctor.prototype;
  while (prototype && prototype !== Object.prototype) {
    chain.push(prototype);
    prototype = Object.getPrototypeOf(prototype);
  }

  const initializers: Initializer<any>[] = [];
  for (let i = chain.length - 1; i >= 0; i--) {
    const prototype = chain[i];
    if (Object.prototype.hasOwnProperty.call(prototype, INITIALIZERS)) {
      initializers.push(...prototype[INITIALIZERS]);
    }
  }

  InitializerChainCache.set(ctor, {epoch: InitializerEpoch, initializers});
  return initializers;
}

export function initialize(instance: any, context?: any) {
  const initializers = getInitializersOf(instance.constructor);
  if (initializers.length === 0) {
    return;
  }

  try {
    initializers.forEach(initializer => initializer(instance, context));
  } catch (e: any) {
    e.inspect ??= instance.key;
    throw e;
  }
}
