import {
  SimpleSignal,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  createMotionStack,
  createSignal,
} from '@canvas-commons/core';
import {
  ContentBoxKey,
  ContentPieces,
  ContentUnit,
  Replacement,
  UnitKey,
  joinText,
  rekey,
  unitAt,
  unitStarts,
} from './units';

/** How a unit is drawn, in the units of its content's layout. */
export interface UnitPose {
  readonly position: Vector2;
  readonly opacity: number;
  readonly scale: number;
  /** The share of the unit's characters drawn, from the start. */
  readonly reveal: number;
}

/**
 * Pure functions from a drawn pose and the progress of an edit to the next
 * pose. Each one must return the pose it gets at progress 0, plus `delta`
 * for `move`, so an edit starts where the content is drawn.
 */
export interface ContentTransitions<TChange> {
  incoming(pose: UnitPose, progress: number, change: TChange): UnitPose;
  outgoing(pose: UnitPose, progress: number, change: TChange): UnitPose;
  move(pose: UnitPose, progress: number, delta: Vector2): UnitPose;
  /** How much of the snapshot a morphing unit still shows. */
  morph(progress: number): number;
}

export interface EntryBase<TChange> {
  readonly progress: SimpleSignal<number>;
  readonly transitions: Partial<ContentTransitions<TChange>>;
}

export interface IncomingEntry<TChange> extends EntryBase<TChange> {
  readonly kind: 'incoming';
  readonly change: TChange;
}

export interface OutgoingEntry<TSnapshot, TChange> extends EntryBase<TChange> {
  readonly kind: 'outgoing';
  readonly change: TChange;
  readonly snapshot: TSnapshot;
  /** The source offset the unit left from. */
  readonly anchor: number;
  /** Where the unit sits from the caret at `anchor`. */
  readonly relative: Vector2;
}

export interface MovedEntry<TChange> extends EntryBase<TChange> {
  readonly kind: 'moved';
  readonly delta: Vector2;
}

export interface MorphEntry<TSnapshot, TChange> extends EntryBase<TChange> {
  readonly kind: 'morph';
  readonly from: TSnapshot;
}

export type ContentEntry<TSnapshot, TChange> =
  | IncomingEntry<TChange>
  | OutgoingEntry<TSnapshot, TChange>
  | MovedEntry<TChange>
  | MorphEntry<TSnapshot, TChange>;

/** Rest positions of a laid out content. */
export interface ContentLayout {
  position(key: UnitKey): Vector2 | undefined;
  caret(offset: number): Vector2;
  readonly size: Vector2;
}

/** A unit whose text an edit kept, with its offsets before and after. */
export interface Survivor {
  readonly key: UnitKey;
  readonly before: number;
  readonly after: number;
  readonly length: number;
}

export interface ContentAdapter<
  TPiece,
  TSnapshot,
  TChange,
> extends ContentPieces<TPiece> {
  layout(units: readonly ContentUnit<TPiece>[]): ContentLayout;
  change(removed: string, inserted: string): TChange;
  /** How parts of `source` look, for units that leave it. */
  snapshots(
    source: string,
  ): (from: number, to: number, at: Vector2) => TSnapshot;
  /** The survivors that look different after the edit, with how they looked. */
  morphs(
    before: string,
    after: string,
    survivors: readonly Survivor[],
  ): Iterable<[UnitKey, TSnapshot]>;
}

/** The target pieces of an edit, and which old ranges they replace. */
export interface ContentChange<TPiece> {
  readonly next: readonly TPiece[];
  readonly replacements: readonly Replacement[];
}

/**
 * A running edit. Its data is known before the first frame: `leaving` holds
 * the ranges of the source text the edit removes or replaces, `arriving` the
 * ranges of the target text it inserts or replaces, and `progress` goes from
 * 0 to 1 as the edit plays.
 */
