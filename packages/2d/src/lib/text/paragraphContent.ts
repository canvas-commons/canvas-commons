/**
 * One logical paragraph, built from the styled runs a caller holds.
 *
 * The text is normalized here and only here, before anything indexes it, so
 * every later pass shares one string, one set of offsets, and one owner per
 * character.
 */
import type {
  NormalizedText,
  WhiteSpaceMode,
} from './pretext-derived/normalizeWhitespace';
import {
  normalizeWhitespace,
  normalizeWhitespaceText,
} from './pretext-derived/normalizeWhitespace';

export type {WhiteSpaceMode};

/** The character an inline object holds in the paragraph text. */
export const OBJECT_MARKER = '￼';

/** What a measurement of a run depends on. */
export type RunMetrics = {
  font: string;
  letterSpacing: number;
};

type RunBase<TOwner, TPaint> = {
  /** Identity of the node the characters belong to. */
  owner: TOwner;
  /** Paint of the run, which no geometry may depend on. */
  paint: TPaint;
  metrics: RunMetrics;
};

export type TextContentRun<TOwner, TPaint> = RunBase<TOwner, TPaint> & {
  kind: 'text';
  text: string;
};

export type ObjectContentRun<TOwner, TPaint> = RunBase<TOwner, TPaint> & {
  kind: 'object';
  width: number;
  height: number;
};

/** A styled piece of text, or an object that takes one slot between pieces. */
export type ContentRun<TOwner, TPaint> =
  TextContentRun<TOwner, TPaint> | ObjectContentRun<TOwner, TPaint>;

/** A position in the raw text of one run. */
export type SourceRef = {
  run: number;
  offset: number;
};

/** A range of the paragraph text every character of which measures alike. */
export type MetricSpan = {
  start: number;
  end: number;
  metrics: RunMetrics;
};

/** A range of the paragraph text one run paints. */
export type OwnerSpan<TOwner, TPaint> = {
  start: number;
  end: number;
  run: number;
  owner: TOwner;
  paint: TPaint;
};

/** An inline object, at the offset of its marker in the paragraph text. */
export type InlineObject<TOwner, TPaint> = {
  at: number;
  run: number;
  owner: TOwner;
  paint: TPaint;
  width: number;
  height: number;
};

/** The map between raw run offsets and paragraph offsets, both ways. */
export type ParagraphSource = {
  /**
   * Paragraph offset of a raw offset of a run. A raw offset the normalization
   * dropped takes the offset of the next character that survived.
   */
  toParagraph(run: number, offset: number): number;
  /**
   * Every raw offset that produced the paragraph character at `offset`. A
   * collapsed run of whitespace keeps all of its contributors, in order.
   */
  toSource(offset: number): readonly SourceRef[];
};

export type ParagraphContent<TOwner, TPaint> = {
  /** The normalized text of the whole paragraph. */
  text: string;
  metricSpans: readonly MetricSpan[];
  ownerSpans: readonly OwnerSpan<TOwner, TPaint>[];
  objects: readonly InlineObject<TOwner, TPaint>[];
  source: ParagraphSource;
};

function sameMetrics(a: RunMetrics, b: RunMetrics): boolean {
  return a.font === b.font && a.letterSpacing === b.letterSpacing;
}

function rawLength<TOwner, TPaint>(run: ContentRun<TOwner, TPaint>): number {
  return run.kind === 'text' ? run.text.length : OBJECT_MARKER.length;
}

/**
 * Build one normalized paragraph from `runs`, with the spans and the source
 * map every later pass reads. An object marker ends a run of whitespace and a
 * line break pair, so nothing joins across an object.
 */
export function buildParagraphContent<TOwner, TPaint>(
  runs: readonly ContentRun<TOwner, TPaint>[],
  whiteSpace: WhiteSpaceMode,
): ParagraphContent<TOwner, TPaint> {
  const runStarts: number[] = [];
  let joined = '';
  for (const run of runs) {
    runStarts.push(joined.length);
    joined += run.kind === 'text' ? run.text : OBJECT_MARKER;
  }
  /** Index of the run a raw offset of the joined text belongs to. */
  const runAt = (offset: number): number => {
    let low = 0;
    let high = runStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (runStarts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low;
  };

  // One text run owns every character, so the spans are known without a walk
  // and the source map is built only when it is asked for.
  const single = runs.length === 1 && runs[0].kind === 'text' ? runs[0] : null;
  let normalized: NormalizedText | null =
    single === null ? normalizeWhitespace(joined, whiteSpace) : null;
  const mapped = () => (normalized ??= normalizeWhitespace(joined, whiteSpace));
  const text =
    normalized === null
      ? normalizeWhitespaceText(joined, whiteSpace)
      : normalized.text;

  const metricSpans: MetricSpan[] = [];
  const ownerSpans: OwnerSpan<TOwner, TPaint>[] = [];
  const objects: InlineObject<TOwner, TPaint>[] = [];
  if (single !== null) {
    const end = text.length;
    if (end > 0) {
      ownerSpans.push({
        start: 0,
        end,
        run: 0,
        owner: single.owner,
        paint: single.paint,
      });
      metricSpans.push({start: 0, end, metrics: single.metrics});
    }
  } else {
    const {sourceStarts} = mapped();
    for (let at = 0; at < text.length; at++) {
      const index = runAt(sourceStarts[at]);
      const run = runs[index];
      const owner = ownerSpans[ownerSpans.length - 1];
      if (owner !== undefined && owner.run === index) {
        owner.end = at + 1;
      } else {
        ownerSpans.push({
          start: at,
          end: at + 1,
          run: index,
          owner: run.owner,
          paint: run.paint,
        });
      }

      const metrics = metricSpans[metricSpans.length - 1];
      if (metrics !== undefined && sameMetrics(metrics.metrics, run.metrics)) {
        metrics.end = at + 1;
      } else {
        metricSpans.push({start: at, end: at + 1, metrics: run.metrics});
      }

      if (run.kind === 'object') {
        objects.push({
          at,
          run: index,
          owner: run.owner,
          paint: run.paint,
          width: run.width,
          height: run.height,
        });
      }
    }
  }

  const source: ParagraphSource = {
    toParagraph(run, offset) {
      const clamped = Math.min(Math.max(offset, 0), rawLength(runs[run]));
      return mapped().offsets[runStarts[run] + clamped];
    },
    toSource(offset) {
      const refs: SourceRef[] = [];
      if (offset < 0 || offset >= text.length) return refs;
      const {sourceStarts, sourceEnds} = mapped();
      for (let at = sourceStarts[offset]; at < sourceEnds[offset]; at++) {
        const run = runAt(at);
        refs.push({run, offset: at - runStarts[run]});
      }
      return refs;
    },
  };

  return {text, metricSpans, ownerSpans, objects, source};
}
