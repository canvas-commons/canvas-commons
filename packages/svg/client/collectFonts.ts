import {Logger} from '@canvas-commons/core';

interface FontFace {
  family: string;
  weight: string;
  style: string;
  unicodeRange: string;
  /** Absolute URL of the font file to embed. */
  url: string;
}

/**
 * Collects the page's `@font-face` rules into CSS with the font files inlined as
 * base64 data URIs, so exported text renders without the viewer having the fonts
 * installed.
 *
 * @remarks
 * Same-origin stylesheets (self-hosted fonts) are read directly. Cross-origin
 * ones — e.g. the Google Fonts CSS pulled in via `@import`, which the editor
 * uses for Roboto and JetBrains Mono — can't be inspected through the CSSOM, so
 * their CSS is re-fetched and parsed instead. Fonts referenced by name only,
 * with no `@font-face` (system fonts), can't be embedded from the browser and
 * are left to the viewer to resolve.
 *
 * @returns The `@font-face` CSS, or `''` when nothing could be embedded.
 */
export async function collectFontFaceCss(logger: Logger): Promise<string> {
  const faces: FontFace[] = [];
  const visited = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    await collectFromSheet(sheet, faces, visited);
  }

  // De-duplicate by font file so shared subsets are embedded once.
  const seen = new Set<string>();
  const rules: string[] = [];
  for (const face of faces) {
    if (seen.has(face.url)) {
      continue;
    }
    seen.add(face.url);
    try {
      const data = await fetchAsDataUri(face.url);
      const range = face.unicodeRange
        ? `unicode-range:${face.unicodeRange};`
        : '';
      rules.push(
        `@font-face{font-family:${face.family};font-style:${face.style};` +
          `font-weight:${face.weight};${range}src:url(${data})}`,
      );
    } catch {
      logger.warn(
        `SVG export: could not embed font ${face.family} (${face.url}).`,
      );
    }
  }

  return rules.join('');
}

async function collectFromSheet(
  sheet: CSSStyleSheet,
  faces: FontFace[],
  visited: Set<string>,
): Promise<void> {
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    // Cross-origin sheet: the CSSOM is inaccessible, so fetch and parse the CSS.
    if (sheet.href && !visited.has(sheet.href)) {
      visited.add(sheet.href);
      await collectFromUrl(sheet.href, faces, visited);
    }
    return;
  }

  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSImportRule && rule.styleSheet) {
      await collectFromSheet(rule.styleSheet, faces, visited);
    } else if (rule instanceof CSSFontFaceRule) {
      const base = sheet.href ?? document.baseURI;
      const face = parseFontFace(
        {
          family: rule.style.getPropertyValue('font-family'),
          weight: rule.style.getPropertyValue('font-weight'),
          style: rule.style.getPropertyValue('font-style'),
          unicodeRange: rule.style.getPropertyValue('unicode-range'),
          src: rule.style.getPropertyValue('src'),
        },
        base,
      );
      if (face) {
        faces.push(face);
      }
    }
  }
}

async function collectFromUrl(
  url: string,
  faces: FontFace[],
  visited: Set<string>,
): Promise<void> {
  let css: string;
  try {
    css = await (await fetch(url)).text();
  } catch {
    return;
  }

  for (const match of css.matchAll(
    /@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)/g,
  )) {
    const imported = new URL(match[1], url).toString();
    if (!visited.has(imported)) {
      visited.add(imported);
      await collectFromUrl(imported, faces, visited);
    }
  }

  for (const match of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = match[1];
    const face = parseFontFace(
      {
        family: cssProp(body, 'font-family'),
        weight: cssProp(body, 'font-weight'),
        style: cssProp(body, 'font-style'),
        unicodeRange: cssProp(body, 'unicode-range'),
        src: cssProp(body, 'src'),
      },
      url,
    );
    if (face) {
      faces.push(face);
    }
  }
}

function parseFontFace(
  raw: {
    family: string;
    weight: string;
    style: string;
    unicodeRange: string;
    src: string;
  },
  base: string,
): FontFace | null {
  const url = firstFontUrl(raw.src, base);
  const family = raw.family.trim();
  if (!family || !url) {
    return null;
  }
  return {
    family,
    weight: raw.weight.trim() || 'normal',
    style: raw.style.trim() || 'normal',
    unicodeRange: raw.unicodeRange.trim(),
    url,
  };
}

/** Reads a single declaration value out of an `@font-face` body. */
function cssProp(body: string, name: string): string {
  const match = body.match(new RegExp(`${name}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : '';
}

/** Picks the most broadly useful font URL from a `src` descriptor, preferring woff2 then woff. */
function firstFontUrl(src: string, base: string): string | null {
  const sources = [
    ...src.matchAll(
      /url\(\s*(['"]?)([^'")]+)\1\s*\)(?:\s*format\(\s*['"]?([^'")]+)['"]?\s*\))?/g,
    ),
  ].map(match => ({url: match[2], format: match[3]}));
  if (sources.length === 0) {
    return null;
  }
  const pick =
    sources.find(s => s.format === 'woff2') ??
    sources.find(s => s.format === 'woff') ??
    sources.find(s => /\.woff2?($|\?)/.test(s.url)) ??
    sources[0];
  try {
    return new URL(pick.url, base).toString();
  } catch {
    return null;
  }
}

async function fetchAsDataUri(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const mime = url.includes('.woff2')
    ? 'font/woff2'
    : url.includes('.woff')
      ? 'font/woff'
      : url.includes('.ttf')
        ? 'font/ttf'
        : url.includes('.otf')
          ? 'font/otf'
          : 'application/octet-stream';
  return `data:${mime};base64,${btoa(binary)}`;
}
