import {Vector2} from '@canvas-commons/core';
import {
  ContentLayout,
  ContentUnit,
  UnitKey,
  unitAt,
  unitStarts,
} from '../content';
import {
  ContentRun,
  ParagraphContent,
  ParagraphItems,
  PlacedLine,
  PlacedParagraph,
  PlacedPiece,
  SOFT_HYPHEN,
  paintAnchorOf,
  paintsText,
  rangeExtentOf,
} from '../text';
import type {Layout} from './Layout';
import type {Txt} from './Txt';
import type {TxtLeaf} from './TxtLeaf';
import {TxtPiece, TxtPieces} from './txtContent';

export type FontComponents = {
  style: string;
  weight: number;
  size: number;
  family: string;
};

/** What a run measures with; no paint value may reach it. */
export type RunTypeface = {
  font: string;
  fontComponents: FontComponents;
  letterSpacing: number;
};

/** A run's typeface, the node whose paint it takes, and the leaf it shows. */
export type TxtRunStyle = RunTypeface & {node: Txt; leaf: TxtLeaf | null};
export type TxtRun = ContentRun<Layout | null, TxtRunStyle>;
export type TxtContent = ParagraphContent<Layout | null, TxtRunStyle>;

/** One draw of text a unit left behind, from where the unit starts. */
export interface TxtSnapshotPart {
  readonly text: string;
  readonly offset: Vector2;
  readonly run: TxtRunStyle;
}

/** How text an edit removed was drawn. */
export interface TxtSnapshot {
  readonly parts: readonly TxtSnapshotPart[];
}

interface LinePiece {
  readonly piece: PlacedPiece;
  readonly line: PlacedLine;
}

/** The pieces of a placement in source order. */
class PieceIndex {
  private readonly pieces: LinePiece[] = [];

  public constructor(placed: PlacedParagraph) {
    for (const line of placed.lines) {
      for (const piece of line.pieces) this.pieces.push({piece, line});
    }
    this.pieces.sort((a, b) => a.piece.sourceStart - b.piece.sourceStart);
  }

  /** The index of the last piece that starts at or before `offset`. */
  public indexAt(offset: number): number {
    let low = 0;
    let high = this.pieces.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.pieces[middle].piece.sourceStart <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low;
  }

  /** Where the boundary at `offset` is drawn, from the block's top left. */
  public edge(offset: number): Vector2 {
    const found = this.pieces[this.indexAt(offset)];
    if (!found) return Vector2.zero;
    const {piece, line} = found;
    const start = piece.rtl ? piece.x + piece.advance : piece.x;
    const end = piece.rtl ? piece.x : piece.x + piece.advance;
    const x =
      offset <= piece.sourceStart
        ? start
        : offset >= piece.sourceEnd
          ? end
          : rangeExtentOf(piece, offset, offset).left;
    return new Vector2(x, line.baseline);
  }

  public *between(from: number, to: number): Iterable<LinePiece> {
    for (
      let i = this.indexAt(from);
      i < this.pieces.length && this.pieces[i].piece.sourceStart < to;
      i++
    ) {
      if (this.pieces[i].piece.sourceEnd > from) yield this.pieces[i];
    }
  }
}

const Indices = new WeakMap<PlacedParagraph, PieceIndex>();

function indexOf(placed: PlacedParagraph): PieceIndex {
  let index = Indices.get(placed);
  if (!index) {
    index = new PieceIndex(placed);
    Indices.set(placed, index);
  }
  return index;
}

/** The offset in a hyphenated run of an offset in the text of its leaf. */
function runOffset(run: string, leaf: string, offset: number): number {
  if (run === leaf) return offset;
  let at = 0;
  for (let i = 0; i < offset && at < run.length; at++) {
    if (run[at] !== SOFT_HYPHEN || leaf[i] === SOFT_HYPHEN) i++;
  }
  return at;
}

/** Where each unit starts, and the first unit of the leaf it shows. */
interface UnitIndex {
  readonly starts: readonly number[];
  readonly leafFirst: readonly number[];
  /** The text length of the leaf each unit shows. */
  readonly leafLength: readonly number[];
  readonly keys: ReadonlyMap<UnitKey, number>;
}

const UnitIndices = new WeakMap<readonly ContentUnit<TxtPiece>[], UnitIndex>();

