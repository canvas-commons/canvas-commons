export type UnitKey = number;

/** The key whose motion entries change the size of the whole content. */
export const ContentBoxKey: UnitKey = 0;

let LastKey = ContentBoxKey;

export function createUnitKey(): UnitKey {
  return ++LastKey;
}

/** A piece of the content source with an identity that edits keep. */
export interface ContentUnit<TPiece> {
  readonly key: UnitKey;
  readonly piece: TPiece;
}

/** The old source `[from, to)` becomes `length` characters of the new one. */
export interface Replacement {
  readonly from: number;
  readonly to: number;
  readonly length: number;
}

/** What the core needs to know about the pieces of a content type. */
export interface ContentPieces<TPiece> {
  text(piece: TPiece): string;
  /** The pieces that show `text(piece).slice(from, to)`. */
  slice(piece: TPiece, from: number, to: number): readonly TPiece[];
  /** Whether the piece must stay whole to keep its meaning. */
  atomic(piece: TPiece): boolean;
  /** One piece that shows both, or `null` when they must stay apart. */
  join(first: TPiece, second: TPiece): TPiece | null;
}

/** Where a new unit was in the old source, and whose motion it carries on. */
export interface UnitOrigin {
  readonly offset: number;
  readonly heir: UnitKey | null;
  /** The replacement that inserted the unit. */
  readonly inserted: number | null;
}

/** An old part that a replacement removed, in old offsets. */
export interface RemovedPart {
  readonly key: UnitKey;
  readonly heir: UnitKey | null;
  readonly from: number;
  readonly to: number;
  readonly replacement: number;
}

export interface Rekeyed<TPiece> {
  readonly units: ContentUnit<TPiece>[];
  readonly origins: Map<UnitKey, UnitOrigin>;
  readonly removed: RemovedPart[];
  /** Where each replacement starts in the new source. */
  readonly starts: readonly number[];
  mapOffset(offset: number): number;
}

export function joinText<TPiece>(
  pieces: ContentPieces<TPiece>,
  units: readonly ContentUnit<TPiece>[],
): string {
  let text = '';
  for (const unit of units) {
    text += pieces.text(unit.piece);
  }
  return text;
}

/** The start offset of each unit, and the end of the source last. */
export function unitStarts<TPiece>(
  pieces: ContentPieces<TPiece>,
  units: readonly ContentUnit<TPiece>[],
): number[] {
  const starts = [0];
  for (const unit of units) {
    starts.push(starts[starts.length - 1] + pieces.text(unit.piece).length);
  }
  return starts;
}