export type ContentEdit<TRange> = ThreadGenerator & {
  readonly progress: SimpleSignal<number>;
  readonly leaving: TRange[];
  readonly arriving: TRange[];
};

/** The range that `text.slice(from, to)` covers, in the coordinates of a content type. */
export type RangeOf<TRange> = (
  text: string,
  from: number,
  to: number,
) => TRange;

export interface EditMotion<TChange> {
  readonly progress: SimpleSignal<number>;
  readonly transitions: Partial<ContentTransitions<TChange>>;
}

export function restPose(position: Vector2): UnitPose {
  return {position, opacity: 1, scale: 1, reveal: 1};
}

/** An entry that `entryPose` reads, whatever it keys. */
export type PoseEntry<TChange> = EntryBase<TChange> &
  (
    | {readonly kind: 'incoming' | 'outgoing'; readonly change: TChange}
    | {readonly kind: 'moved'; readonly delta: Vector2}
    | {readonly kind: 'morph'}
  );

/** Apply `entries` to `rest`, oldest first. */
export function entryPose<TChange>(
  entries: readonly PoseEntry<TChange>[],
  rest: UnitPose,
  transitions: ContentTransitions<TChange>,
): UnitPose {
  let pose = rest;
  for (const entry of entries) {
    switch (entry.kind) {
      case 'incoming':
        pose = (entry.transitions.incoming ?? transitions.incoming)(
          pose,
          entry.progress(),
          entry.change,
        );
        break;
      case 'outgoing':
        pose = (entry.transitions.outgoing ?? transitions.outgoing)(
          pose,
          entry.progress(),
          entry.change,
        );
        break;
      case 'moved':
        pose = (entry.transitions.move ?? transitions.move)(
          pose,
          entry.progress(),
          entry.delta,
        );
        break;
    }
  }
  return pose;
}

/**
 * The motion of a content whose value always holds its target. Each edit adds
 * entries owned by its own progress signal and releases them by it.
 */
export class ContentMotion<TPiece, TSnapshot, TChange> {
  public readonly entries = createMotionStack<
    UnitKey,
    ContentEntry<TSnapshot, TChange>
  >();

  public constructor(
    private readonly adapter: ContentAdapter<TPiece, TSnapshot, TChange>,
    private readonly transitions: () => ContentTransitions<TChange>,
  ) {}

  /** Apply the entries of `key` to `rest`, oldest first. */
  public pose(
    key: UnitKey,
    rest: UnitPose,
    transitions: ContentTransitions<TChange>,
  ): UnitPose {
    return entryPose(this.entries.entries(key), rest, transitions);
  }

