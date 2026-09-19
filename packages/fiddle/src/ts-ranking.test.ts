import {
  createDefaultMapFromNodeModules,
  createSystem,
  createVirtualTypeScriptEnvironment,
} from '@typescript/vfs';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import ts from 'typescript';
import {beforeAll, describe, expect, test} from 'vitest';
import type {TsCompletionEntry} from './ts-protocol';
import {
  CONTEXTUAL_RESOLUTION_LIMIT,
  RANK_TIER,
  generalBoost,
  rankCompletionEntries,
  type ContextualScope,
} from './ts-ranking';

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: false,
};

// Each source is its own module, the way a fiddle is, so the declarations
// below never collide across the files one run creates.
const PRELUDE = `export {};
class Layout {
  public offset = 0;
}
class Rect extends Layout {
  public radius = 0;
}
function stage(node: Layout) { return node; }
function scaled(factor: number) { return factor; }
`;

type TestEnv = ReturnType<typeof createVirtualTypeScriptEnvironment>;

let Env: TestEnv;
let FileCounter = 0;

interface Ranked {
  entries: TsCompletionEntry[];
  assignabilityChecks: number;
}

function buildEnv(): TestEnv {
  const require = createRequire(import.meta.url);
  const libDirectory = dirname(require.resolve('typescript'));
  const fsMap = createDefaultMapFromNodeModules({}, ts, libDirectory);
  return createVirtualTypeScriptEnvironment(
    createSystem(fsMap),
    [],
    ts,
    COMPILER_OPTIONS,
  );
}

// Everything the worker does for one completion request, minus the message
// passing, with the assignability checks counted so a test can assert the
// bound the contextual pass works under.
function rankAt(source: string, pos: number = source.length): Ranked {
  FileCounter += 1;
  const fileName = `/fiddles/ranking-${FileCounter}/index.tsx`;
  Env.createFile(fileName, source);

  const info = Env.languageService.getCompletionsAtPosition(fileName, pos, {
    includeCompletionsForModuleExports: true,
    includeCompletionsForImportStatements: true,
    includeCompletionsWithInsertText: true,
  });
  const entries = (info?.entries ?? []).map(entry => ({
    name: entry.name,
    kind: entry.kind,
    kindModifiers: entry.kindModifiers,
    sortText: entry.sortText,
    source: entry.source,
  }));

  const program = Env.languageService.getProgram();
  if (!program) throw new Error('the language service has no program');
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) throw new Error(`${fileName} is not part of the program`);

  const checker = program.getTypeChecker();
  let assignabilityChecks = 0;
  const counting: ts.TypeChecker = {
    ...checker,
    isTypeAssignableTo: (source, target) => {
      assignabilityChecks += 1;
      return checker.isTypeAssignableTo(source, target);
    },
  };
  const scope: ContextualScope = {
    program,
    checker: counting,
    moduleResolutionHost: Env.sys,
    sourceFile,
    pos,
  };
  return {entries: rankCompletionEntries(entries, scope), assignabilityChecks};
}

function contextualNames(ranked: Ranked): string[] {
  return ranked.entries
    .filter(entry => entry.section?.rank === 1)
    .map(entry => entry.name);
}

function sectionNameOf(ranked: Ranked): string | undefined {
  return ranked.entries.find(entry => entry.section?.rank === 1)?.section?.name;
}

function boostOf(ranked: Ranked, name: string): number | undefined {
  return ranked.entries.find(entry => entry.name === name)?.boost;
}

