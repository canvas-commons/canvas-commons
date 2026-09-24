import {SimpleSignal} from '@canvas-commons/core';
import {describe, expect, test, vi} from 'vitest';
import {computed} from './computed';
import {dumpExtensions, extendNode, onInit} from './extendNode';
import {
  getPropertiesOf,
  initial,
  initializeSignals,
  parser,
  signal,
} from './signal';

interface Roughable {
  rough: SimpleSignal<boolean>;
}

describe('extendNode: add', () => {
  test('contributes a working signal, visible and constructible on subclasses declared before registration', () => {
    class Base {
      public constructor(props: {rough?: boolean} = {}) {
        initializeSignals(this, props);
      }
    }

    class Derived extends Base {}

    extendNode(
      Base,
      {rough: {op: 'add', decorators: [initial(false), signal()]}},
      {identity: '@canvas-commons/rough'},
    );

    expect(Object.keys(getPropertiesOf(Derived))).toContain('rough');

    const instance = new Derived({rough: true}) as Derived & Roughable;
    expect(instance.rough()).toBe(true);

    const defaulted = new Derived() as Derived & Roughable;
    expect(defaulted.rough()).toBe(false);
  });

  test('throws when the property already exists as an own property', () => {
    class Owner {
      @initial(1)
      @signal()
      declare public readonly length: SimpleSignal<number>;

      public constructor() {
        initializeSignals(this, {});
      }
    }

    expect(() =>
      extendNode(
        Owner,
        {length: {op: 'add', decorators: [initial(2), signal()]}},
        {identity: '@canvas-commons/other'},
      ),
    ).toThrow(/length/);
  });

  test('throws when the property already exists on an inherited class, naming both identities', () => {
    class Base {
      public constructor() {
        initializeSignals(this, {});
      }
    }

    class Derived extends Base {}

    extendNode(
      Base,
      {tint: {op: 'add', decorators: [initial('red'), signal()]}},
      {identity: '@canvas-commons/first'},
    );

    expect(() =>
      extendNode(
        Derived,
        {tint: {op: 'add', decorators: [initial('blue'), signal()]}},
        {identity: '@canvas-commons/second'},
      ),
    ).toThrow(
      /@canvas-commons\/second.*@canvas-commons\/first|@canvas-commons\/first.*@canvas-commons\/second/s,
    );
  });
});

describe('extendNode: decorate', () => {
  test('stacks two decorations on parser in registration order', () => {
    class Owner {
      @initial(0)
      @parser((value: number) => value)
      @signal()
      declare public readonly value: SimpleSignal<number>;

      public constructor(props: {value?: number} = {}) {
        initializeSignals(this, props);
      }
    }

    extendNode(
      Owner,
      {
        value: {
          op: 'decorate',
          slot: 'parser',
          wrap: next => (raw: number) => (next ? Number(next(raw)) : raw) + 1,
        },
      },
      {identity: '@canvas-commons/plus-one'},
    );

    extendNode(
      Owner,
      {
        value: {
          op: 'decorate',
          slot: 'parser',
          wrap: next => (raw: number) => (next ? Number(next(raw)) : raw) * 2,
        },
      },
      {identity: '@canvas-commons/times-two'},
    );

    const instance = new Owner();
    instance.value(5);
    expect(instance.value()).toBe((5 + 1) * 2);
  });

  test('decorates the tweener slot', () => {
    class Owner {
      @initial(0)
      @signal()
      declare public readonly value: SimpleSignal<number>;

      public constructor() {
        initializeSignals(this, {});
      }
    }

    const tweener = vi.fn();
    extendNode(
      Owner,
      {
        value: {
          op: 'decorate',
          slot: 'tweener',
          wrap: () => tweener,
        },
      },
      {identity: '@canvas-commons/custom-tweener'},
    );

    const meta = getPropertiesOf(Owner).value;
    meta.tweener?.(
      1,
      1,
      t => t,
      (a, b, t) => a + (b - a) * t,
    );
    expect(tweener).toHaveBeenCalledOnce();
  });

  test('decorates the default slot', () => {
    class Owner {
      @initial(1)
      @signal()
      declare public readonly value: SimpleSignal<number>;

      public constructor() {
        initializeSignals(this, {});
      }
    }

    extendNode(
      Owner,
      {
        value: {
          op: 'decorate',
          slot: 'default',
          wrap: next => (typeof next === 'number' ? next * 10 : next),
        },
      },
      {identity: '@canvas-commons/scaled-default'},
    );

    const instance = new Owner();
    expect(instance.value()).toBe(10);
  });
});

