import {createSystem, createVirtualCompilerHost} from '@typescript/vfs';
import {existsSync, readFileSync} from 'fs';
import {createRequire} from 'module';
import {dirname, join, relative} from 'path';
import ts from 'typescript';

/**
 * One declaration file in a type pack, keyed by the virtual path the browser
 * resolves it under.
 */
export interface TypePackFile {
  path: string;
  text: string;
}

/**
 * A self-contained closure of declaration files the browser-side language
 * service loads in place of a real `node_modules` tree.
 */
export interface TypePack {
  tsVersion: string;
  compilerOptions: ts.CompilerOptions;
  files: TypePackFile[];
  libFileNames: string[];
  /**
   * The vendored packages' entry declarations. The worker registers these as
   * script roots so it can offer symbols from a package the fiddle has not
   * imported yet.
   */
  rootPaths: string[];
  /**
   * Ambient declarations nothing imports by specifier. They only reach the
   * program if the worker registers them as script roots directly.
   */
  ambientPaths: string[];
}

const CALLBACK_STUB_PATH = '/lib.fiddle-globals.d.ts';

const CALLBACK_STUB_DTS =
  'declare type Callback = (...args: never[]) => void;\n';

const BASE_COMPILER_OPTIONS = {
  target: 'ES2022',
  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  module: 'Preserve',
  moduleResolution: 'Bundler',
  jsx: 'react-jsx',
  jsxImportSource: '@canvas-commons/2d',
  experimentalDecorators: true,
  useDefineForClassFields: false,
  strict: false,
  skipLibCheck: true,
  types: [],
  noEmit: true,
  moduleDetection: 'force',
};

const ROOT_LIB_FILES = [
  'lib.es2022.d.ts',
  'lib.dom.d.ts',
  'lib.dom.iterable.d.ts',
];

function normalize(path: string): string {
  return path.replace(/\\/g, '/');
}

interface PackageLocation {
  name: string;
  root: string;
}

const PACKAGE_LOCATIONS = new Map<string, PackageLocation>();

/**
 * Finds the package an absolute file path belongs to by walking up to its
 * `package.json`.
 *
 * @example
 * ```ts
 * findPackageLocation('/repo/packages/core/lib/index.d.ts');
 * // {name: '@canvas-commons/core', root: '/repo/packages/core'}
 * ```
 */
export function findPackageLocation(realPath: string): PackageLocation {
  let directory = normalize(dirname(realPath));
  const start = directory;
  for (;;) {
    const cached = PACKAGE_LOCATIONS.get(directory);
    if (cached) return cached;
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest)) {
      const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
      const name =
        typeof parsed === 'object' &&
        parsed !== null &&
        'name' in parsed &&
        typeof parsed.name === 'string'
          ? parsed.name
          : null;
      if (name !== null) {
        const location = {name, root: directory};
        PACKAGE_LOCATIONS.set(directory, location);
        return location;
      }
    }
    const parent = normalize(dirname(directory));
    if (parent === directory) {
      throw new Error(`[type-pack] No package.json above ${start}`);
    }
    directory = parent;
  }
}

/**
 * Maps a real file path onto the virtual `node_modules` layout the browser
 * resolves against, so a workspace link and an installed package look alike.
 *
 * @example
 * ```ts
 * toVirtualPath('/repo/packages/2d/lib/index.d.ts');
 * // '/node_modules/@canvas-commons/2d/lib/index.d.ts'
 * ```
 */
export function toVirtualPath(realPath: string): string {
  const {name, root} = findPackageLocation(realPath);
  const rest = normalize(relative(root, normalize(realPath)));
  return `/node_modules/${name}/${rest}`;
}