describe('ts ranking contextual type partition', () => {
  beforeAll(() => {
    Env = buildEnv();
  }, 60_000);

  test('a numeric argument leads with the number and leaves the string', () => {
    const source = `${PRELUDE}const spin = 3;
const spinner = 'x';
scaled(sp`;
    const ranked = rankAt(source);
    expect(sectionNameOf(ranked)).toBe('number');
    expect(contextualNames(ranked)).toContain('spin');
    expect(contextualNames(ranked)).not.toContain('spinner');
  });

  test('no keyword reaches the contextual group', () => {
    const source = `${PRELUDE}const spin = 3;
scaled(s`;
    const ranked = rankAt(source);
    const keywords = ranked.entries.filter(entry => entry.kind === 'keyword');
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.every(entry => entry.section?.rank !== 1)).toBe(true);
  });

  test('a class-typed parameter groups the class and its subclass', () => {
    const source = `${PRELUDE}stage(`;
    const ranked = rankAt(source);
    const names = contextualNames(ranked);
    expect(sectionNameOf(ranked)).toBe('Layout');
    expect(names).toContain('Layout');
    expect(names).toContain('Rect');
    expect(names).not.toContain('scaled');
  });

  test('a subclass outranks a same-prefix lib global', () => {
    const source = `${PRELUDE}stage(Re`;
    const ranked = rankAt(source);
    expect(contextualNames(ranked)).toEqual(['Rect']);
    expect(boostOf(ranked, 'Rect')).toBe(RANK_TIER.inScope);
    const libGlobal = ranked.entries.find(
      entry => entry.name === 'ReadableStream',
    );
    expect(libGlobal?.section?.rank).toBe(2);
  });

  test('a function returning the contextual type is not a match', () => {
    const source = `${PRELUDE}const spun = 3;
function spunFactory(): number { return 1; }
scaled(spun`;
    const ranked = rankAt(source);
    expect(contextualNames(ranked)).toContain('spun');
    expect(contextualNames(ranked)).not.toContain('spunFactory');
  });

  test('partitions rather than filters: every entry keeps a section', () => {
    const ranked = rankAt(`${PRELUDE}stage(Re`);
    expect(ranked.entries.length).toBeGreaterThan(100);
    expect(ranked.entries.every(entry => entry.section !== undefined)).toBe(
      true,
    );
    const tail = ranked.entries.filter(entry => entry.section?.rank === 2);
    expect(tail.length).toBeGreaterThan(0);
  });

  test('leaves the list unsectioned where there is no contextual type', () => {
    const ranked = rankAt(`${PRELUDE}const z = re`);
    expect(ranked.entries.some(entry => entry.name === 'Rect')).toBe(true);
    expect(ranked.entries.every(entry => entry.section === undefined)).toBe(
      true,
    );
  });

  test('resolves no more entry types per request than the bound allows', () => {
    const ranked = rankAt(`${PRELUDE}stage(`);
    expect(ranked.entries.length).toBeGreaterThan(CONTEXTUAL_RESOLUTION_LIMIT);
    expect(ranked.assignabilityChecks).toBeGreaterThan(0);
    expect(ranked.assignabilityChecks).toBeLessThanOrEqual(
      CONTEXTUAL_RESOLUTION_LIMIT,
    );
  });

  test('skips the pass where the position has no contextual type', () => {
    expect(rankAt(`${PRELUDE}const z = re`).assignabilityChecks).toBe(0);
  });
});

describe('ts ranking general boost', () => {
  beforeAll(() => {
    Env = buildEnv();
  }, 60_000);

  test('an unimported export outranks a keyword', () => {
    const unimported: TsCompletionEntry = {
      name: 'createRef',
      kind: 'function',
      sortText: '16',
      source: '@canvas-commons/core',
    };
    const keyword: TsCompletionEntry = {
      name: 'const',
      kind: 'keyword',
      sortText: '15',
    };
    expect(generalBoost(unimported)).toBe(RANK_TIER.autoImport);
    expect(generalBoost(unimported)).toBeGreaterThan(generalBoost(keyword));
  });

  test('ranks in-scope symbols above lib globals, keywords last', () => {
    const source = `${PRELUDE}const localColor = 1;
const z = co`;
    const ranked = rankAt(source);
    expect(boostOf(ranked, 'localColor')).toBe(RANK_TIER.inScope);
    expect(boostOf(ranked, 'confirm')).toBe(RANK_TIER.ambientGlobal);
    expect(boostOf(ranked, 'const')).toBe(RANK_TIER.keyword);
  });

  test('demotes a deprecated entry below its own tier', () => {
    const deprecated: TsCompletionEntry = {
      name: 'escape',
      kind: 'function',
      sortText: 'z15',
    };
    const plain: TsCompletionEntry = {
      name: 'encodeURI',
      kind: 'function',
      sortText: '15',
    };
    expect(generalBoost(deprecated)).toBeLessThan(generalBoost(plain));
    expect(generalBoost(deprecated)).toBeLessThan(RANK_TIER.keyword);
  });

  test('never returns zero for a deprecated entry', () => {
    const entry: TsCompletionEntry = {name: 'x', kind: 'var', sortText: 'z15'};
    expect(generalBoost(entry)).not.toBe(0);
  });

  test('stamps a boost on every entry', () => {
    const ranked = rankAt(`${PRELUDE}const z = re`);
    expect(ranked.entries.every(entry => typeof entry.boost === 'number')).toBe(
      true,
    );
  });
});
