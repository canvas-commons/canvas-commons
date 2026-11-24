import {Plugin as VitePlugin} from 'vite';

/**
 * Represents a Canvas Commons project configured in the Vite plugin.
 */
export interface ProjectData {
  /**
   * The name of the project.
   */
  name: string;
  /**
   * The file name containing the project.
   */
  fileName: string;
  /**
   * The path to the project file relative to the Vite configuration file.
   */
  filePath: string;
  /**
   * The path to access the project relative to the Host Name.
   */
  url: string;
}

/**
 * The Canvas Commons configuration passed to each plugin.
 */
export interface PluginConfig {
  /**
   * The projects configured in the Vite plugin.
   */
  projects: ProjectData[];
  /**
   * The output path relative to the Vite configuration file.
   */
  output: string;
}

export const PLUGIN_OPTIONS = Symbol.for(
  '@canvas-commons/vite-plugin/PLUGIN_OPTIONS',
);

export interface PluginOptions {
  /**
   * An entry point of the runtime plugin.
   *
   * @remarks
   * While the Vite plugin can extend the backend functionality, this entry
   * point lets you include custom runtime code that will be loaded by the
   * browser. {@link loadIn} decides whether a production build of the project
   * includes it.
   *
   * It should be a valid module specifier from which the plugin will be
   * imported. The module should contain a default export of a runtime plugin.
   */
  entryPoint: string;

  /**
   * Where the code from {@link entryPoint} loads. Defaults to `'editor'` and
   * warns when not explicitly set. `'project'` bundles and loads it
   * everywhere, `'editor'` only loads in the editor and renderer. Start with
   * `'editor'` unless it should be bundled into included projects.
   *
   * @example
   * ```ts
   * import {Plugin, PLUGIN_OPTIONS} from '@canvas-commons/vite-plugin';
   *
   * export default (): Plugin[] => [
   *   {
   *     name: 'my-fonts',
   *     [PLUGIN_OPTIONS]: {
   *       entryPoint: 'my-fonts/project',
   *       loadIn: 'project',
   *     },
   *   },
   *   {
   *     name: 'my-fonts-editor',
   *     [PLUGIN_OPTIONS]: {
   *       entryPoint: 'my-fonts/editor',
   *       loadIn: 'editor',
   *     },
   *   },
   * ];
   * ```
   */
  loadIn?: 'editor' | 'project';

  /**
   * The configuration hook of the plugin.
   *
   * @remarks
   * Invoked during `configResolved` hook of Vite, contains the Canvas Commons
   * specific configuration. Returned value will be merged with the current
   * configuration.
   *
   * @param config - The configuration passed to the plugin.
   */
  config?(config: PluginConfig): Promise<Partial<PluginConfig> | void>;

  /**
   * Get custom configuration that will be passed to the runtime plugin.
   *
   * @remarks
   * The config will be passed as the first argument to the default export of
   * the runtime plugin. When provided as a string, it will be injected to the
   * code as is, letting you define non-serializable values such as functions.
   *
   * If the returned value is an object, it will be converted to a JavaScript
   * object using JSON serialization.
   *
   * @example
   * Returning an object:
   * ```ts
   * {
   *   runtimeConfig: async () => ({
   *     myText: 'Hello!',
   *     myNumber: 42,
   *   })
   * }
   * ```
   * Returning a string:
   * ```ts
   * {
   *   runtimeConfig: async () => `{myRegex: /\\.wav$/}`
   * }
   * ```
   */
  runtimeConfig?(): Promise<unknown>;
}

/**
 * Represents a Canvas Commons plugin.
 *
 * @remarks
 * It's a normal Vite plugin that can provide additional configuration specific
 * to Canvas Commons.
 */
export type Plugin = VitePlugin & {
  /**
   * The configuration specific to Canvas Commons.
   */
  [PLUGIN_OPTIONS]: PluginOptions;
};

export function isPlugin(value: unknown): value is Plugin {
  return typeof value === 'object' && value !== null && PLUGIN_OPTIONS in value;
}