/** The index of the unit that holds `offset`; the last unit holds the end. */
export function unitAt(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = Math.max(0, starts.length - 2);
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/** The old source `[from, to)` becomes the `inserted` pieces. */
export interface Splice<TPiece> {
  readonly from: number;
  readonly to: number;
  readonly inserted: readonly TPiece[];
}

/** The pieces of `units` with each splice made. */
export function spliceContent<TPiece>(
  pieces: ContentPieces<TPiece>,
  units: readonly ContentUnit<TPiece>[],
  splices: readonly Splice<TPiece>[],
): {next: TPiece[]; replacements: Replacement[]} {
  const next: TPiece[] = [];
  const replacements: Replacement[] = [];
  let splice = 0;
  let offset = 0;
  const insert = () => {
    const {from, to, inserted} = splices[splice++];
    next.push(...inserted);
    replacements.push({
      from,
      to,
      length: inserted.reduce((sum, one) => sum + pieces.text(one).length, 0),
    });
  };
  for (const {piece} of units) {
    const length = pieces.text(piece).length;
    const end = offset + length;
    let kept = offset;
    while (splice < splices.length && splices[splice].from < end) {
      const {from, to} = splices[splice];
      if (from > kept) {
        next.push(...pieces.slice(piece, kept - offset, from - offset));
      }
      kept = Math.max(kept, Math.min(to, end));
      if (to > end) break;
      insert();
    }
    if (kept === offset) {
      next.push(piece);
    } else if (kept < end) {
      next.push(...pieces.slice(piece, kept - offset, length));
    }
    offset = end;
  }
  while (splice < splices.length) insert();
  return {next, replacements};
}

interface Cut {
  readonly at: number;
  readonly replacementEdge: boolean;
}

/** Key the `next` pieces from the `old` units. */
export function rekey<TPiece>(
  pieces: ContentPieces<TPiece>,
  old: readonly ContentUnit<TPiece>[],
  next: readonly TPiece[],
  replacements: readonly Replacement[],
): Rekeyed<TPiece> {
  const oldStarts = unitStarts(pieces, old);
  const starts: number[] = [];
  let shift = 0;
  for (const {from, to, length} of replacements) {
    starts.push(from + shift);
    shift += length - (to - from);
  }

  const mapOffset = (offset: number) => {
    for (let i = replacements.length - 1; i >= 0; i--) {
      const {from, to, length} = replacements[i];
      if (offset >= from) {
        return offset >= to ? offset + starts[i] + length - to : starts[i];
      }
    }
    return offset;
  };
  const toOld = (offset: number) => {
    for (let i = replacements.length - 1; i >= 0; i--) {
      const end = starts[i] + replacements[i].length;
      if (offset >= end) {
        return offset - end + replacements[i].to;
      }
    }
    return offset;
  };
  const replacementAt = (offset: number) =>
    replacements.findIndex(
      ({length}, i) => starts[i] <= offset && offset < starts[i] + length,
    );

  const cuts: Cut[] = [];
  replacements.forEach(({length}, i) => {
    cuts.push({at: starts[i], replacementEdge: true});
    cuts.push({at: starts[i] + length, replacementEdge: true});
  });
  for (let i = 1; i < oldStarts.length - 1; i++) {
    cuts.push({at: mapOffset(oldStarts[i]), replacementEdge: false});
  }
  cuts.sort((a, b) => a.at - b.at);

  const units: ContentUnit<TPiece>[] = [];
  const origins = new Map<UnitKey, UnitOrigin>();
  const reused = new Set<UnitKey>();
  const emit = (piece: TPiece, offset: number) => {
    const inserted = replacementAt(offset);
    if (inserted !== -1) {
      const key = createUnitKey();
      units.push({key, piece});
      origins.set(key, {
        offset: replacements[inserted].from,
        heir: null,
        inserted,
      });
      return;
    }
    const from = toOld(offset);
    const index = unitAt(oldStarts, from);
    const source = old[index];
    const to = from + pieces.text(piece).length;
    if (
      source &&
      !reused.has(source.key) &&
      oldStarts[index] === from &&
      oldStarts[index + 1] === to
    ) {
      reused.add(source.key);
      units.push({key: source.key, piece});
      origins.set(source.key, {offset: from, heir: null, inserted: null});
      return;
    }
    const key = createUnitKey();
    units.push({key, piece});
    origins.set(key, {offset: from, heir: source?.key ?? null, inserted: null});
  };

  let offset = 0;
  let cut = 0;
  for (const piece of next) {
    const end = offset + pieces.text(piece).length;
    while (cut < cuts.length && cuts[cut].at <= offset) cut++;
    const inside: Cut[] = [];
    for (let i = cut; i < cuts.length && cuts[i].at < end; i++) {
      inside.push(cuts[i]);
    }
    const keepWhole = pieces.atomic(piece)
      ? !inside.some(({replacementEdge}) => replacementEdge)
      : inside.length === 0;
    if (keepWhole) {
      emit(piece, offset);
    } else {
      let from = 0;
      for (const to of [
        ...new Set(inside.map(({at}) => at - offset)),
        end - offset,
      ]) {
        let partOffset = offset + from;
        for (const part of pieces.slice(piece, from, to)) {
          emit(part, partOffset);
          partOffset += pieces.text(part).length;
        }
        from = to;
      }
    }
    offset = end;
  }

  const removed: RemovedPart[] = [];
  replacements.forEach(({from, to}, replacement) => {
    for (let i = unitAt(oldStarts, from); i < old.length; i++) {
      const start = oldStarts[i];
      const end = oldStarts[i + 1];
      if (start >= to) break;
      const partFrom = Math.max(start, from);
      const partTo = Math.min(end, to);
      if (partFrom >= partTo) continue;
      const whole = partFrom === start && partTo === end;
      removed.push({
        key: whole ? old[i].key : createUnitKey(),
        heir: whole ? null : old[i].key,
        from: partFrom,
        to: partTo,
        replacement,
      });
    }
  });

  return {units, origins, removed, starts, mapOffset};
}
