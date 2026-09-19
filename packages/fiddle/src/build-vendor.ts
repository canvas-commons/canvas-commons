import {createHash} from 'crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import {createRequire} from 'module';
import {dirname, join, resolve} from 'path';
import {fileURLToPath} from 'url';
import {build, type Rolldown} from 'vite';
import type {FiddleImportMap, FiddleVendorManifest} from './manifest';
import {buildTypePack, findPackageLocation} from './type-pack';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS_ENTRY_NAME = 'harness';

/**
 * A package whose resolved entry module is bundled for the browser and named
 * in the frame's import map.
 */
export interface VendorPackage {
  specifier: string;
  entryName: string;
}

/**
 * The three modules a fiddle may import.
 *
 * These resolve to entry modules, never wrapper re-exports, because an
 * `export * from` drops the default export the JSX runtime needs.
 */
export const CORE_VENDOR_PACKAGES: VendorPackage[] = [
  {specifier: '@canvas-commons/core', entryName: 'canvas-commons-core'},
  {specifier: '@canvas-commons/2d', entryName: 'canvas-commons-2d'},
  {
    specifier: '@canvas-commons/2d/jsx-runtime',
    entryName: 'canvas-commons-2d-jsx-runtime',
  },
];

/**
 * Where a vendor build writes, and under what URL its output is served.
 *
 * @example
 * ```ts
 * const options: BuildVendorOptions = {
 *   outputDir: 'packages/docs/static/fiddle',
 *   publicBase: '/fiddle',
 * };
 * ```
 */
export interface BuildVendorOptions {
  outputDir: string;
  /** The URL prefix `outputDir` is served under, without a trailing slash. */
  publicBase: string;
  /** Skips the type pack, leaving the editor without TypeScript support. */
  skipTypePack?: boolean;
  /**
   * Replaces the whole default frame policy, so it must restrict scripts
   * itself. It receives the quoted SHA-256 source that authorizes the inline
   * import map, and must return the same policy for the same input because
   * the policy is part of the artifact hash.
   *
   * @example
   * ```ts
   * csp: importMapHash =>
   *   `default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval' ${importMapHash}; style-src 'unsafe-inline'; connect-src 'self' data: blob:`,
   * ```
   */
  csp?: (importMapHash: string) => string;
}

function packageRequire(): NodeRequire {
  return createRequire(join(PACKAGE_ROOT, 'package.json'));
}

function resolveEntry(specifier: string): string {
  return packageRequire().resolve(specifier);
}

function readEngineVersion(): string {
  const manifestPath = packageRequire().resolve(
    '@canvas-commons/core/package.json',
  );
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const version =
    typeof parsed === 'object' &&
    parsed !== null &&
    'version' in parsed &&
    typeof parsed.version === 'string'
      ? parsed.version
      : null;
  if (version === null) {
    throw new Error(`[build-vendor] No version in ${manifestPath}`);
  }
  return version;
}

function computeEditorContractMarker(): string {
  const parsed: unknown = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'),
  );
  const dependencies =
    typeof parsed === 'object' &&
    parsed !== null &&
    'dependencies' in parsed &&
    typeof parsed.dependencies === 'object' &&
    parsed.dependencies !== null
      ? parsed.dependencies
      : {};
  const entries: [string, unknown][] = Object.entries(dependencies);
  const fingerprint = entries
    .filter(
      ([name, version]) =>
        typeof version === 'string' &&
        (name.startsWith('@codemirror/') || name.startsWith('@lezer/')),
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, version]) => `${name}@${version}`)
    .join(',');
  return createHash('sha256').update(fingerprint).digest('hex').slice(0, 8);
}

function getBuildOutput(
  result: Awaited<ReturnType<typeof build>>,
): Rolldown.RolldownOutput {
  if ('output' in result) {
    return result;
  }
  throw new Error('[build-vendor] The vendor build produced no bundle.');
}

function collectModuleIds(
  output: (Rolldown.OutputChunk | Rolldown.OutputAsset)[],
): string[] {
  const ids: string[] = [];
  for (const item of output) {
    if (item.type === 'chunk') ids.push(...item.moduleIds);
  }
  return ids;
}

/**
 * The packages whose modules the harness and the `2d` bundle must share.
 *
 * Highlighting compares tag identities, so a second copy of
 * `@lezer/highlight` leaves every `Code` node unhighlighted.
 */
export const SHARED_VENDOR_PACKAGES = [
  '@canvas-commons/core',
  '@canvas-commons/2d',
  '@lezer/common',
  '@lezer/highlight',
];

/**
 * Report every named package the bundle pulled in from more than one install,
 * against the roots it came from.
 *
 * @example
 * ```ts
 * findDuplicatePackageRoots(moduleIds, ['@lezer/highlight']); // empty
 * ```
 */
