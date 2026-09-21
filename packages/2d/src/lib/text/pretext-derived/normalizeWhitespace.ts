/**
 * Derived from \@chenglou/pretext 0.0.9, src/analysis.ts
 * (`normalizeWhitespaceNormal`, `normalizeWhitespacePreWrap`).
 * Copyright (c) 2026 Pretext contributors. MIT; see LICENSE.
 * Upstream: 8460bf940c50d82be90a396fb0ea2c4e7a2dc6f3.
 *
 * The two upstream functions are kept as upstream writes them. The mapped port
 * below applies the same rules and also records where every normalized
 * character came from.
 */

/** Whitespace handling of a paragraph, in CSS terms. */
export type WhiteSpaceMode = 'normal' | 'pre-line' | 'pre-wrap';

/** A normalized string with the offsets of the text it came from. */
export type NormalizedText = {
  text: string;
  /** Normalized offset of every source offset, the end offset included. */
  offsets: Int32Array;
  /**
   * Half-open source range that produced each normalized character. A
   * collapsed run of whitespace spans all of its source characters.
   */
  sourceStarts: Int32Array;
  sourceEnds: Int32Array;
};

const COLLAPSIBLE_WHITESPACE_RUN = /[ \t\n\r\f]+/g;
const NEEDS_NORMALIZATION = /[\t\n\r\f]| {2,}|^ | $/;

