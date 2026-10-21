import path from 'node:path';

/**
 * Run `runProbe` of a bundle that the test built into a temporary directory.
 *
 * @remarks
 * Vitest only loads files inside the project and its allowed directories
 * through a `/@fs/` path.
 */
export async function runBuiltProbe(file: string): Promise<unknown> {
  const module: unknown = await import(
    /* @vite-ignore */ `/@fs/${file.split(path.sep).join('/')}`
  );
  if (
    typeof module !== 'object' ||
    module === null ||
    !('runProbe' in module) ||
    typeof module.runProbe !== 'function'
  ) {
    throw new Error(`${file} does not export runProbe.`);
  }
  return module.runProbe();
}