describe('extendNode: replace', () => {
  test('works once; a second replace from a different identity throws naming both; the same identity is a no-op', () => {
    class Owner {
      @initial(0)
      @parser((value: number) => value)
      @signal()
      declare public readonly value: SimpleSignal<number>;

      public constructor() {
        initializeSignals(this, {});
      }
    }

    const strict = (raw: number) => Math.max(0, raw);
    extendNode(
      Owner,
      {value: {op: 'replace', slot: 'parser', value: strict}},
      {identity: '@canvas-commons/strict'},
    );

    expect(getPropertiesOf(Owner).value.parser).toBe(strict);

    expect(() =>
      extendNode(
        Owner,
        {
          value: {
            op: 'replace',
            slot: 'parser',
            value: (raw: number) => raw,
          },
        },
        {identity: '@canvas-commons/other'},
      ),
    ).toThrow(/@canvas-commons\/strict/);

    expect(() =>
      extendNode(
        Owner,
        {
          value: {
            op: 'replace',
            slot: 'parser',
            value: (raw: number) => raw,
          },
        },
        {identity: '@canvas-commons/other'},
      ),
    ).toThrow(/@canvas-commons\/other/);

    extendNode(
      Owner,
      {value: {op: 'replace', slot: 'parser', value: strict}},
      {identity: '@canvas-commons/strict'},
    );
    expect(getPropertiesOf(Owner).value.parser).toBe(strict);
  });
});

describe('extendNode: idempotent re-registration', () => {
  test('re-registering the same identity does not double-apply decorators or stack decorations again', () => {
    class Owner {
      public constructor(props: {rough?: boolean} = {}) {
        initializeSignals(this, props);
      }
    }

    const decorators = {
      rough: {op: 'add' as const, decorators: [initial(false), signal()]},
    };

    extendNode(Owner, decorators, {identity: '@canvas-commons/rough'});
    extendNode(Owner, decorators, {identity: '@canvas-commons/rough'});

    const instance = new Owner() as Owner & Roughable;
    expect(instance.rough()).toBe(false);

    class Stacked {
      @initial(1)
      @signal()
      declare public readonly value: SimpleSignal<number>;

      public constructor() {
        initializeSignals(this, {});
      }
    }

    const calls: number[] = [];
    const stackOp = {
      value: {
        op: 'decorate' as const,
        slot: 'default' as const,
        wrap: (next: unknown) => {
          calls.push(1);
          return next;
        },
      },
    };

    extendNode(Stacked, stackOp, {identity: '@canvas-commons/stack'});
    extendNode(Stacked, stackOp, {identity: '@canvas-commons/stack'});

    expect(calls).toHaveLength(1);
  });
});

describe('extendNode: atomicity', () => {
  test('a registration with one invalid operation applies nothing', () => {
    class Owner {
      public constructor(props: {rough?: boolean} = {}) {
        initializeSignals(this, props);
      }
    }

    expect(() =>
      extendNode(
        Owner,
        {
          rough: {op: 'add', decorators: [initial(false), signal()]},
          missing: {op: 'decorate', slot: 'default', wrap: next => next},
        },
        {identity: '@canvas-commons/partial'},
      ),
    ).toThrow(/missing/);

    expect(Object.keys(getPropertiesOf(Owner))).not.toContain('rough');
    expect(() => new Owner()).not.toThrow();
  });

  test('re-registering the same identity with different operations throws', () => {
    class Owner {
      public constructor(props: {rough?: boolean} = {}) {
        initializeSignals(this, props);
      }
    }

    extendNode(
      Owner,
      {rough: {op: 'add', decorators: [initial(false), signal()]}},
      {identity: '@canvas-commons/drift'},
    );

    expect(() =>
      extendNode(
        Owner,
        {smooth: {op: 'add', decorators: [initial(true), signal()]}},
        {identity: '@canvas-commons/drift'},
      ),
    ).toThrow(/@canvas-commons\/drift.*different set of operations/);
  });
});