/** Upstream rule for `white-space: normal`. */
export function normalizeWhitespaceNormal(text: string): string {
  if (!NEEDS_NORMALIZATION.test(text)) return text;

  let normalized = text.replace(COLLAPSIBLE_WHITESPACE_RUN, ' ');
  if (normalized.charCodeAt(0) === 0x20) {
    normalized = normalized.slice(1);
  }
  if (
    normalized.length > 0 &&
    normalized.charCodeAt(normalized.length - 1) === 0x20
  ) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/** Upstream rule for `white-space: pre-wrap`. */
export function normalizeWhitespacePreWrap(text: string): string {
  if (!/[\r\f]/.test(text)) return text;
  return text.replace(/\r\n/g, '\n').replace(/[\r\f]/g, '\n');
}

const SPACE = 0x20;
const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const FORM_FEED = 0x0c;

/**
 * The characters of the result, as parallel arrays: each one's code and the
 * half-open source range behind it. Normalization never adds a character, so
 * the source length bounds them.
 */
class Units {
  public readonly codes: Uint16Array;
  public readonly starts: Int32Array;
  public readonly ends: Int32Array;
  public length = 0;

  public constructor(capacity: number) {
    this.codes = new Uint16Array(capacity);
    this.starts = new Int32Array(capacity);
    this.ends = new Int32Array(capacity);
  }

  public push(code: number, start: number, end: number): void {
    this.codes[this.length] = code;
    this.starts[this.length] = start;
    this.ends[this.length] = end;
    this.length++;
  }
}

function isCollapsible(code: number): boolean {
  return (
    code === SPACE ||
    code === TAB ||
    code === LINE_FEED ||
    code === CARRIAGE_RETURN ||
    code === FORM_FEED
  );
}

function isHorizontal(code: number): boolean {
  return code === SPACE || code === TAB;
}

function isLineBreak(code: number): boolean {
  return code === LINE_FEED || code === CARRIAGE_RETURN || code === FORM_FEED;
}

/**
 * The text of the units `[first, end)`. A source offset with no character of
 * its own takes the next one.
 */
function assemble(
  source: string,
  units: Units,
  first: number,
  end: number,
): NormalizedText {
  const {codes, starts, ends} = units;
  const offsets = new Int32Array(source.length + 1).fill(-1);
  let text = '';
  let copyStart = 0;
  let copyEnd = 0;
  for (let at = first; at < end; at++) {
    for (let offset = starts[at]; offset < ends[at]; offset++) {
      offsets[offset] = at - first;
    }
    const verbatim =
      ends[at] === starts[at] + 1 &&
      source.charCodeAt(starts[at]) === codes[at];
    if (verbatim && starts[at] === copyEnd) {
      copyEnd++;
      continue;
    }
    text += source.slice(copyStart, copyEnd);
    if (verbatim) {
      copyStart = starts[at];
      copyEnd = copyStart + 1;
    } else {
      text += String.fromCharCode(codes[at]);
      copyStart = copyEnd = 0;
    }
  }
  text += source.slice(copyStart, copyEnd);
  offsets[source.length] = end - first;
  for (let at = source.length - 1; at >= 0; at--) {
    if (offsets[at] === -1) offsets[at] = offsets[at + 1];
  }
  return {
    text,
    offsets,
    sourceStarts: starts.subarray(first, end),
    sourceEnds: ends.subarray(first, end),
  };
}

function collapseAll(text: string): NormalizedText {
  const units = new Units(text.length);
  let at = 0;
  while (at < text.length) {
    const start = at;
    if (!isCollapsible(text.charCodeAt(at))) {
      units.push(text.charCodeAt(at), at, ++at);
      continue;
    }
    while (at < text.length && isCollapsible(text.charCodeAt(at))) at++;
    units.push(SPACE, start, at);
  }
  let first = 0;
  let end = units.length;
  if (end > 0 && units.codes[0] === SPACE) first++;
  if (end > first && units.codes[end - 1] === SPACE) end--;
  return assemble(text, units, first, end);
}

/**
 * Remove a collapsible space or tab that touches a segment break, as CSS Text
 * white-space phase 1 requires, and give its source offsets to the break.
 * The kept units move down in place.
 */
function dropSpacesAroundBreaks(units: Units): void {
  const {codes, starts, ends} = units;
  const length = units.length;
  units.length = 0;
  for (let at = 0; at < length; at++) {
    const last = units.length - 1;
    if (codes[at] !== SPACE) {
      units.push(codes[at], starts[at], ends[at]);
    } else if (last >= 0 && codes[last] === LINE_FEED) {
      ends[last] = ends[at];
    } else if (at + 1 < length && codes[at + 1] === LINE_FEED) {
      starts[at + 1] = starts[at];
    } else {
      units.push(codes[at], starts[at], ends[at]);
    }
  }
}

function normalizeBreaks(text: string, collapseSpaces: boolean): Units {
  const units = new Units(text.length);
  let at = 0;
  while (at < text.length) {
    const start = at;
    const code = text.charCodeAt(at);
    if (isLineBreak(code)) {
      const crlf =
        code === CARRIAGE_RETURN && text.charCodeAt(at + 1) === LINE_FEED;
      at += crlf ? 2 : 1;
      units.push(LINE_FEED, start, at);
      continue;
    }
    if (collapseSpaces && isHorizontal(code)) {
      while (at < text.length && isHorizontal(text.charCodeAt(at))) at++;
      units.push(SPACE, start, at);
      continue;
    }
    units.push(code, at, ++at);
  }
  if (collapseSpaces) dropSpacesAroundBreaks(units);
  return units;
}

const PRE_LINE_NEEDS_NORMALIZATION = /[\t\r\f]| {2}| \n|\n /;

/**
 * The text {@link normalizeWhitespace} gives, without the source map.
 *
 * @example
 * ```ts
 * normalizeWhitespaceText('a \n b', 'pre-line'); // 'a\nb'
 * ```
 */
export function normalizeWhitespaceText(
  text: string,
  mode: WhiteSpaceMode,
): string {
  if (mode === 'normal') return normalizeWhitespaceNormal(text);
  if (mode === 'pre-wrap') return normalizeWhitespacePreWrap(text);
  if (!PRE_LINE_NEEDS_NORMALIZATION.test(text)) return text;
  return text
    .replace(/\r\n?|\f/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n');
}

/**
 * Normalize the whitespace of a whole paragraph and record where every
 * normalized character came from. The text equals what pretext produces for
 * the same string under the matching pretext mode.
 */
export function normalizeWhitespace(
  text: string,
  mode: WhiteSpaceMode,
): NormalizedText {
  if (mode === 'normal') return collapseAll(text);
  const units = normalizeBreaks(text, mode === 'pre-line');
  return assemble(text, units, 0, units.length);
}
