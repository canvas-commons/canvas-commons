/**
 * Thin wrapper over `Intl.Segmenter` with a per-locale, per-granularity cache
 * and a graceful fallback for environments where `Intl.Segmenter` is
 * unavailable.
 */
import {createSignal} from '@canvas-commons/core';
import {setLocale} from '@chenglou/pretext';

export type SegmentGranularity = 'word' | 'grapheme' | 'sentence';

type Segment = {
  segment: string;
  index: number;
  isWordLike?: boolean;
};

interface SegmenterLike {
  segment(input: string): Iterable<Segment>;
}

interface SegmenterCtor {
  new (
    locale: string | undefined,
    options: {granularity: SegmentGranularity},
  ): SegmenterLike;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
type IntlWithSegmenter = typeof Intl & {Segmenter: SegmenterCtor};

const IntlSegmenter: SegmenterCtor | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? ((Intl as IntlWithSegmenter).Segmenter ?? null)
    : null;

const Cache = new Map<string, SegmenterLike>();
const LocaleVersion = createSignal(0);
let CurrentLocale: string | undefined;

/**
 * Set the locale the line breaker and every segmenter read.
 *
 * @remarks
 * Word, grapheme and sentence boundaries depend on it, so a change bumps
 * {@link textLocaleVersion} and everything measured before it is re-measured.
 *
 * @example
 * ```ts
 * setPretextLocale('de');
 * ```
 */
export function setPretextLocale(locale?: string): void {
  setLocale(locale);
  CurrentLocale = locale;
  LocaleVersion(LocaleVersion() + 1);
}

/**
 * Reactive token for the segmentation locale, read where {@link segment} is.
 *
 * @example
 * ```ts
 * textLocaleVersion();
 * ```
 */
export function textLocaleVersion(): number {
  return LocaleVersion();
}

function getSegmenter(granularity: SegmentGranularity): SegmenterLike | null {
  if (!IntlSegmenter) return null;
  const key = `${CurrentLocale ?? ''} ${granularity}`;
  let s = Cache.get(key);
  if (!s) {
    s = new IntlSegmenter(CurrentLocale, {granularity});
    Cache.set(key, s);
  }
  return s;
}

function fallbackWords(input: string): Segment[] {
  const out: Segment[] = [];
  const re = /\S+|\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    out.push({
      segment: m[0],
      index: m.index,
      isWordLike: /\S/.test(m[0]),
    });
  }
  return out;
}

function fallbackGraphemes(input: string): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  for (const ch of input) {
    out.push({segment: ch, index: i});
    i += ch.length;
  }
  return out;
}

function fallbackSentences(input: string): Segment[] {
  const out: Segment[] = [];
  const re = /[^.!?]+[.!?]?\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m[0].length === 0) break;
    out.push({segment: m[0], index: m.index});
  }
  return out;
}

/**
 * Segment a string by the requested granularity. Each returned chunk carries
 * its starting byte offset in the input and, for `'word'`, whether the chunk
 * is a word-like run vs whitespace/punctuation.
 */
export function segment(
  input: string,
  granularity: SegmentGranularity,
): Segment[] {
  const s = getSegmenter(granularity);
  if (s) return Array.from(s.segment(input));
  switch (granularity) {
    case 'word':
      return fallbackWords(input);
    case 'grapheme':
      return fallbackGraphemes(input);
    case 'sentence':
      return fallbackSentences(input);
  }
}
