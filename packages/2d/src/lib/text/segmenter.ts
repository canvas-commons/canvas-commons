/**
 * Thin wrapper over `Intl.Segmenter` with a per-granularity cache and a
 * graceful fallback for environments where `Intl.Segmenter` is unavailable.
 */

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

const Cache = new Map<SegmentGranularity, SegmenterLike>();

function getSegmenter(granularity: SegmentGranularity): SegmenterLike | null {
  if (!IntlSegmenter) return null;
  let s = Cache.get(granularity);
  if (!s) {
    s = new IntlSegmenter(undefined, {granularity});
    Cache.set(granularity, s);
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
