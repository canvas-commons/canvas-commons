import {createSignal} from '@canvas-commons/core';
import {clearCache} from '@chenglou/pretext';

const FontsVersion = createSignal(0);
const RequestedFonts = new Set<string>();

if (typeof document !== 'undefined' && 'fonts' in document) {
  document.fonts.addEventListener('loadingdone', () => {
    // Pretext caches measured widths per (segment, font) internally; widths
    // captured before the face loaded are fallback metrics and must go.
    clearCache();
    FontsVersion(FontsVersion() + 1);
  });
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
 * Failed loads keep the fallback metrics.
 */
export function requestFontLoad(font: string) {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  if (RequestedFonts.has(font)) return;
  RequestedFonts.add(font);
  document.fonts.load(font).catch(() => {
    // The browser already reports the network/parse failure; fallback
    // metrics remain in effect.
  });
}