  /** The snapshots a unit blends from, newest first, with their weights. */
  public morphs(
    key: UnitKey,
    transitions: ContentTransitions<TChange>,
  ): {from: TSnapshot; weight: number}[] {
    const morphs: {from: TSnapshot; weight: number}[] = [];
    const entries = this.entries.get(key) ?? [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.kind === 'morph') {
        morphs.push({
          from: entry.from,
          weight: (entry.transitions.morph ?? transitions.morph)(
            entry.progress(),
          ),
        });
      }
    }
    return morphs;
  }

  /** The units that left the content and are still drawn. */
  public ghosts(): [UnitKey, OutgoingEntry<TSnapshot, TChange>][] {
    const ghosts: [UnitKey, OutgoingEntry<TSnapshot, TChange>][] = [];
    for (const key of this.entries.keys()) {
      const outgoing = this.outgoing(key);
      if (outgoing) {
        ghosts.push([key, outgoing]);
      }
    }
    return ghosts;
  }

  public ghostRest(
    ghost: OutgoingEntry<TSnapshot, TChange>,
    layout: ContentLayout,
  ): UnitPose {
    return restPose(layout.caret(ghost.anchor).add(ghost.relative));
  }

  /** Key `change.next` from `old` and add the entries that start the edit where `old` is drawn. */
  public apply(
    old: readonly ContentUnit<TPiece>[],
    {next, replacements}: ContentChange<TPiece>,
    motion?: EditMotion<TChange>,
  ): ContentUnit<TPiece>[] {
    const {adapter, entries} = this;
    const transitions = this.transitions();
    const oldText = joinText(adapter, old);
    const oldLayout = adapter.layout(old);
    const oldStarts = unitStarts(adapter, old);
    const drawn = (key: UnitKey, rest: Vector2) =>
      this.pose(key, restPose(rest), transitions).position;
    const drawnCaret = (offset: number) => {
      const unit = old[unitAt(oldStarts, offset)];
      const caret = oldLayout.caret(offset);
      const rest = unit && oldLayout.position(unit.key);
      return unit && rest ? caret.add(drawn(unit.key, rest).sub(rest)) : caret;
    };
    const ghostsBefore = new Map<UnitKey, Vector2>();
    for (const [key, ghost] of this.ghosts()) {
      ghostsBefore.set(
        key,
        drawn(key, this.ghostRest(ghost, oldLayout).position),
      );
    }
    const boxBefore = drawn(ContentBoxKey, oldLayout.size);

    const rekeyed = rekey(adapter, old, next, replacements);
    const inherit = (key: UnitKey, heir: UnitKey | null) => {
      const inherited = heir === null ? undefined : entries.get(heir);
      if (inherited) entries.set(key, inherited);
    };
    for (const [key, {heir}] of rekeyed.origins) inherit(key, heir);
    for (const {key, heir} of rekeyed.removed) inherit(key, heir);
    for (const key of ghostsBefore.keys()) {
      entries.set(
        key,
        entries
          .entries(key)
          .map(entry =>
            entry.kind === 'outgoing'
              ? {...entry, anchor: rekeyed.mapOffset(entry.anchor)}
              : entry,
          ),
      );
    }
    if (!motion) {
      return rekeyed.units;
    }

    const newText = joinText(adapter, rekeyed.units);
    const changes = replacements.map(({from, to, length}, i) =>
      adapter.change(
        oldText.slice(from, to),
        newText.slice(rekeyed.starts[i], rekeyed.starts[i] + length),
      ),
    );
    const befores = rekeyed.units.map(({key}) => {
      const origin = rekeyed.origins.get(key);
      return origin ? drawnCaret(origin.offset) : null;
    });
    const snapshot = adapter.snapshots(oldText);
    for (const part of rekeyed.removed) {
      const {from} = replacements[part.replacement];
      ghostsBefore.set(part.key, drawnCaret(part.from));
      entries.push(part.key, {
        ...motion,
        kind: 'outgoing',
        change: changes[part.replacement],
        snapshot: snapshot(part.from, part.to, oldLayout.caret(part.from)),
        anchor: rekeyed.starts[part.replacement],
        relative: oldLayout.caret(part.from).sub(oldLayout.caret(from)),
      });
    }

    const layout = adapter.layout(rekeyed.units);
    const move = (key: UnitKey, before: Vector2, rest: Vector2) => {
      const delta = before.sub(drawn(key, rest));
      if (!delta.exactlyEquals(Vector2.zero)) {
        entries.push(key, {...motion, kind: 'moved', delta});
      }
    };
    const survivors: Survivor[] = [];
    let offset = 0;
    rekeyed.units.forEach(({key, piece}, i) => {
      const length = adapter.text(piece).length;
      const origin = rekeyed.origins.get(key);
      const rest = layout.position(key);
      const before = befores[i];
      if (origin && rest && before) {
        move(key, before, rest);
        if (origin.inserted !== null) {
          entries.push(key, {
            ...motion,
            kind: 'incoming',
            change: changes[origin.inserted],
          });
        } else {
          survivors.push({key, before: origin.offset, after: offset, length});
        }
      }
      offset += length;
    });
    for (const [key, before] of ghostsBefore) {
      const ghost = this.outgoing(key);
      if (ghost) {
        move(key, before, this.ghostRest(ghost, layout).position);
      }
    }
    move(ContentBoxKey, boxBefore, layout.size);
    for (const [key, from] of adapter.morphs(oldText, newText, survivors)) {
      entries.push(key, {...motion, kind: 'morph', from});
    }

    return rekeyed.units;
  }

  /** Plan one edit now and run it from where the content is drawn when it starts. */
  public animate<TRange>(
    read: () => readonly ContentUnit<TPiece>[],
    write: (units: readonly ContentUnit<TPiece>[]) => void,
    plan: (units: readonly ContentUnit<TPiece>[]) => ContentChange<TPiece>,
    range: RangeOf<TRange>,
    duration: number,
    timing: TimingFunction,
    transitions: Partial<ContentTransitions<TChange>> = {},
  ): ContentEdit<TRange> {
    const progress = createSignal(0);
    const leaving: TRange[] = [];
    const arriving: TRange[] = [];
    const planned = (units: readonly ContentUnit<TPiece>[]) => {
      const change = plan(units);
      const oldText = joinText(this.adapter, units);
      const newText = change.next
        .map(piece => this.adapter.text(piece))
        .join('');
      leaving.length = 0;
      arriving.length = 0;
      let shift = 0;
      for (const {from, to, length} of change.replacements) {
        if (to > from) leaving.push(range(oldText, from, to));
        const start = from + shift;
        if (length > 0) arriving.push(range(newText, start, start + length));
        shift += length - (to - from);
      }
      return change;
    };
    const source = read();
    const change = planned(source);
    return Object.assign(
      this.run(
        read,
        write,
        source,
        change,
        planned,
        progress,
        duration,
        timing,
        transitions,
      ),
      {progress, leaving, arriving},
    );
  }

  /** Replans when other edits changed the units since the plan was made. */
  private *run(
    read: () => readonly ContentUnit<TPiece>[],
    write: (units: readonly ContentUnit<TPiece>[]) => void,
    source: readonly ContentUnit<TPiece>[],
    change: ContentChange<TPiece>,
    replan: (units: readonly ContentUnit<TPiece>[]) => ContentChange<TPiece>,
    progress: SimpleSignal<number>,
    duration: number,
    timing: TimingFunction,
    transitions: Partial<ContentTransitions<TChange>>,
  ): ThreadGenerator {
    const units = read();
    write(
      this.apply(units, units === source ? change : replan(units), {
        progress,
        transitions,
      }),
    );
    try {
      yield* progress(1, duration, timing);
    } finally {
      this.entries.release(progress);
      const units = read();
      const settled = this.settle(units);
      if (settled !== units) write(settled);
    }
  }

  /** Drop every entry, leaving the content at rest as the units hold it. */
  public finish(
    units: readonly ContentUnit<TPiece>[],
  ): readonly ContentUnit<TPiece>[] {
    for (const key of this.entries.keys()) {
      this.entries.delete(key);
    }
    return this.settle(units);
  }

  /** Join adjacent units that no entry moves, or answer `units` when nothing joins. */
  public settle(
    units: readonly ContentUnit<TPiece>[],
  ): readonly ContentUnit<TPiece>[] {
    const settled: ContentUnit<TPiece>[] = [];
    for (const unit of units) {
      const last = settled[settled.length - 1];
      const piece =
        last && !this.entries.has(last.key) && !this.entries.has(unit.key)
          ? this.adapter.join(last.piece, unit.piece)
          : null;
      if (last && piece !== null) {
        settled[settled.length - 1] = {key: last.key, piece};
      } else {
        settled.push(unit);
      }
    }
    return settled.length === units.length ? units : settled;
  }

  private outgoing(key: UnitKey): OutgoingEntry<TSnapshot, TChange> | null {
    for (const entry of this.entries.entries(key)) {
      if (entry.kind === 'outgoing') return entry;
    }
    return null;
  }
}