export function findDuplicatePackageRoots(
  moduleIds: string[],
  packageNames: string[],
): Map<string, string[]> {
  const wanted = new Set(packageNames);
  const rootsByPackage = new Map<string, Set<string>>();
  for (const id of moduleIds) {
    if (!existsSync(id)) continue;
    const location = findPackageLocation(id);
    if (!wanted.has(location.name)) continue;
    const roots = rootsByPackage.get(location.name) ?? new Set<string>();
    roots.add(location.root);
    rootsByPackage.set(location.name, roots);
  }
  const duplicates = new Map<string, string[]>();
  for (const [name, roots] of rootsByPackage) {
    if (roots.size > 1) duplicates.set(name, [...roots]);
  }
  return duplicates;
}

const CONTENT_HASH_LENGTH = 16;

const VENDOR_DIR_NAME = new RegExp(
  `^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?-[0-9a-f]{${CONTENT_HASH_LENGTH}}$`,
);

function computeContentHash(
  output: (Rolldown.OutputChunk | Rolldown.OutputAsset)[],
  frameTemplate: string,
  typesJson: string | null,
): string {
  const hasher = createHash('sha256');
  const sorted = [...output].sort((a, b) =>
    a.fileName.localeCompare(b.fileName),
  );
  for (const item of sorted) {
    hasher.update(item.fileName);
    hasher.update('\0');
    hasher.update(item.type === 'chunk' ? item.code : Buffer.from(item.source));
    hasher.update('\0');
  }
  hasher.update(frameTemplate);
  hasher.update('\0');
  hasher.update(typesJson ?? '');
  return hasher.digest('hex').slice(0, CONTENT_HASH_LENGTH);
}

function findEntryFileName(
  output: (Rolldown.OutputChunk | Rolldown.OutputAsset)[],
  absoluteEntryPath: string,
): string {
  const target = absoluteEntryPath.replace(/\\/g, '/');
  for (const item of output) {
    if (item.type !== 'chunk' || !item.facadeModuleId) continue;
    if (item.facadeModuleId.replace(/\\/g, '/') === target) {
      return item.fileName;
    }
  }
  throw new Error(
    `[build-vendor] No emitted chunk for entry ${absoluteEntryPath}`,
  );
}

function buildImportMap(
  output: (Rolldown.OutputChunk | Rolldown.OutputAsset)[],
  assetBase: string,
): FiddleImportMap {
  const imports: Record<string, string> = {};
  for (const vendorPackage of CORE_VENDOR_PACKAGES) {
    const fileName = findEntryFileName(
      output,
      resolveEntry(vendorPackage.specifier),
    );
    imports[vendorPackage.specifier] = `${assetBase}/${fileName}`;
  }
  return {imports};
}

