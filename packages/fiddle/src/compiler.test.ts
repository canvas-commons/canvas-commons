import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'fs';
import {createRequire} from 'module';
import {dirname, join} from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {describe, expect, it} from 'vitest';
import {compileFiddle} from './compiler';

const DECORATOR_SCENE_SOURCE = `
import {initial, signal, Circle} from '@canvas-commons/2d';
import type {SimpleSignal} from '@canvas-commons/core';

export class Blob extends Circle {
  @initial(0)
  @signal()
  public declare readonly progress: SimpleSignal<number, this>;

  radius = 100;

  render() {
    return <Blob progress={this.progress()} />;
  }
}
`;

function fileUrlFor(specifier: string): string {
  return pathToFileURL(createRequire(import.meta.url).resolve(specifier)).href;
}

// Stands in for the import map a real frame document serves, so the compiled
// output's bare specifiers resolve under a plain dynamic import in Node.
function remapForExecution(code: string): string {
  return code
    .split('@canvas-commons/2d/jsx-runtime')
    .join(fileUrlFor('@canvas-commons/2d/jsx-runtime'))
    .split('@canvas-commons/2d')
    .join(fileUrlFor('@canvas-commons/2d'))
    .split('@canvas-commons/core')
    .join(fileUrlFor('@canvas-commons/core'));
}

// Inside the package rather than the system temp directory: the test runner
// only loads modules from within its own root.
const SCRATCH_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  '.fiddle-exec',
);

