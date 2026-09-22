import {DependencyContext, createSignal} from '@canvas-commons/core';
import {clearCache} from '@chenglou/pretext';

const FontsVersion = createSignal(0);
const RequestedFaces = new Set<string>();

/**
 * The face a canvas font shorthand names, without its size. An animated font
 * size walks through thousands of shorthands of one face, and the face is what
 * the browser loads.
 */
function faceOf(font: string): string {
  return font.replace(/(?:^|\s)\d+(?:\.\d+)?px(?:\s*\/\s*\S+)?\s/, ' ');
}

function invalidateMeasurements() {
  // Pretext caches measured widths per (segment, font) internally; widths
  // captured before the face loaded are fallback metrics and must go.
  clearCache();
  FontsVersion(FontsVersion() + 1);
}

if (typeof document !== 'undefined' && 'fonts' in document) {
  document.fonts.addEventListener('loadingdone', invalidateMeasurements);
}

/**
 * Reactive token for web font availability.
 *
 * @remarks
 * Canvas text measurement silently falls back to a substitute font until the
 * requested face finishes loading, and nothing in the signal graph observes
 * that load. Measurement computeds read this signal so a finished font load
 * invalidates their cached results.
 */
export function fontsVersion(): number {
  return FontsVersion();
}

/**
 * Kick off loading for a canvas font shorthand (e.g. `'700 160px Inter'`).
 *
 * @remarks
 * Setting `ctx.font` does not trigger a web font fetch on its own. Each font
 * a text node measures with is requested here; when the load lands,
 * {@link fontsVersion} bumps and dependents re-measure with real metrics.
 * A pending load is collected like any other asynchronous resource, so the
 * scene waits for it before drawing. Failed loads keep the fallback metrics.
 */
export function requestFontLoad(font: string) {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const face = faceOf(font);
  if (RequestedFaces.has(face)) return;
  RequestedFaces.add(face);
  try {
    if (document.fonts.check(font)) return;
  } catch {
    // An invalid shorthand; the canvas ignores it as well.
    return;
  }
  DependencyContext.collectPromise(
    // `loadingdone` can fire after this promise settles, and the scene draws
    // as soon as it does.
    document.fonts.load(font).then(invalidateMeasurements, () => {
      // The browser already reports the network/parse failure; fallback
      // metrics remain in effect.
    }),
  );
}
