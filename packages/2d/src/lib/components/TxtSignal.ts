import {
  InterpolationFunction,
  Signal,
  SignalContext,
  SignalExtensions,
  SignalValue,
  TimingFunction,
  createComputed,
  createSignal,
  deepLerp,
  easeInOutCubic,
} from '@canvas-commons/core';
import {
  ContentAdapter,
  ContentChange,
  ContentEdit,
  ContentMotion,
  ContentUnit,
  editCall,
  spliceContent,
} from '../content';
import {addInitializer, getPropertyMetaOrCreate} from '../decorators';
import {makeSignalExtensions} from '../utils/makeSignalExtensions';
import {Txt} from './Txt';
import {TxtSnapshot} from './TxtLayout';
import {TxtLeaf} from './TxtLeaf';
import {
  TxtChange,
  TxtKeys,
  TxtPiece,
  TxtPieces,
  TxtRange,
  TxtTag,
  TxtTransitions,
  leafSpans,
  leafTexts,
  templateReplacements,
  txtSplices,
  txtUnits,
} from './txtContent';

export type TxtMotion = ContentMotion<TxtPiece, TxtSnapshot, TxtChange>;

type EditTransitions = Partial<TxtTransitions>;

type TxtEdit = ContentEdit<TxtRange>;

type TagGenerator = (
  strings: TemplateStringsArray,
  ...tags: TxtTag[]
) => TxtEdit;

type TxtPlan = (
  units: readonly ContentUnit<TxtPiece>[],
) => ContentChange<TxtPiece>;

interface TxtModifier<TOwner> {
  (text: string): TOwner;
  (text: string, duration: number, transitions?: EditTransitions): TxtEdit;
  (duration?: number, transitions?: EditTransitions): TagGenerator;
}

interface TxtInsert<TOwner> {
  (offset: number, text: string): TOwner;
  (
    offset: number,
    text: string,
    duration: number,
    transitions?: EditTransitions,
  ): TxtEdit;
  (
    offset: number,
    duration?: number,
    transitions?: EditTransitions,
  ): TagGenerator;
}

interface TxtReplace<TOwner> {
  (range: TxtRange, text: string): TOwner;
  (
    range: TxtRange,
    text: string,
    duration: number,
    transitions?: EditTransitions,
  ): TxtEdit;
  (
    range: TxtRange,
    duration?: number,
    transitions?: EditTransitions,
  ): TagGenerator;
}

interface TxtRemove<TOwner> {
  (range: TxtRange): TOwner;
  (range: TxtRange, duration: number, transitions?: EditTransitions): TxtEdit;
}

export interface TxtSignalHelpers<TOwner> {
  edit(duration?: number, transitions?: EditTransitions): TagGenerator;
  append: TxtModifier<TOwner>;
  prepend: TxtModifier<TOwner>;
  insert: TxtInsert<TOwner>;
  replace: TxtReplace<TOwner>;
  remove: TxtRemove<TOwner>;
}

export type TxtSignal<TOwner> = Signal<
  string,
  string,
  TOwner,
  TxtSignalContext<TOwner>
> &
  TxtSignalHelpers<TOwner>;

/**
 * The text of a `Txt`. Its value is always the target of the edits in
 * flight; their motion belongs to the root `Txt`, which draws it.
 */