describe('onInit', () => {
  test('runs for the class and subclasses, once per construction, and is idempotent under re-registration', () => {
    class Base {
      public constructor() {
        initializeSignals(this, {});
      }
    }

    class Derived extends Base {}

    const hook = vi.fn();
    onInit(Base, hook, {identity: '@canvas-commons/hook'});
    onInit(Base, hook, {identity: '@canvas-commons/hook'});

    new Base();
    new Derived();

    expect(hook).toHaveBeenCalledTimes(2);
  });
});

describe('dumpExtensions', () => {
  test('reports a base value plus a decoration in application order', () => {
    class Owner {
      @initial(1)
      @signal()
      declare public readonly value: SimpleSignal<number>;

      public constructor() {
        initializeSignals(this, {});
      }
    }

    extendNode(
      Owner,
      {
        value: {
          op: 'decorate',
          slot: 'default',
          wrap: next => next,
        },
      },
      {identity: '@canvas-commons/dump-me'},
    );

    const dump = dumpExtensions(Owner, 'value');
    expect(dump.property).toBe('value');
    expect(dump.base?.default).toBe(1);
    expect(dump.entries).toEqual([
      {identity: '@canvas-commons/dump-me', op: 'decorate', slot: 'default'},
    ]);
  });
});

describe('extendNode: decorate targets the declaring class', () => {
  test('throws when the property is declared on an ancestor, naming it', () => {
    class Base {
      @initial(1)
      @signal()
      declare public readonly value: SimpleSignal<number>;

      public constructor() {
        initializeSignals(this, {});
      }
    }

    class Derived extends Base {}

    expect(() =>
      extendNode(
        Derived,
        {value: {op: 'decorate', slot: 'default', wrap: next => next}},
        {identity: '@canvas-commons/misplaced'},
      ),
    ).toThrow(/declared on Base/);
  });

  test('throws when the property does not exist', () => {
    class Owner {
      public constructor() {
        initializeSignals(this, {});
      }
    }

    expect(() =>
      extendNode(
        Owner,
        {missing: {op: 'decorate', slot: 'default', wrap: next => next}},
        {identity: '@canvas-commons/typo'},
      ),
    ).toThrow(/not declared on Owner/);
  });
});

describe('decorate shadowing semantics', () => {
  test('a base-class decoration does not apply once a subclass redeclares the property with @signal', () => {
    class Base {
      @initial(1)
      @signal()
      declare public readonly value: SimpleSignal<number>;

      public constructor() {
        initializeSignals(this, {});
      }
    }

    extendNode(
      Base,
      {
        value: {
          op: 'decorate',
          slot: 'default',
          wrap: () => 99,
        },
      },
      {identity: '@canvas-commons/base-decoration'},
    );

    expect(new Base().value()).toBe(99);

    class Redeclared extends Base {
      @initial(1)
      @signal()
      declare public readonly value: SimpleSignal<number>;

      public constructor() {
        super();
      }
    }

    expect(new Redeclared().value()).toBe(1);
  });
});

describe('onInit contributing a computed-style method', () => {
  test('contributes a cached computed method via onInit', () => {
    class Owner {
      public label() {
        return 'base';
      }

      public constructor() {
        initializeSignals(this, {});
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      Owner.prototype,
      'label',
    );
    if (!descriptor) {
      throw new Error('expected "label" to be declared on Owner');
    }
    computed()(Owner.prototype, 'label', descriptor);

    onInit(
      Owner,
      instance => {
        const method = instance.label;
        instance.label = () => `computed:${method.call(instance)}`;
      },
      {identity: '@canvas-commons/computed-label'},
    );

    class Derived extends Owner {}

    expect(new Derived().label()).toBe('computed:base');
  });
});
