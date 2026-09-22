// Copied from @chenglou/pretext 0.0.9, src/bidi.ts, commit
// 8460bf940c50d82be90a396fb0ea2c4e7a2dc6f3, under the MIT license in
// ./LICENSE. Function names and upstream line ranges are in ./UPSTREAM.json,
// which a unit test checks against the installed package.
//
// Two rules diverge from upstream. A caller may give the paragraph level, as
// UAX9 rule P3 lets a higher protocol do; upstream always takes the direction
// of the first strong character, so a Latin text in an rtl block resolves as
// ltr. And the W and N rules skip BN characters, as UAX9 rule X9 removes them;
// upstream counts a BN as a strong rtl neighbour, so `Hello\u200B world` in an
// rtl block paints `world Hello`.
import type {GeneratedBidiType as BidiType} from './bidiData';
import {latin1BidiTypes, nonLatin1BidiRanges} from './bidiData';

export type ParagraphLevel = 0 | 1;

function classifyCodePoint(codePoint: number): BidiType {
  if (codePoint <= 0x00ff) return latin1BidiTypes[codePoint];

  let lo = 0;
  let hi = nonLatin1BidiRanges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const range = nonLatin1BidiRanges[mid];
    if (codePoint < range[0]) {
      hi = mid - 1;
      continue;
    }
    if (codePoint > range[1]) {
      lo = mid + 1;
      continue;
    }
    return range[2];
  }

  return 'L';
}

/**
 * Bidi embedding level of every UTF-16 unit of `str`, or `null` when every
 * level is zero.
 *
 * @param str - Normalized text; a paragraph separator ends a paragraph.
 * @param paragraphLevel - Level of every paragraph, else the first strong
 *   character of each picks it.
 *
 * @example
 * ```ts
 * computeBidiLevels('Hello world', 1); // every letter at level 2
 * ```
 */
export function computeBidiLevels(
  str: string,
  paragraphLevel?: ParagraphLevel,
): Int8Array | null {
  const len = str.length;
  if (len === 0) return null;

  const types = new Array<BidiType>(len);
  const forced = paragraphLevel === 1;
  let paragraphHasBidi = false;
  let paragraphStart = 0;
  let levels: Int8Array | null = null;

  // Keep the resolved bidi classes aligned to UTF-16 code-unit offsets,
  // because the rich prepared segments index back into the normalized string
  // with JavaScript string offsets.
  for (let i = 0; i < len;) {
    const first = str.charCodeAt(i);
    let codePoint = first;
    let codeUnitLength = 1;

    if (first >= 0xd800 && first <= 0xdbff && i + 1 < len) {
      const second = str.charCodeAt(i + 1);
      if (second >= 0xdc00 && second <= 0xdfff) {
        codePoint = ((first - 0xd800) << 10) + (second - 0xdc00) + 0x10000;
        codeUnitLength = 2;
      }
    }

    const t = classifyCodePoint(codePoint);
    if (t === 'R' || t === 'AL' || t === 'AN') paragraphHasBidi = true;
    for (let j = 0; j < codeUnitLength; j++) {
      types[i + j] = t;
    }
    // Classification has all of this paragraph's types when B arrives.
    // Resolve that range now; S (tabs) and U+2028 do not end a paragraph.
    if (t === 'B') {
      if (paragraphHasBidi || forced) {
        levels ??= new Int8Array(len);
        // B belongs to the preceding paragraph and inherits its base level.
        levels[i] = resolveParagraphLevels(
          types,
          levels,
          paragraphStart,
          i,
          paragraphLevel,
        );
      }
      paragraphStart = i + codeUnitLength;
      paragraphHasBidi = false;
    }
    i += codeUnitLength;
  }

  if (paragraphHasBidi || (forced && paragraphStart < len)) {
    levels ??= new Int8Array(len);
    resolveParagraphLevels(types, levels, paragraphStart, len, paragraphLevel);
  }
  // Paragraphs without bidi classes have level zero. Leave their cells at
  // the typed array's initial value, or keep the all-LTR result null.
  return levels;
}

function firstStrongLevel(
  types: BidiType[],
  start: number,
  end: number,
): ParagraphLevel {
  // Use the first strong character to pick the paragraph base direction.
  // Rich-path bidi metadata is only an approximation, but this keeps mixed
  // LTR/RTL text aligned with the common UBA paragraph rule.
  for (let i = start; i < end; i++) {
    const t = types[i];
    if (t === 'L') return 0;
    if (t === 'R' || t === 'AL') return 1;
  }
  return 0;
}

