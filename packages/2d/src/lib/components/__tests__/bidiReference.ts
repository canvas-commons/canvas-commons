/**
 * A small UAX9 reference, written from the standard and not from the level
 * table the layout uses, so an order check does not grade the layout with its
 * own table. It covers one paragraph without explicit embeddings and only the
 * characters {@link bidiClass} names; any other character throws.
 */

type BidiClass =
  | 'L'
  | 'R'
  | 'AL'
  | 'EN'
  | 'AN'
  | 'ES'
  | 'ET'
  | 'CS'
  | 'WS'
  | 'ON'
  | 'NSM'
  | 'BN';

/** Bidi class of the characters the reference covers. */
function bidiClass(char: string): BidiClass {
  const code = char.charCodeAt(0);
  if (/[A-Za-z]/.test(char)) return 'L';
  if (code >= 0x05d0 && code <= 0x05ea) return 'R';
  if (code >= 0x0621 && code <= 0x064a) return 'AL';
  if (/[0-9]/.test(char)) return 'EN';
  if (code >= 0x0660 && code <= 0x0669) return 'AN';
  if (char === '+' || char === '-') return 'ES';
  if (char === '#' || char === '$' || char === '%') return 'ET';
  if (char === ',' || char === '.' || char === ':' || char === '/') return 'CS';
  if (char === ' ') return 'WS';
  if (/[!?;"'()]/.test(char)) return 'ON';
  if (code >= 0x0300 && code <= 0x036f) return 'NSM';
  if (code >= 0x05b0 && code <= 0x05bd) return 'NSM';
  if (code === 0x00ad || (code >= 0x200b && code <= 0x200d)) return 'BN';
  throw new Error(`The bidi reference does not cover ${JSON.stringify(char)}`);
}

function isStrongOrNumber(type: BidiClass): boolean {
  return type === 'L' || type === 'R' || type === 'EN' || type === 'AN';
}

/**
 * Resolved embedding level of every character, rules X9 to I2 and L1. A
 * character X9 removes takes the level of the one before it.
 */
function referenceLevels(text: string, paragraphLevel: 0 | 1): number[] {
  const chars = [...text];
  const kept = chars
    .map((_, index) => index)
    .filter(index => bidiClass(chars[index]) !== 'BN');
  const levels = resolvedLevels(
    kept.map(index => bidiClass(chars[index])),
    paragraphLevel,
  );
  const all: number[] = [];
  let level: number = paragraphLevel;
  for (let index = 0, k = 0; index < chars.length; index++) {
    if (kept[k] === index) level = levels[k++];
    all.push(level);
  }
  // L1: whitespace at the end of the line sits at the paragraph level.
  for (
    let i = chars.length - 1;
    i >= 0 && (chars[i] === ' ' || bidiClass(chars[i]) === 'BN');
    i--
  ) {
    all[i] = paragraphLevel;
  }
  return all;
}

/** Rules W1 to I2 over the classes X9 keeps. */
function resolvedLevels(types: BidiClass[], paragraphLevel: 0 | 1): number[] {
  const sos: BidiClass = paragraphLevel === 1 ? 'R' : 'L';

  // W1: a nonspacing mark takes the class of the character before it.
  for (let i = 0; i < types.length; i++) {
    if (types[i] === 'NSM') types[i] = i > 0 ? types[i - 1] : sos;
  }
  // W2, W3: a European number after Arabic letters is an Arabic number.
  let strong: BidiClass = sos;
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    if (type === 'L' || type === 'R' || type === 'AL') strong = type;
    else if (type === 'EN' && strong === 'AL') types[i] = 'AN';
  }
  for (let i = 0; i < types.length; i++) {
    if (types[i] === 'AL') types[i] = 'R';
  }
  // W4: one separator between two numbers of a kind joins them.
  for (let i = 1; i + 1 < types.length; i++) {
    const before = types[i - 1];
    const after = types[i + 1];
    if (types[i] === 'ES' && before === 'EN' && after === 'EN') {
      types[i] = 'EN';
    } else if (
      types[i] === 'CS' &&
      before === after &&
      (before === 'EN' || before === 'AN')
    ) {
      types[i] = before;
    }
  }
  // W5: terminators next to a European number are part of it.
  for (let i = 0; i < types.length; i++) {
    if (types[i] !== 'ET') continue;
    let end = i;
    while (end < types.length && types[end] === 'ET') end++;
    const touches =
      (i > 0 && types[i - 1] === 'EN') ||
      (end < types.length && types[end] === 'EN');
    if (touches) types.fill('EN', i, end);
    i = end - 1;
  }
  // W6: the separators and terminators left are neutral.
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    if (type === 'ES' || type === 'ET' || type === 'CS') types[i] = 'ON';
  }
  // W7: a European number after Latin text is Latin.
  strong = sos;
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    if (type === 'L' || type === 'R') strong = type;
    else if (type === 'EN' && strong === 'L') types[i] = 'L';
  }
  // N1, N2: neutrals take the direction on both sides, else the paragraph's.
  const direction = (type: BidiClass): BidiClass => (type === 'L' ? 'L' : 'R');
  for (let i = 0; i < types.length; i++) {
    if (isStrongOrNumber(types[i])) continue;
    let end = i;
    while (end < types.length && !isStrongOrNumber(types[end])) end++;
    const before = i > 0 ? direction(types[i - 1]) : sos;
    const after = end < types.length ? direction(types[end]) : sos;
    const resolved = before === after ? before : sos;
    types.fill(resolved, i, end);
    i = end - 1;
  }
  // I1, I2.
  return types.map(type => {
    if (paragraphLevel === 0) {
      if (type === 'R') return 1;
      return type === 'AN' || type === 'EN' ? 2 : 0;
    }
    return type === 'R' ? 1 : 2;
  });
}

/**
 * Where each character of a line shows when the line is drawn in one call:
 * rule L2 over {@link referenceLevels}.
 */
export function referenceVisualIndexes(
  text: string,
  paragraphLevel: 0 | 1,
): number[] {
  const levels = referenceLevels(text, paragraphLevel);
  const order = levels.map((_, index) => index);
  const highest = Math.max(paragraphLevel, ...levels);
  for (let level = highest; level >= 1; level--) {
    for (let start = 0; start < order.length;) {
      if (levels[order[start]] < level) {
        start++;
        continue;
      }
      let end = start;
      while (end < order.length && levels[order[end]] >= level) end++;
      order.splice(start, end - start, ...order.slice(start, end).reverse());
      start = end;
    }
  }
  const shown: number[] = [];
  order.forEach((index, at) => (shown[index] = at));
  return shown;
}
