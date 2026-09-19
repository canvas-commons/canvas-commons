/**
 * The import map the vendored bundles are served under.
 *
 * @example
 * ```ts
 * const map: FiddleImportMap = {
 *   imports: {'@canvas-commons/core': '/fiddle/0.3.1-ab12/core-cd34.js'},
 * };
 * ```
 */
export interface FiddleImportMap {
  imports: Record<string, string>;
}

/**
 * The output of a vendor build, written as `manifest.json` next to the
 * versioned asset directory it describes.
 *
 * Every URL points inside `\<engineVersion\>-\<hash\>`, whose name changes
 * with its contents, so the assets take a one-year cache.
 *
 * @example
 * ```ts
 * const manifest: FiddleVendorManifest = JSON.parse(
 *   await readFile('static/fiddle/manifest.json', 'utf8'),
 * );
 * createFiddleHost({container, manifest});
 * ```
 */
export interface FiddleVendorManifest {
  /**
   * Content hash over the emitted bundles, the frame template and the type
   * pack.
   */
  hash: string;
  /** The `@canvas-commons/core` version the bundles were built from. */
  engineVersion: string;
  /**
   * The hash plus a fingerprint of the editor stack's pinned versions. A host
   * stores it to decide whether a cached activation is still valid.
   */
  stamp: string;
  frameUrl: string;
  harnessUrl: string;
  importMap: FiddleImportMap;
  /**
   * The type pack the editor's TypeScript worker fetches. Absent when the
   * vendor build ran without one; the editor then runs with no completions
   * and no TypeScript diagnostics.
   */
  typesUrl?: string;
  /**
   * The TypeScript version that built the type pack. The worker refuses a
   * pack whose version differs from the one it bundles.
   */
  tsVersion?: string;
}
