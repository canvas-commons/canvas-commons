/** The first release of `@canvas-commons/2d` that has what the shims need. */
export const MINIMUM_ENGINE_VERSION = '0.5.0';

function parseVersion(version: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

/** Tell whether a `@canvas-commons/2d` version is new enough. */
export function isSupportedEngineVersion(version: string): boolean {
  const actual = parseVersion(version);
  const minimum = parseVersion(MINIMUM_ENGINE_VERSION);
  if (!actual || !minimum) {
    return false;
  }
  for (let i = 0; i < minimum.length; i++) {
    if (actual[i] !== minimum[i]) {
      return actual[i] > minimum[i];
    }
  }
  return true;
}