function jsonForScriptTag(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function htmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function scriptHash(source: string): string {
  return `'sha256-${createHash('sha256').update(source).digest('base64')}'`;
}

function renderFrameBootstrap(
  harnessSrc: string,
  importMapHash: string,
): string {
  return `
      const policy = document.createElement('meta');
      policy.httpEquiv = 'Content-Security-Policy';
      const directory = new URL('.', window.location.href).href.replace(/[;,]/g, encodeURIComponent);
      policy.content = 'script-src ' + directory + ${jsonForScriptTag(` blob: 'wasm-unsafe-eval' ${importMapHash}`)};
      document.head.append(policy);
      const harness = document.createElement('script');
      harness.type = 'module';
      harness.src = ${jsonForScriptTag(harnessSrc)};
      document.body.append(harness);
    `;
}

function renderFrameHtml(
  importMap: FiddleImportMap,
  harnessFileName: string,
  assetBase: string,
  csp: BuildVendorOptions['csp'],
): string {
  const harnessSrc = `${assetBase}/${harnessFileName}`;
  const importMapJson = jsonForScriptTag(importMap);
  const importMapHash = scriptHash(importMapJson);
  const bootstrap = renderFrameBootstrap(harnessSrc, importMapHash);
  const policy = csp
    ? csp(importMapHash)
    : [
        "default-src 'none'",
        `script-src 'self' blob: 'wasm-unsafe-eval' ${importMapHash} ${scriptHash(bootstrap)}`,
        "style-src 'unsafe-inline'",
        'img-src http: https: data: blob:',
        'media-src http: https: data: blob:',
        'font-src http: https: data: blob:',
        'connect-src http: https: data: blob:',
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ');
  const harnessScript = csp
    ? `<script type="module" src="${htmlAttribute(harnessSrc)}"></script>`
    : `<script>${bootstrap}</script>`;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${htmlAttribute(policy)}" />
    <style>
      /* A definite height keeps the canvas off its intrinsic pixel height,
         which would make the frame scroll. */
      html, body { height: 100%; margin: 0; overflow: hidden; }
    </style>
    <script type="importmap">${importMapJson}</script>
  </head>
  <body>
    ${harnessScript}
  </body>
</html>
`;
}

function writeManifestAtomic(
  manifestPath: string,
  manifest: FiddleVendorManifest,
): void {
  mkdirSync(dirname(manifestPath), {recursive: true});
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(temporaryPath, manifestPath);
}

function pruneStaleDirs(outputDir: string, currentName: string): void {
  if (!existsSync(outputDir)) return;
  for (const entry of readdirSync(outputDir, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    if (entry.name === currentName) continue;
    if (!VENDOR_DIR_NAME.test(entry.name)) continue;
    rmSync(join(outputDir, entry.name), {recursive: true, force: true});
  }
}

/**
 * Bundles the engine packages and the harness for the browser, writes the
 * frame document and the type pack beside them, and describes the result in
 * `manifest.json`.
 *
 * Needs `vite`, which the package declares as an optional peer because only
 * build-time callers reach it.
 *
 * @example
 * ```ts
 * const manifest = await buildFiddleVendor({
 *   outputDir: 'packages/docs/static/fiddle',
 *   publicBase: '/fiddle',
 * });
 * ```
 */
export async function buildFiddleVendor(
  options: BuildVendorOptions,
): Promise<FiddleVendorManifest> {
  const outputDir = resolve(options.outputDir);
  const publicBase = options.publicBase.replace(/\/+$/, '');
  const manifestPath = join(outputDir, 'manifest.json');
  const engineVersion = readEngineVersion();

  const entries: Record<string, string> = {};
  for (const vendorPackage of CORE_VENDOR_PACKAGES) {
    entries[vendorPackage.entryName] = resolveEntry(vendorPackage.specifier);
  }
  const harnessSource = join(PACKAGE_ROOT, 'src', 'harness.ts');
  const harnessEntry = existsSync(harnessSource)
    ? harnessSource
    : join(PACKAGE_ROOT, 'lib', 'harness.js');
  entries[HARNESS_ENTRY_NAME] = harnessEntry;

  mkdirSync(outputDir, {recursive: true});
  const temporaryDir = join(outputDir, `.tmp-${process.pid}-${Date.now()}`);

  const result = await build({
    root: PACKAGE_ROOT,
    logLevel: 'warn',
    configFile: false,
    build: {
      outDir: temporaryDir,
      emptyOutDir: true,
      write: true,
      target: 'es2022',
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        checks: {pluginTimings: false},
        input: entries,
        preserveEntrySignatures: 'strict',
        output: {
          format: 'es',
          entryFileNames: '[name]-[hash].js',
          chunkFileNames: 'chunk-[hash].js',
          assetFileNames: 'asset-[name]-[hash][extname]',
        },
      },
    },
    resolve: {
      dedupe: SHARED_VENDOR_PACKAGES,
    },
  });

  const {output} = getBuildOutput(result);
  const duplicates = findDuplicatePackageRoots(
    collectModuleIds(output),
    SHARED_VENDOR_PACKAGES,
  );
  if (duplicates.size > 0) {
    const detail = [...duplicates]
      .map(([name, roots]) => `${name}: ${roots.join(', ')}`)
      .join('; ');
    throw new Error(
      `[build-vendor] Multiple copies resolved into the vendor bundle: ` +
        detail,
    );
  }

  const harnessFileName = findEntryFileName(output, harnessEntry);
  const basePlaceholder = `${publicBase}/__fiddle__`;
  const frameTemplate = renderFrameHtml(
    buildImportMap(output, basePlaceholder),
    harnessFileName,
    basePlaceholder,
    options.csp,
  );

  const typePack = options.skipTypePack
    ? null
    : buildTypePack(
        PACKAGE_ROOT,
        CORE_VENDOR_PACKAGES.map(vendorPackage => vendorPackage.specifier),
      );
  const typesJson = typePack === null ? null : JSON.stringify(typePack);

  const hash = computeContentHash(output, frameTemplate, typesJson);
  const directoryName = `${engineVersion}-${hash}`;
  const assetBase = `${publicBase}/${directoryName}`;
  const finalDir = join(outputDir, directoryName);

  if (existsSync(finalDir)) {
    rmSync(temporaryDir, {recursive: true, force: true});
  } else {
    renameSync(temporaryDir, finalDir);
  }

  const importMap = buildImportMap(output, assetBase);
  writeFileSync(
    join(finalDir, 'frame.html'),
    renderFrameHtml(importMap, harnessFileName, assetBase, options.csp),
  );
  if (typesJson !== null) {
    writeFileSync(join(finalDir, 'types.json'), typesJson);
  }

  const manifest: FiddleVendorManifest = {
    hash,
    engineVersion,
    stamp: `${hash}:${computeEditorContractMarker()}`,
    frameUrl: `${assetBase}/frame.html`,
    harnessUrl: `${assetBase}/${harnessFileName}`,
    importMap,
    ...(typePack === null
      ? {}
      : {
          typesUrl: `${assetBase}/types.json`,
          tsVersion: typePack.tsVersion,
        }),
  };
  writeManifestAtomic(manifestPath, manifest);
  pruneStaleDirs(outputDir, directoryName);

  return manifest;
}