function packageNameFromVirtualPath(virtualPath: string): string {
  const parts = virtualPath.slice('/node_modules/'.length).split('/');
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

interface WalkContext {
  files: Map<string, string>;
  visitedPackages: Set<string>;
  queue: string[];
  seen: Set<string>;
}

function copyPackageManifest(context: WalkContext, realPath: string): void {
  const {name, root} = findPackageLocation(realPath);
  if (context.visitedPackages.has(name)) return;
  context.visitedPackages.add(name);
  const virtualPath = `/node_modules/${name}/package.json`;
  if (context.files.has(virtualPath)) return;
  context.files.set(
    virtualPath,
    readFileSync(join(root, 'package.json'), 'utf8'),
  );
}

function enqueue(context: WalkContext, realPath: string): void {
  const key = normalize(realPath);
  if (context.seen.has(key)) return;
  context.seen.add(key);
  context.queue.push(key);
}

function walkFile(
  context: WalkContext,
  realPath: string,
  compilerOptions: ts.CompilerOptions,
): void {
  const text = readFileSync(realPath, 'utf8');
  context.files.set(toVirtualPath(realPath), text);
  copyPackageManifest(context, realPath);

  const info = ts.preProcessFile(text, true, false);

  for (const imported of info.importedFiles) {
    const resolved = ts.resolveModuleName(
      imported.fileName,
      realPath,
      compilerOptions,
      ts.sys,
    ).resolvedModule?.resolvedFileName;
    if (!resolved) {
      throw new Error(
        `[type-pack] Could not resolve "${imported.fileName}" imported from ` +
          `${realPath}. Every import in the closure must resolve.`,
      );
    }
    enqueue(context, resolved);
  }

  for (const reference of info.referencedFiles) {
    const resolved = normalize(join(dirname(realPath), reference.fileName));
    if (!existsSync(resolved)) {
      throw new Error(
        `[type-pack] Unresolved reference path "${reference.fileName}" in ` +
          realPath,
      );
    }
    enqueue(context, resolved);
  }

  if (info.libReferenceDirectives.length > 0) {
    const names = info.libReferenceDirectives.map(l => l.fileName).join(', ');
    throw new Error(
      `[type-pack] ${realPath} references libs (${names}); the lib closure is ` +
        `built separately.`,
    );
  }

  for (const typeReference of info.typeReferenceDirectives) {
    const resolved = ts.resolveTypeReferenceDirective(
      typeReference.fileName,
      realPath,
      compilerOptions,
      ts.sys,
    ).resolvedTypeReferenceDirective?.resolvedFileName;
    if (!resolved) {
      throw new Error(
        `[type-pack] Could not resolve type reference ` +
          `"${typeReference.fileName}" in ${realPath}`,
      );
    }
    enqueue(context, resolved);
  }
}

/**
 * Builds the compiler options both the pack and its validation run under.
 *
 * @example
 * ```ts
 * const options = typePackCompilerOptions(process.cwd());
 * ```
 */
export function typePackCompilerOptions(
  packageRoot: string,
): ts.CompilerOptions {
  const converted = ts.convertCompilerOptionsFromJson(
    BASE_COMPILER_OPTIONS,
    packageRoot,
  );
  if (converted.errors.length > 0) {
    const messages = converted.errors
      .map(error => ts.flattenDiagnosticMessageText(error.messageText, ' '))
      .join('; ');
    throw new Error(`[type-pack] Invalid compilerOptions: ${messages}`);
  }
  return converted.options;
}

/**
 * Resolves a package specifier to its declaration entry.
 *
 * Node's own resolver follows the runtime condition, which finds the compiled
 * JavaScript instead.
 *
 * @example
 * ```ts
 * resolveTypesEntry(root, '@canvas-commons/core', options);
 * ```
 */
export function resolveTypesEntry(
  packageRoot: string,
  specifier: string,
  compilerOptions: ts.CompilerOptions,
): string {
  const containingFile = normalize(join(packageRoot, 'type-pack-root.ts'));
  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    compilerOptions,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  if (!resolved || !resolved.endsWith('.d.ts')) {
    throw new Error(
      `[type-pack] Could not resolve a declaration entry for "${specifier}" ` +
        `(got ${resolved ?? 'nothing'}). Build the package first.`,
    );
  }
  return normalize(resolved);
}

function typeScriptLibDirectory(): string {
  const require = createRequire(import.meta.url);
  return normalize(
    join(dirname(require.resolve('typescript/package.json')), 'lib'),
  );
}

function buildLibClosure(): {files: TypePackFile[]; libFileNames: string[]} {
  const libDirectory = typeScriptLibDirectory();
  const files = new Map<string, string>();
  const seen = new Set<string>();
  const queue = [...ROOT_LIB_FILES];
  const libFileNames: string[] = [];

  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    const realPath = join(libDirectory, name);
    if (!existsSync(realPath)) continue;
    const text = readFileSync(realPath, 'utf8');
    files.set(`/${name}`, text);
    libFileNames.push(name);

    const info = ts.preProcessFile(text, false, false);
    for (const reference of info.libReferenceDirectives) {
      queue.push(`lib.${reference.fileName}.d.ts`);
    }
    for (const reference of info.referencedFiles) {
      queue.push(reference.fileName);
    }
  }

  return {
    files: [...files].map(([path, text]) => ({path, text})),
    libFileNames,
  };
}

