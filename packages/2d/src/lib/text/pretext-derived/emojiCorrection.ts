// Copied from @chenglou/pretext 0.0.9, src/measurement.ts, commit
// 8460bf940c50d82be90a396fb0ea2c4e7a2dc6f3, under the MIT license in
// ./LICENSE. Function names and upstream line ranges are in ./UPSTREAM.json,
// which a unit test checks against the installed package.
//
// One rule diverges from upstream: the caller gives the correction of a font,
// read back from pretext's own measurement, instead of this module measuring
// the DOM and caching the result for every font string.
import {segment} from '../segmenter';

const EmojiPresentation = /\p{Emoji_Presentation}/u;
const MaybeEmoji =
  /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;

function isEmojiGrapheme(grapheme: string): boolean {
  return EmojiPresentation.test(grapheme) || grapheme.includes('\uFE0F');
}

function countEmojiGraphemes(text: string): number {
  let count = 0;
  for (const grapheme of segment(text, 'grapheme')) {
    if (isEmojiGrapheme(grapheme.segment)) count++;
  }
  return count;
}

/**
 * Take pretext's emoji correction off a canvas advance, so a piece measured
 * on its own carries the same numbers a preparation of the whole text does.
 *
 * @param correction - Width pretext takes off each emoji in the font, asked
 *   for only when the text may hold one.
 *
 * @example
 * ```ts
 * const width = correctEmojiAdvance(text, measured, () => correctionOf(font));
 * ```
 */
export function correctEmojiAdvance(
  text: string,
  width: number,
  correction: () => number,
): number {
  if (!MaybeEmoji.test(text)) return width;
  const each = correction();
  if (each === 0) return width;
  return width - countEmojiGraphemes(text) * each;
}
