import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {Plugin, ResolvedConfig} from 'vite';
import {
  isSupportedEngineVersion,
  MINIMUM_ENGINE_VERSION,
} from './engineVersion';
import {
  externalizingEsbuildPlugin,
  externalizingRolldownPlugin,
  usesRolldownOptimizer,
} from './optimizer';
import {
  getShimName,
  mapSpecifier,
  SHIM_SPECIFIER_PREFIX,
  ShimName,
} from './specifiers';

const LEGACY_PLUGIN_OPTIONS = Symbol.for(
  '@motion-canvas/vite-plugin/PLUGIN_OPTIONS',
);
const PLUGIN_OPTIONS = Symbol.for('@canvas-commons/vite-plugin/PLUGIN_OPTIONS');
const VIRTUAL_PREFIX = '\0';
const ENGINE_PACKAGE = '@canvas-commons/2d';
const EXPERIMENTAL_WARNING =
  'Motion Canvas compatibility is experimental and may be removed in any release. See https://canvascommons.io/docs/migration/motion-canvas-libraries';

export interface MotionCanvasCompatOptions {
  /** Accept that the plugin is experimental and may be removed at any time. */
  experimental: true;
}

function shimSource(name: ShimName): Promise<string> {
  return readFile(
    path.join(import.meta.dirname, 'runtime', `${name}.js`),
    'utf8',
  );
}

function readVersion(text: string): string | null {
  const manifest: unknown = JSON.parse(text);
  return typeof manifest === 'object' &&
    manifest !== null &&
    'version' in manifest &&
    typeof manifest.version === 'string'
    ? manifest.version
    : null;
}

/** Let the Canvas Commons plugin see the options of Motion Canvas plugins. */
function adoptLegacyPluginOptions(plugins: ResolvedConfig['plugins']) {
  for (const plugin of plugins) {
    if (
      Reflect.has(plugin, LEGACY_PLUGIN_OPTIONS) &&
      !Reflect.has(plugin, PLUGIN_OPTIONS)
    ) {
      Reflect.set(
        plugin,
        PLUGIN_OPTIONS,
        Reflect.get(plugin, LEGACY_PLUGIN_OPTIONS),
      );
    }
  }
}

/**
 * Let a project use Motion Canvas component libraries.
 *
 * @remarks
 * Every `@motion-canvas/*` import, in the project and in its dependencies, is
 * served by Canvas Commons, so the project and the libraries share one engine.
 * Add it next to the Canvas Commons plugin. An import with no replacement is a
 * build error.
 *
 * This package is experimental. It may change or be removed in any release.
 *
 * @experimental
 * @example
 * ```ts
 * import canvasCommons from '@canvas-commons/vite-plugin';
 * import motionCanvasCompat from '@canvas-commons/motion-canvas-compat';
 * import {defineConfig} from 'vite';
 *
 * export default defineConfig({
 *   plugins: [canvasCommons(), motionCanvasCompat({experimental: true})],
 * });
 * ```
 */
export default function motionCanvasCompat(
  options: MotionCanvasCompatOptions,
): Plugin {
  if (options?.experimental !== true) {
    throw new Error(
      '@canvas-commons/motion-canvas-compat is experimental. It may change or be removed in any release. Pass {experimental: true} to motionCanvasCompat() to accept that.',
    );
  }
  let projectImporter: string;

  return {
    name: 'canvas-commons:motion-canvas-compat',
    enforce: 'pre',
    config() {
      return usesRolldownOptimizer()
        ? {
            optimizeDeps: {
              rolldownOptions: {plugins: [externalizingRolldownPlugin]},
            },
          }
        : {
            optimizeDeps: {
              esbuildOptions: {plugins: [externalizingEsbuildPlugin]},
            },
          };
    },
    configResolved(config) {
      config.logger.warn(EXPERIMENTAL_WARNING);
      projectImporter = path.join(config.root, 'index.html');
      adoptLegacyPluginOptions(config.plugins);
    },
    async buildStart() {
      const manifest = await this.resolve(
        `${ENGINE_PACKAGE}/package.json`,
        projectImporter,
        {skipSelf: true},
      );
      if (!manifest) {
        this.error(
          `Cannot find ${ENGINE_PACKAGE} from ${path.dirname(projectImporter)}. Install it in the project.`,
        );
      }
      // A linked checkout of the repository has no release version to check.
      if (manifest.id.includes('node_modules')) {
        const version = readVersion(await readFile(manifest.id, 'utf8'));
        if (version === null || !isSupportedEngineVersion(version)) {
          this.error(
            `@canvas-commons/motion-canvas-compat needs ${ENGINE_PACKAGE} ${MINIMUM_ENGINE_VERSION} or newer, found ${version === null ? 'no version' : version}.`,
          );
        }
      }
    },
    async resolveId(source, importer, options) {
      const fromShim = importer?.startsWith(
        VIRTUAL_PREFIX + SHIM_SPECIFIER_PREFIX,
      );
      const target = fromShim ? source : mapSpecifier(source);
      if (target === null) {
        return null;
      }
      if (!fromShim && getShimName(target)) {
        return VIRTUAL_PREFIX + target.split('?')[0];
      }

      const resolved = await this.resolve(target, projectImporter, {
        ...options,
        skipSelf: true,
      });
      if (!resolved) {
        this.error(
          `Cannot resolve ${target}, which replaces ${source}, from ${path.dirname(projectImporter)}. Install the package in the project. The real Motion Canvas package is never loaded in its place.`,
        );
      }
      return resolved;
    },
    async load(id) {
      const shim = id.startsWith(VIRTUAL_PREFIX)
        ? getShimName(id.slice(VIRTUAL_PREFIX.length))
        : null;
      return shim ? shimSource(shim) : null;
    },
  };
}