async function importCompiled(code: string): Promise<Record<string, unknown>> {
  mkdirSync(SCRATCH_ROOT, {recursive: true});
  const directory = mkdtempSync(join(SCRATCH_ROOT, 'run-'));
  const filePath = join(directory, 'compiled.mjs');
  writeFileSync(filePath, remapForExecution(code));
  try {
    return (await import(pathToFileURL(filePath).href)) as Record<
      string,
      unknown
    >;
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

describe('compileFiddle import allowlist', () => {
  it('passes the three engine specifiers through', () => {
    for (const specifier of [
      '@canvas-commons/core',
      '@canvas-commons/2d',
      '@canvas-commons/2d/jsx-runtime',
    ]) {
      const {code, diagnostics} = compileFiddle(
        `import * as engine from '${specifier}';\nexport default engine;`,
      );
      expect(diagnostics).toEqual([]);
      expect(code).toContain(specifier);
    }
  });

  it('rejects a deep subpath of an allowed package', () => {
    const {diagnostics} = compileFiddle(
      `import {createSignal} from '@canvas-commons/core/lib/signals';`,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({severity: 'error'});
    expect(diagnostics[0].message).toContain(
      '@canvas-commons/core/lib/signals',
    );
  });

  it('rejects an unknown bare package', () => {
    const {diagnostics} = compileFiddle(`import {debounce} from 'lodash';`);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({severity: 'error'});
  });

  it('rejects a package that is no longer aliased', () => {
    const {diagnostics} = compileFiddle(
      `import {Vector2} from '@motion-canvas/core';`,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({severity: 'error'});
  });

  it('rejects re-exporting from an unknown package', () => {
    expect(
      compileFiddle(`export {debounce} from 'lodash';`).diagnostics,
    ).toHaveLength(1);
    expect(compileFiddle(`export * from 'lodash';`).diagnostics).toHaveLength(
      1,
    );
  });

  it('rejects a dynamic import of an unknown package', () => {
    const {diagnostics} = compileFiddle(`const mod = await import('lodash');`);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
  });

  it('rejects a dynamic import whose specifier is not a literal', () => {
    for (const source of [
      `const name = 'lodash';\nconst mod = await import(name);`,
      'const mod = await import(`lodash`);',
    ]) {
      const {diagnostics} = compileFiddle(source);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('string literal');
    }
  });

  it('rejects a relative import', () => {
    const {diagnostics} = compileFiddle(`import {helper} from './helper';`);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
  });

  it('lets extraSpecifiers widen the allowlist', () => {
    const {code, diagnostics} = compileFiddle(
      `import {thing} from '@my-org/component-library';
export default thing;`,
      {extraSpecifiers: ['@my-org/component-library']},
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain('@my-org/component-library');
  });

  it('sees an import whose binding is never used as a value', () => {
    const {diagnostics} = compileFiddle(`import {debounce} from 'lodash';`);
    expect(diagnostics).toHaveLength(1);
  });

  it('sees a side-effect import of an unknown package', () => {
    const {diagnostics} = compileFiddle(`import 'lodash';`);
    expect(diagnostics).toHaveLength(1);
  });
});

describe('compileFiddle type-only bindings', () => {
  it('elides a type used through a value import', () => {
    const {code, diagnostics} = compileFiddle(
      `import {Circle, CircleProps} from '@canvas-commons/2d';
       export const make = (props: CircleProps) => new Circle(props);`,
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain('Circle');
    expect(code).not.toContain('CircleProps');
  });
});

describe('compileFiddle decorators and class fields', () => {
  it('preserves decorated fields when source bindings share Babel helper names', async () => {
    const {code, diagnostics} = compileFiddle(`
      export const _applyDecoratedDescriptor = 'descriptor';
      export const _initializerDefineProperty = 'initializer';
      function initial(target: object, name: string) {
        Object.defineProperty(target, name, {value: 7});
      }
      class Counter {
        @initial
        public value: number;
      }
      export default new Counter().value;
    `);
    expect(diagnostics).toEqual([]);
    expect((await importCompiled(code)).default).toBe(7);
  });

  it('compiles a decorated component with no errors', () => {
    const {diagnostics} = compileFiddle(DECORATOR_SCENE_SOURCE);
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('strips decorators and declare fields', () => {
    const {code} = compileFiddle(DECORATOR_SCENE_SOURCE);
    expect(code).not.toMatch(/^\s*@\w+/m);
    expect(code).not.toMatch(/\bdeclare\b/);
  });

  it('emits the engine JSX runtime import', () => {
    const {code} = compileFiddle(DECORATOR_SCENE_SOURCE);
    expect(code).toContain('@canvas-commons/2d/jsx-runtime');
  });

  it('leaves a valueless decorated field to its decorators', () => {
    const {code} = compileFiddle(DECORATOR_SCENE_SOURCE);
    expect(code).toContain('_applyDecoratedDescriptor');
    expect(code).not.toContain('_initializerDefineProperty(this');
  });

  it('still writes a decorated field that declares a value', () => {
    const {code} = compileFiddle(`
      import {signal} from '@canvas-commons/2d';
      export class Widget {
        @signal()
        public value = 5;
      }
    `);
    expect(code).toContain('_initializerDefineProperty(this');
  });

  it('accepts a decorator on a declare field', () => {
    const source = `
      import {signal} from '@canvas-commons/2d';
      class Widget {
        @signal()
        public declare readonly value: number;
      }
      export default Widget;
    `;
    expect(() => compileFiddle(source)).not.toThrow();
    const {diagnostics} = compileFiddle(source);
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });
});

describe('compileFiddle parse errors', () => {
  it('reports instead of throwing', () => {
    expect(() => compileFiddle('const x = ;')).not.toThrow();
    const {diagnostics, code} = compileFiddle('const x = ;');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(code).toBe('');
  });

  it('positions the error', () => {
    const {diagnostics} = compileFiddle('class {');
    expect(diagnostics[0].from).toBeGreaterThanOrEqual(0);
    expect(diagnostics[0].to).toBeGreaterThanOrEqual(0);
  });
});

describe('compileFiddle execution', () => {
  it('preserves inherited values for fields without initializers', async () => {
    const {code, diagnostics} = compileFiddle(`
      import {Vector2} from '@canvas-commons/core';

      class Point extends Vector2 {
        public x: number;
      }

      export default new Point(3, 4).x;
    `);
    expect(diagnostics).toEqual([]);
    expect((await importCompiled(code)).default).toBe(3);
  });

  it('preserves computed keys without assigning uninitialized fields', async () => {
    const {code, diagnostics} = compileFiddle(`
      const keys: string[] = [];
      function key(name: string) {
        keys.push(name);
        return name;
      }
      class Base {
        static count = 2;
        value = 3;
        reset = 4;
      }
      const Derived = class extends Base {
        static [key('count')]: number;
        [key('value')]: number;
        reset = undefined;
      };
      const instance = new Derived();
      export default [Derived.count, instance.value, instance.reset, keys];
    `);
    expect(diagnostics).toEqual([]);
    expect((await importCompiled(code)).default).toEqual([
      2,
      3,
      undefined,
      ['count', 'value'],
    ]);
  });

  it('executes private methods and static blocks alongside decorators', async () => {
    const {code, diagnostics} = compileFiddle(`
      function initial(target: object, name: string) {
        Object.defineProperty(target, name, {value: 7});
      }
      class Counter {
        @initial
        public value: number;
        #count: number;
        static total = 1;
        static {
          this.total += 2;
        }
        #read() {
          return [this.value, #count in this, Counter.total];
        }
        read() {
          return this.#read();
        }
      }
      export default new Counter().read();
    `);
    expect(diagnostics).toEqual([]);
    expect((await importCompiled(code)).default).toEqual([7, true, 3]);
  });

  it('produces a module that reaches the engine component machinery', async () => {
    const {code, diagnostics} = compileFiddle(`
      import {initial, signal, Node} from '@canvas-commons/2d';

      export class Counter extends Node {
        @initial(5)
        @signal()
        public declare readonly value: unknown;
      }
    `);
    expect(diagnostics).toEqual([]);

    const moduleExports = await importCompiled(code);
    const counter = moduleExports.Counter;
    expect(typeof counter).toBe('function');

    // `Node`'s constructor calls `useScene()`, which only the harness supplies.
    const construct = (): unknown =>
      new (counter as new (props: unknown) => unknown)({});
    expect(construct).toThrow(/scene is not available/i);
  });
});