function validateClosure(
  files: TypePackFile[],
  compilerOptions: ts.CompilerOptions,
  rootPaths: string[],
): void {
  const fileMap = new Map(files.map(file => [file.path, file.text]));
  const validationOptions: ts.CompilerOptions = {
    ...compilerOptions,
    skipLibCheck: false,
  };
  const {compilerHost} = createVirtualCompilerHost(
    createSystem(fileMap),
    validationOptions,
    ts,
  );
  const program = ts.createProgram({
    rootNames: rootPaths,
    options: validationOptions,
    host: compilerHost,
  });

  const sourceFiles = program.getSourceFiles();
  const errors = [
    ...program.getOptionsDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...sourceFiles.flatMap(file => [...program.getSemanticDiagnostics(file)]),
  ].filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const formatted = errors
      .map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
      .join('\n---\n');
    throw new Error(
      `[type-pack] Closure does not type-check cleanly:\n${formatted}`,
    );
  }

  const reachable = new Set(sourceFiles.map(file => file.fileName));
  const unreachable = files
    .map(file => file.path)
    .filter(path => path.endsWith('.d.ts') && !reachable.has(path));
  if (unreachable.length > 0) {
    throw new Error(
      `[type-pack] ${unreachable.length} declaration file(s) ship but are ` +
        `unreachable from any root: ${unreachable.slice(0, 10).join(', ')}` +
        `${unreachable.length > 10 ? ', ...' : ''}`,
    );
  }
}

/**
 * Builds the type pack: every declaration file reachable from the vendored
 * packages' entries, plus the requested lib closure, checked as one program.
 *
 * Throws on a specifier it cannot resolve, because a gap here becomes a
 * completion that silently disappears in the browser.
 *
 * @example
 * ```ts
 * const pack = buildTypePack(root, ['@canvas-commons/core']);
 * await writeFile('types.json', JSON.stringify(pack));
 * ```
 */
export function buildTypePack(
  packageRoot: string,
  specifiers: string[],
): TypePack {
  const compilerOptions = typePackCompilerOptions(packageRoot);
  const entries = specifiers.map(specifier => ({
    specifier,
    realEntryPath: resolveTypesEntry(packageRoot, specifier, compilerOptions),
  }));

  const context: WalkContext = {
    files: new Map(),
    visitedPackages: new Set(),
    queue: [],
    seen: new Set(),
  };

  for (const entry of entries) {
    enqueue(context, entry.realEntryPath);
  }
  while (context.queue.length > 0) {
    const next = context.queue.shift();
    if (next === undefined) break;
    walkFile(context, next, compilerOptions);
  }

  context.files.set(CALLBACK_STUB_PATH, CALLBACK_STUB_DTS);

  const paths: Record<string, string[]> = {};
  for (const entry of entries) {
    const virtualEntry = toVirtualPath(entry.realEntryPath);
    const packageName = packageNameFromVirtualPath(virtualEntry);
    const manifestPath = `/node_modules/${packageName}/package.json`;
    if (!context.files.has(manifestPath)) {
      const types = normalize(
        relative(`/node_modules/${packageName}`, virtualEntry),
      );
      context.files.set(
        manifestPath,
        JSON.stringify({name: packageName, types}, null, 2),
      );
    }
    paths[entry.specifier] = [virtualEntry];
  }
  compilerOptions.paths = {...(compilerOptions.paths ?? {}), ...paths};

  const {files: libFiles, libFileNames} = buildLibClosure();
  for (const lib of libFiles) context.files.set(lib.path, lib.text);

  const files: TypePackFile[] = [...context.files]
    .map(([path, text]) => ({path, text}))
    .sort((a, b) => a.path.localeCompare(b.path));

  const rootPaths = entries.map(entry => toVirtualPath(entry.realEntryPath));
  const ambientPaths = [CALLBACK_STUB_PATH];

  validateClosure(files, compilerOptions, [...rootPaths, ...ambientPaths]);

  return {
    tsVersion: ts.version,
    compilerOptions,
    files,
    libFileNames,
    rootPaths,
    ambientPaths,
  };
}
