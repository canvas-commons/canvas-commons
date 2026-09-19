// @babel/standalone 8.x ships no type declarations. This covers only the
// surface the compiler calls.
declare module '@babel/standalone' {
  export interface BabelFileResult {
    code?: string | null;
    map?: object | null;
  }

  export interface BabelPluginObject {
    name?: string;
    visitor: Record<string, unknown>;
  }

  export type PluginTarget =
    | string
    | [string, Record<string, unknown>]
    | ((api: unknown) => BabelPluginObject);

  export interface TransformOptions {
    filename?: string;
    assumptions?: {
      setPublicClassFields?: boolean;
      privateFieldsAsProperties?: boolean;
    };
    presets?: PluginTarget[];
    plugins?: PluginTarget[];
    sourceMaps?: boolean | 'inline' | 'both';
    code?: boolean;
    parserOpts?: {plugins?: string[]};
  }

  export function transform(
    code: string,
    options?: TransformOptions,
  ): BabelFileResult | null;

  export const availablePlugins: Record<string, unknown>;
  export const availablePresets: Record<string, unknown>;
}
