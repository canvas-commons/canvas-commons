/** Prefix of the specifiers that name a runtime shim of this package. */
export const SHIM_SPECIFIER_PREFIX =
  '@canvas-commons/motion-canvas-compat/runtime/';

/** The runtime shims, by the file name that the Vite plugin serves them from. */
export const shimNames = ['2d', 'editor', 'default-plugin'] as const;

export type ShimName = (typeof shimNames)[number];

export const GUIDE_URL =
  'https://canvascommons.io/docs/migration/motion-canvas-libraries';

function shimSpecifier(name: ShimName): string {
  return SHIM_SPECIFIER_PREFIX + name;
}

/** Return the shim that a specifier from {@link mapSpecifier} names. */
export function getShimName(specifier: string): ShimName | null {
  const [path] = splitQuery(specifier);
  return shimNames.find(name => path === shimSpecifier(name)) ?? null;
}

const UNSUPPORTED_SPECIFIERS = new Map([
  [
    '@motion-canvas/2d/lib/components/CodeBlock',
    '`CodeBlock` was removed from Canvas Commons. Use `Code` instead.',
  ],
]);

const EXACT_SPECIFIERS = new Map([
  ['@motion-canvas/core', '@canvas-commons/core'],
  ['@motion-canvas/core/project', '@canvas-commons/core/project'],
  [
    '@motion-canvas/core/tsconfig.project.json',
    '@canvas-commons/core/tsconfig.project.json',
  ],
  [
    '@motion-canvas/core/lib/plugin/DefaultPlugin',
    shimSpecifier('default-plugin'),
  ],
  ['@motion-canvas/2d', shimSpecifier('2d')],
  ['@motion-canvas/2d/lib/jsx-runtime', '@canvas-commons/2d/jsx-runtime'],
  [
    '@motion-canvas/2d/lib/jsx-dev-runtime',
    '@canvas-commons/2d/jsx-dev-runtime',
  ],
  ['@motion-canvas/2d/editor', '@canvas-commons/2d/editor'],
  [
    '@motion-canvas/2d/tsconfig.project.json',
    '@canvas-commons/2d/tsconfig.project.json',
  ],
  ['@motion-canvas/ui', shimSpecifier('editor')],
  ['@motion-canvas/ui/dist/style.css', '@canvas-commons/editor/style.css'],
  ['@motion-canvas/ffmpeg', '@canvas-commons/ffmpeg'],
  ['@motion-canvas/ffmpeg/lib/client', '@canvas-commons/ffmpeg/client'],
  ['@motion-canvas/ffmpeg/lib/server', '@canvas-commons/ffmpeg/server'],
  ['@motion-canvas/player', '@canvas-commons/player'],
  ['@motion-canvas/vite-plugin', '@canvas-commons/vite-plugin'],
]);

/** Every specifier below a directory. The function receives the rest of it. */
const DIRECTORY_SPECIFIERS: [string, (subpath: string) => string][] = [
  ['@motion-canvas/core/lib', () => '@canvas-commons/core'],
  [
    '@motion-canvas/core/shaders',
    subpath => `@canvas-commons/core/shaders${subpath}`,
  ],
  ['@motion-canvas/2d/lib', () => shimSpecifier('2d')],
];

function splitQuery(source: string): [path: string, query: string] {
  const index = source.indexOf('?');
  return index === -1
    ? [source, '']
    : [source.slice(0, index), source.slice(index)];
}

/** Accept the `.js` and `/index.js` spellings of a path below `lib`. */
function normalizeLibraryPath(path: string): string {
  return /\/lib(\/|$)/.test(path)
    ? path.replace(/\.js$/, '').replace(/\/index$/, '')
    : path;
}

function unknownSpecifierMessage(specifier: string): string {
  return (
    `Canvas Commons has no replacement for "${specifier}". ` +
    'The real Motion Canvas package is never loaded in its place, because it ' +
    `would add a second engine to the project. See ${GUIDE_URL}`
  );
}

/** Map a Motion Canvas specifier to its replacement. Return `null` for others and throw when none exists. */
export function mapSpecifier(source: string): string | null {
  const [rawPath, query] = splitQuery(source);
  if (!rawPath.startsWith('@motion-canvas/')) {
    return null;
  }

  const path = normalizeLibraryPath(rawPath);
  const unsupported = UNSUPPORTED_SPECIFIERS.get(path);
  if (unsupported) {
    throw new Error(`${unsupported} See ${GUIDE_URL}`);
  }

  const target = EXACT_SPECIFIERS.get(path) ?? mapDirectorySpecifier(path);
  if (target === undefined) {
    throw new Error(unknownSpecifierMessage(rawPath));
  }
  return target + query;
}

function mapDirectorySpecifier(path: string): string | undefined {
  for (const [directory, getTarget] of DIRECTORY_SPECIFIERS) {
    if (path === directory || path.startsWith(directory + '/')) {
      return getTarget(path.slice(directory.length));
    }
  }
  return undefined;
}