export class TxtSignalContext<TOwner>
  extends SignalContext<string, string, TOwner>
  implements TxtSignalHelpers<TOwner>
{
  /** The edits in flight, when this node is a root `Txt`. */
  public readonly motion: TxtMotion;

  private readonly keys = createSignal<TxtKeys | null>(null);

  private readonly tweenSettlers = new Set<() => void>();

  /** The units of the text this node lays out, keyed by the last edit. */
  public readonly units = createComputed(() => {
    const leaves = this.node.textLeaves();
    return txtUnits(leaves, this.texts(leaves), this.keys());
  });

  public constructor(
    initial: SignalValue<string>,
    owner: TOwner,
    private readonly node: Txt,
    extensions: Partial<SignalExtensions<string, string>>,
    interpolation: InterpolationFunction<string> = deepLerp,
  ) {
    super(initial, interpolation, owner, undefined, extensions);
    const adapter: ContentAdapter<TxtPiece, TxtSnapshot, TxtChange> = {
      ...TxtPieces,
      layout: units => this.node.layoutText(units),
      change: (removed, inserted) => ({removed, inserted}),
      snapshots: () => {
        const layout = this.node.layoutText(this.units());
        return (from, to, at) => layout.snapshot(from, to, at);
      },
      morphs: () => [],
    };
    this.motion = new ContentMotion(adapter, () =>
      this.node.resolvedTransitions(),
    );
    for (const method of [
      'edit',
      'append',
      'prepend',
      'insert',
      'remove',
      'replace',
    ] as const) {
      Object.defineProperty(this.invokable, method, {
        value: this[method].bind(this),
      });
    }
  }

  public override isTweening(): boolean {
    return super.isTweening() || this.root().motion.entries.size() > 0;
  }

  /**
   * Let a whole-text tween end where a later edit starts. The tween leaves
   * the text at its target through `settle`; answer the call that leaves the
   * tween, which says whether the tween was still running.
   */
  public registerTween(settle: () => void): () => boolean {
    const settler = () => {
      this.tweening = false;
      settle();
    };
    const settlers = this.root().tweenSettlers;
    settlers.add(settler);
    return () => settlers.delete(settler);
  }

  /** Make the edits in flight end at their targets, for a whole-text tween. */
  public settleEdits() {
    const root = this.root();
    if (root.motion.entries.size() > 0) {
      root.write(root.motion.finish(root.units()));
    }
  }

  public edit(
    duration: number = 0.6,
    transitions?: EditTransitions,
  ): TagGenerator {
    return (strings, ...tags) =>
      this.animate(
        units => this.template(units, strings, tags),
        duration,
        transitions,
      );
  }

  public append(text: string): TOwner;
  public append(
    text: string,
    duration: number,
    transitions?: EditTransitions,
  ): TxtEdit;
  public append(duration?: number, transitions?: EditTransitions): TagGenerator;
  public append(
    first: string | number = 0.6,
    second?: number | EditTransitions,
    third?: EditTransitions,
  ): TOwner | TxtEdit | TagGenerator {
    return this.modify(
      (units, text) => {
        const end = this.ownLength();
        return this.splice(units, [end, end], text);
      },
      first,
      second,
      third,
    );
  }

  public prepend(text: string): TOwner;
  public prepend(
    text: string,
    duration: number,
    transitions?: EditTransitions,
  ): TxtEdit;
  public prepend(
    duration?: number,
    transitions?: EditTransitions,
  ): TagGenerator;
  public prepend(
    first: string | number = 0.6,
    second?: number | EditTransitions,
    third?: EditTransitions,
  ): TOwner | TxtEdit | TagGenerator {
    return this.modify(
      (units, text) => this.splice(units, [0, 0], text),
      first,
      second,
      third,
    );
  }

  public insert(offset: number, text: string): TOwner;
  public insert(
    offset: number,
    text: string,
    duration: number,
    transitions?: EditTransitions,
  ): TxtEdit;
  public insert(
    offset: number,
    duration?: number,
    transitions?: EditTransitions,
  ): TagGenerator;
  public insert(
    offset: number,
    first: string | number = 0.6,
    second?: number | EditTransitions,
    third?: EditTransitions,
  ): TOwner | TxtEdit | TagGenerator {
    return this.modify(
      (units, text) => this.splice(units, [offset, offset], text),
      first,
      second,
      third,
    );
  }

  public remove(range: TxtRange): TOwner;
  public remove(
    range: TxtRange,
    duration: number,
    transitions?: EditTransitions,
  ): TxtEdit;
  public remove(
    range: TxtRange,
    duration?: number,
    transitions?: EditTransitions,
  ): TOwner | TxtEdit {
    const plan: TxtPlan = units => this.splice(units, range, '');
    return duration === undefined
      ? this.change(plan)
      : this.animate(plan, duration, transitions);
  }

  public replace(range: TxtRange, text: string): TOwner;
  public replace(
    range: TxtRange,
    text: string,
    duration: number,
    transitions?: EditTransitions,
  ): TxtEdit;
  public replace(
    range: TxtRange,
    duration?: number,
    transitions?: EditTransitions,
  ): TagGenerator;
  public replace(
    range: TxtRange,
    first: string | number = 0.6,
    second?: number | EditTransitions,
    third?: EditTransitions,
  ): TOwner | TxtEdit | TagGenerator {
    return this.modify(
      (units, text) => this.splice(units, range, text),
      first,
      second,
      third,
    );
  }

  public override dispose() {
    this.units.context.dispose();
    this.keys.context.dispose();
    this.motion.entries.dispose();
    super.dispose();
  }

  public override toSignal(): TxtSignal<TOwner> {
    return this.invokable;
  }

  /** The text signal of the root `Txt`, which holds the motion. */
  private root(): TxtSignalContext<Txt> {
    return this.node.textRoot().text.context;
  }

  private texts(leaves: readonly TxtLeaf[]): string[] {
    return leaves.map(leaf => textOf(leaf.text()));
  }

  /** The leaves of this node in the root's text, made when it has none. */
  private ownSpans() {
    let own = this.node.textLeaves();
    if (own.length === 0) {
      this.node.add(new TxtLeaf({}));
      own = this.node.textLeaves();
    }
    const leaves = this.node.textRoot().textLeaves();
    const spans = leafSpans(leaves, this.texts(leaves));
    return spans.filter(span => own.includes(span.leaf));
  }

  private ownLength(): number {
    const spans = this.ownSpans();
    return spans.length === 0
      ? 0
      : spans[spans.length - 1].end - spans[0].start;
  }

  private splice(
    units: readonly ContentUnit<TxtPiece>[],
    [from, to]: TxtRange,
    text: string,
  ): ContentChange<TxtPiece> {
    const length = this.ownLength();
    const start = Math.max(0, Math.min(from, to, length));
    const end = Math.min(length, Math.max(from, to));
    return spliceContent(
      TxtPieces,
      units,
      txtSplices(this.ownSpans(), [{from: start, to: end, text}]),
    );
  }

  private template(
    units: readonly ContentUnit<TxtPiece>[],
    strings: TemplateStringsArray,
    tags: TxtTag[],
  ): ContentChange<TxtPiece> {
    const all: TxtTag[] = [];
    strings.forEach((string, i) => {
      all.push(string);
      if (i < tags.length) all.push(tags[i]);
    });
    const spans = this.ownSpans();
    const current = this.texts(spans.map(span => span.leaf)).join('');
    return spliceContent(
      TxtPieces,
      units,
      txtSplices(spans, templateReplacements(current, all).replacements),
    );
  }

  private modify(
    plan: (
      units: readonly ContentUnit<TxtPiece>[],
      text: string,
    ) => ContentChange<TxtPiece>,
    first: string | number,
    second?: number | EditTransitions,
    third?: EditTransitions,
  ): TOwner | TxtEdit | TagGenerator {
    return editCall(
      {
        change: p => this.change(p),
        animate: (p, duration, transitions) =>
          this.animate(p, duration, transitions),
      },
      plan,
      (strings, tags) =>
        strings.reduce((text, string, i) => {
          const tag = tags[i] ?? '';
          return text + string + (typeof tag === 'string' ? tag : tag.after);
        }, ''),
      first,
      second,
      third,
    );
  }

  private settleTweens() {
    const settlers = this.root().tweenSettlers;
    for (const settler of [...settlers]) {
      settlers.delete(settler);
      settler();
    }
  }

  private change(plan: TxtPlan): TOwner {
    const root = this.root();
    this.settleTweens();
    const units = root.units();
    root.write(root.motion.apply(units, plan(units)));
    return this.owner;
  }

  private animate(
    plan: TxtPlan,
    duration: number,
    transitions: EditTransitions = {},
    timing: TimingFunction = easeInOutCubic,
  ): TxtEdit {
    this.settleTweens();
    const root = this.root();
    const own =
      this.node.textRoot() === this.node ? {} : this.node.transitions();
    const start = this.ownSpans()[0]?.start ?? 0;
    return root.motion.animate(
      () => root.units(),
      units => root.write(units),
      plan,
      (_, from, to): TxtRange => [from - start, to - start],
      duration,
      timing,
      {...own, ...transitions},
    );
  }

  private write(units: readonly ContentUnit<TxtPiece>[]) {
    const settled = this.motion.settle(units);
    const leaves = this.node.textLeaves();
    const texts = leafTexts(leaves, settled);
    this.keys({leaves, texts, units: settled});
    leaves.forEach((leaf, i) => {
      if (textOf(leaf.text()) !== texts[i]) leaf.text(texts[i]);
    });
  }
}

/** Untyped callers pass values a `string` signal cannot hold. */
export function textOf(value: string): string {
  return value === null || value === undefined ? '' : String(value);
}

export function txtSignal(): PropertyDecorator {
  return (target: object, key) => {
    const meta = getPropertyMetaOrCreate<string>(target, key);
    addInitializer(target, (instance: object) => {
      if (!(instance instanceof Txt)) {
        throw new Error('txtSignal() decorates the text of a Txt.');
      }
      Reflect.set(
        instance,
        key,
        new TxtSignalContext(
          meta.default ?? '',
          instance,
          instance,
          makeSignalExtensions(meta, instance, String(key)),
        ).toSignal(),
      );
    });
  };
}
