import {Plugin, PLUGIN_OPTIONS} from '@canvas-commons/vite-plugin';

/**
 * Register the SVG exporter with a Canvas Commons project.
 *
 * @remarks
 * The exporter itself runs entirely on the client; the generated SVG is written
 * to disk by the vite-plugin's built-in exporter handler (the same path the
 * image-sequence exporter uses). This server half only injects the client entry
 * point so the exporter shows up in the project's exporter list.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import svg from '@canvas-commons/svg';
 * export default defineConfig({plugins: [motionCanvas(), svg()]});
 * ```
 */
export default (): Plugin => ({
  name: 'canvas-commons/svg',
  [PLUGIN_OPTIONS]: {
    entryPoint: '@canvas-commons/svg/client',
  },
});