function resolveParagraphLevels(
  types: BidiType[],
  levels: Int8Array,
  start: number,
  end: number,
  paragraphLevel?: ParagraphLevel,
): number {
  const startLevel = paragraphLevel ?? firstStrongLevel(types, start, end);
  const e: BidiType = startLevel & 1 ? 'R' : 'L';
  const sor = e;

  // X9: the W and N rules skip BN, so `at` lists the characters they see.
  const at: number[] = [];
  for (let i = start; i < end; i++) {
    if (types[i] !== 'BN') at.push(i);
  }
  const count = at.length;

  // W1-W7
  let lastType: BidiType = sor;
  for (let k = 0; k < count; k++) {
    const i = at[k];
    if (types[i] === 'NSM') types[i] = lastType;
    else lastType = types[i];
  }
  lastType = sor;
  for (let k = 0; k < count; k++) {
    const i = at[k];
    const t = types[i];
    if (t === 'EN') types[i] = lastType === 'AL' ? 'AN' : 'EN';
    else if (t === 'R' || t === 'L' || t === 'AL') lastType = t;
  }
  for (let k = 0; k < count; k++) {
    if (types[at[k]] === 'AL') types[at[k]] = 'R';
  }
  for (let k = 1; k < count - 1; k++) {
    const i = at[k];
    const before = types[at[k - 1]];
    const after = types[at[k + 1]];
    if (types[i] === 'ES' && before === 'EN' && after === 'EN') {
      types[i] = 'EN';
    }
    if (
      types[i] === 'CS' &&
      (before === 'EN' || before === 'AN') &&
      after === before
    ) {
      types[i] = before;
    }
  }
  for (let k = 0; k < count; k++) {
    if (types[at[k]] !== 'EN') continue;
    let j;
    for (j = k - 1; j >= 0 && types[at[j]] === 'ET'; j--) types[at[j]] = 'EN';
    for (j = k + 1; j < count && types[at[j]] === 'ET'; j++) {
      types[at[j]] = 'EN';
    }
  }
  for (let k = 0; k < count; k++) {
    const t = types[at[k]];
    if (t === 'WS' || t === 'ES' || t === 'ET' || t === 'CS') {
      types[at[k]] = 'ON';
    }
  }
  lastType = sor;
  for (let k = 0; k < count; k++) {
    const i = at[k];
    const t = types[i];
    if (t === 'EN') types[i] = lastType === 'L' ? 'L' : 'EN';
    else if (t === 'R' || t === 'L') lastType = t;
  }

  // N1-N2
  for (let k = 0; k < count; k++) {
    if (types[at[k]] !== 'ON') continue;
    let runEnd = k + 1;
    while (runEnd < count && types[at[runEnd]] === 'ON') runEnd++;
    const before: BidiType = k > 0 ? types[at[k - 1]] : sor;
    const after: BidiType = runEnd < count ? types[at[runEnd]] : sor;
    const bDir: BidiType = before !== 'L' ? 'R' : 'L';
    const aDir: BidiType = after !== 'L' ? 'R' : 'L';
    if (bDir === aDir) {
      for (let j = k; j < runEnd; j++) types[at[j]] = bDir;
    }
    k = runEnd - 1;
  }
  for (let k = 0; k < count; k++) {
    if (types[at[k]] === 'ON') types[at[k]] = e;
  }

  // I1-I2
  for (let k = 0; k < count; k++) {
    const i = at[k];
    const t = types[i];
    let level = startLevel;
    if ((startLevel & 1) === 0) {
      if (t === 'R') level++;
      else if (t === 'AN' || t === 'EN') level += 2;
    } else if (t === 'L' || t === 'AN' || t === 'EN') {
      level++;
    }
    levels[i] = level;
  }

  // A BN takes the level of the next character the rules saw, else of the
  // last one, so it never splits the run it sits in.
  let next = count > 0 ? levels[at[count - 1]] : startLevel;
  for (let i = end - 1; i >= start; i--) {
    if (types[i] === 'BN') levels[i] = next;
    else next = levels[i];
  }

  return startLevel;
}