function unitIndexOf(units: readonly ContentUnit<TxtPiece>[]): UnitIndex {
  let index = UnitIndices.get(units);
  if (!index) {
    const leafFirst: number[] = [];
    const keys = new Map<UnitKey, number>();
    const starts = unitStarts(TxtPieces, units);
    units.forEach((unit, i) => {
      leafFirst.push(
        i > 0 && units[i - 1].piece.leaf === unit.piece.leaf
          ? leafFirst[i - 1]
          : i,
      );
      keys.set(unit.key, starts[i]);
    });
    const leafLength: number[] = [];
    for (let i = units.length - 1; i >= 0; i--) {
      leafLength[i] =
        i < units.length - 1 && leafFirst[i + 1] === leafFirst[i]
          ? leafLength[i + 1]
          : starts[i + 1] - starts[leafFirst[i]];
    }
    index = {starts, leafFirst, leafLength, keys};
    UnitIndices.set(units, index);
  }
  return index;
}

/**
 * Where the units of a text are drawn, in the space of the root `Txt` that
 * lays them out.
 */
export class TxtLayout implements ContentLayout {
  private readonly index: UnitIndex;

  /**
   * @param origin - The top left of the text block in the root's space.
   * @param size - The box the text measures, before an edit moves it.
   */
  public constructor(
    private readonly units: readonly ContentUnit<TxtPiece>[],
    private readonly runs: readonly TxtRun[],
    private readonly content: TxtContent | null,
    private readonly items: ParagraphItems | null,
    private readonly placed: PlacedParagraph | null,
    public readonly origin: Vector2,
    public readonly size: Vector2,
  ) {
    this.index = unitIndexOf(units);
  }

  /** A layout of the same text whose block starts at `origin`. */
  public at(origin: Vector2): TxtLayout {
    return new TxtLayout(
      this.units,
      this.runs,
      this.content,
      this.items,
      this.placed,
      origin,
      this.size,
    );
  }

  public position(key: UnitKey): Vector2 | undefined {
    const start = this.index.keys.get(key);
    return start === undefined ? undefined : this.caret(start);
  }

  public caret(offset: number): Vector2 {
    return this.placed
      ? this.origin.add(indexOf(this.placed).edge(this.paragraphOffset(offset)))
      : this.origin;
  }

  /** The offset in the paragraph text of an offset in the text of the units. */
  public paragraphOffset(offset: number): number {
    const {content, units} = this;
    const {starts, leafFirst, leafLength} = this.index;
    if (!content || units.length === 0) return 0;
    const index = unitAt(starts, offset);
    const leaf = units[index].piece.leaf;
    const run = this.runs.findIndex(
      one => one.kind === 'text' && one.paint.leaf === leaf,
    );
    const found = this.runs[run];
    if (!found || found.kind !== 'text') return 0;
    const first = leafFirst[index];
    const inLeaf = offset - starts[first];
    return content.source.toParagraph(
      run,
      found.text.length === leafLength[index]
        ? inLeaf
        : runOffset(found.text, this.leafText(first), inLeaf),
    );
  }

  /** How the text `[from, to)` is drawn, from the point `at`. */
  public snapshot(from: number, to: number, at: Vector2): TxtSnapshot {
    const {placed, content, items} = this;
    if (!placed || !content || !items) return {parts: []};
    const start = this.paragraphOffset(from);
    const end = this.paragraphOffset(to);
    const parts: TxtSnapshotPart[] = [];
    for (const {piece, line} of indexOf(placed).between(start, end)) {
      if (!paintsText(items, piece)) continue;
      const partStart = Math.max(start, piece.sourceStart);
      const anchor = paintAnchorOf(
        piece,
        partStart,
        Math.min(end, piece.sourceEnd),
      );
      const span = content.ownerSpans.find(
        one => one.start <= partStart && partStart < one.end,
      );
      if (!span) continue;
      parts.push({
        text: anchor.text,
        offset: this.origin
          .add(new Vector2(anchor.penX, line.baseline))
          .sub(at),
        run: span.paint,
      });
    }
    return {parts};
  }

  private leafText(first: number): string {
    const {units} = this;
    let text = '';
    for (
      let i = first;
      i < units.length && units[i].piece.leaf === units[first].piece.leaf;
      i++
    ) {
      text += units[i].piece.text;
    }
    return text;
  }
}
