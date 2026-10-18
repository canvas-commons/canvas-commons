import {Vector2, clampRemap} from '@canvas-commons/core';
import {pairCode} from '../code/CodeContent';
import {RawCodeFragment} from '../code/CodeFragment';
import {defaultTokenize} from '../code/CodeTokenizer';
import {
  ContentPieces,
  ContentTransitions,
  ContentUnit,
  Splice,
  createUnitKey,
} from '../content';
import {segment} from '../text';
import type {TxtLeaf} from './TxtLeaf';

/** Text of one leaf, as a piece of the paragraph a root `Txt` lays out. */
export interface TxtPiece {
  readonly leaf: TxtLeaf;
  readonly text: string;
}

/** What one replacement of an edit removes and inserts. */
export interface TxtChange {
  readonly removed: string;
  readonly inserted: string;
}

export type TxtTransitions = ContentTransitions<TxtChange>;

/** A fragment of {@link Txt} text: kept text, or an edit fragment. */
export type TxtTag = string | RawCodeFragment;

/** A half-open range of the text of a `Txt`, in UTF-16 offsets. */
export type TxtRange = readonly [number, number];

/**
 * Words of `text`, each with the spaces and punctuation after it. A newline
 * ends a word, so a word never spans two hard lines.
 */
export function txtWords(text: string): string[] {
  const words: string[] = [];
  let open = false;
  for (const {segment: part, isWordLike} of segment(text, 'word')) {
    const last = words.length - 1;
    if (open && !isWordLike && last >= 0) {
      words[last] += part;
    } else {
      words.push(part);
    }
    open = !part.endsWith('\n');
  }
  return words;
}

export function txtPieces(leaf: TxtLeaf, text: string): TxtPiece[] {
  return txtWords(text).map(word => ({leaf, text: word}));
}

export const TxtPieces: ContentPieces<TxtPiece> = {
  text: piece => piece.text,
  slice: (piece, from, to) => txtPieces(piece.leaf, piece.text.slice(from, to)),
  atomic: () => false,
  join: (first, second) =>
    first.leaf === second.leaf &&
    txtWords(first.text + second.text).length === 1
      ? {leaf: first.leaf, text: first.text + second.text}
      : null,
};

/** The leaves and texts the last edit wrote, with the units it keyed. */
export interface TxtKeys {
  readonly leaves: readonly TxtLeaf[];
  readonly texts: readonly string[];
  readonly units: readonly ContentUnit<TxtPiece>[];
}

/**
 * The units of the text of `leaves`. They are the recorded units while every
 * leaf holds the text recorded for it; any other text gets new keys.
 */
export function txtUnits(
  leaves: readonly TxtLeaf[],
  texts: readonly string[],
  recorded: TxtKeys | null,
): readonly ContentUnit<TxtPiece>[] {
  if (
    recorded &&
    recorded.leaves.length === leaves.length &&
    leaves.every(
      (leaf, i) =>
        recorded.leaves[i] === leaf && recorded.texts[i] === texts[i],
    )
  ) {
    return recorded.units;
  }
  return leaves.flatMap((leaf, i) =>
    txtPieces(leaf, texts[i]).map(piece => ({key: createUnitKey(), piece})),
  );
}

/** The text each leaf holds once `units` are written. */
export function leafTexts(
  leaves: readonly TxtLeaf[],
  units: readonly ContentUnit<TxtPiece>[],
): string[] {
  const texts = new Map<TxtLeaf, string>();
  for (const {piece} of units) {
    texts.set(piece.leaf, (texts.get(piece.leaf) ?? '') + piece.text);
  }
  return leaves.map(leaf => texts.get(leaf) ?? '');
}

/** A leaf and where its text sits in the text of the `Txt` that edits it. */
export interface LeafSpan {
  readonly leaf: TxtLeaf;
  readonly start: number;
  readonly end: number;
}

export function leafSpans(
  leaves: readonly TxtLeaf[],
  texts: readonly string[],
  base = 0,
): LeafSpan[] {
  let start = base;
  return leaves.map((leaf, i) => {
    const span = {leaf, start, end: start + texts[i].length};
    start = span.end;
    return span;
  });
}

/**
 * The leaf that takes the text a replacement of `[from, to)` inserts. A
 * replacement keeps the leaf of the text it replaces; an insertion continues
 * the leaf before it.
 */
export function insertionLeaf(
  spans: readonly LeafSpan[],
  from: number,
  to: number,
): TxtLeaf {
  const holds =
    to > from
      ? (span: LeafSpan) => span.start <= from && from < span.end
      : (span: LeafSpan) => span.start < from && from <= span.end;
  const span =
    spans.find(holds) ??
    spans.find(one => one.start === from) ??
    spans[spans.length - 1];
  return span.leaf;
}

/** The replacements an edit template makes to `current`. */
export function templateReplacements(
  current: string,
  tags: readonly TxtTag[],
): {
  next: string;
  replacements: {from: number; to: number; text: string}[];
} {
  let before = '';
  let next = '';
  const replacements: {from: number; to: number; text: string}[] = [];
  for (const tag of tags) {
    if (typeof tag === 'string') {
      before += tag;
      next += tag;
    } else {
      if (tag.before !== tag.after) {
        replacements.push({
          from: before.length,
          to: before.length + tag.before.length,
          text: tag.after,
        });
      }
      before += tag.before;
      next += tag.after;
    }
  }
  if (before === current) {
    return {next, replacements};
  }
  return {next, replacements: diffReplacements(current, next)};
}

/** The replacements a word diff of two texts pairs. */
export function diffReplacements(
  before: string,
  after: string,
): {from: number; to: number; text: string}[] {
  let shift = 0;
  return pairCode(before, after, defaultTokenize).map(({from, to, length}) => {
    const start = from + shift;
    shift += length - (to - from);
    return {from, to, text: after.slice(start, start + length)};
  });
}

/** The splices of replacements made in the text of a `Txt`'s own leaves. */
export function txtSplices(
  spans: readonly LeafSpan[],
  replacements: readonly {from: number; to: number; text: string}[],
): Splice<TxtPiece>[] {
  const base = spans[0]?.start ?? 0;
  return replacements.map(({from, to, text}) => {
    const start = base + from;
    const end = base + to;
    return {
      from: start,
      to: end,
      inserted: txtPieces(insertionLeaf(spans, start, end), text),
    };
  });
}

/** Fade the old text out and the new text in, while the rest glides. */
export const DefaultTxtTransitions: TxtTransitions = {
  incoming: (pose, progress) => ({
    ...pose,
    opacity: pose.opacity * clampRemap(0.25, 1, 0, 1, progress),
  }),
  outgoing: (pose, progress) => ({
    ...pose,
    opacity: pose.opacity * clampRemap(0, 0.75, 1, 0, progress),
  }),
  move: (pose, progress, delta) => ({
    ...pose,
    position: pose.position.add(Vector2.lerp(delta, Vector2.zero, progress)),
  }),
  morph: progress => 1 - progress,
};
