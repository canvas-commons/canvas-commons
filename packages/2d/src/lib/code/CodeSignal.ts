import {
  DEFAULT,
  DependencyContext,
  Signal,
  SignalContext,
  SignalValue,
  ThreadGenerator,
  TimingFunction,
  createComputed,
  createSignal,
  deepLerp,
  easeInOutCubic,
  isReactive,
  unwrap,
} from '@canvas-commons/core';
import {Code} from '../components';
import {
  ContentAdapter,
  ContentChange,
  ContentEdit,
  ContentMotion,
  ContentUnit,
  Survivor,
  UnitKey,
  editCall,
} from '../content';
import {addInitializer, getPropertyMetaOrCreate} from '../decorators';
import {
  CodeKeys,
  CodePiece,
  CodePieces,
  codePieces,
  codeRange,
  codeUnits,
  codeValue,
  pairCode,
  pieceText,
  replaceRange,
  spliceUnits,
  templateChange,
} from './CodeContent';
import {CodeHighlighter} from './CodeHighlighter';
import {
  CodeChange,
  CodeLayout,
  CodeMotion,
  CodeSnapshot,
  NestedCode,
  colorRuns,
  highlightOf,
} from './CodeLayout';
import {CodePoint, CodeRange} from './CodeRange';
import {
  CODE,
  CodeScope,
  CodeTag,
  PossibleCodeScope,
  parseCodeScope,
} from './CodeScope';
import {CodeTokenizer, defaultTokenize} from './CodeTokenizer';
import {CodeTransitions, DefaultCodeTransitions} from './codeTransitions';

type EditTransitions = Partial<CodeTransitions>;

type CodeEdit = ContentEdit<CodeRange>;

interface CodeModifier<TOwner> {
  (code: CodeTag): TOwner;
  (code: CodeTag, duration: number, transitions?: EditTransitions): CodeEdit;
  (duration?: number, transitions?: EditTransitions): TagGenerator;
}

interface CodeInsert<TOwner> {
  (point: CodePoint, code: CodeTag): TOwner;
  (
    point: CodePoint,
    code: CodeTag,
    duration: number,
    transitions?: EditTransitions,
  ): CodeEdit;
  (
    point: CodePoint,
    duration?: number,
    transitions?: EditTransitions,
  ): TagGenerator;
}

interface CodeRemove<TOwner> {
  (range: CodeRange): TOwner;
  (range: CodeRange, duration: number, transitions?: EditTransitions): CodeEdit;
}

interface CodeReplace<TOwner> {
  (range: CodeRange, code: CodeTag): TOwner;
  (
    range: CodeRange,
    code: CodeTag,
    duration: number,
    transitions?: EditTransitions,
  ): CodeEdit;
  (
    range: CodeRange,
    duration?: number,
    transitions?: EditTransitions,
  ): TagGenerator;
}

type TagGenerator = (
  strings: TemplateStringsArray,
  ...tags: CodeTag[]
) => CodeEdit;

export interface CodeSignalHelpers<TOwner> {
  edit(duration?: number, transitions?: EditTransitions): TagGenerator;
  append: CodeModifier<TOwner>;
  prepend: CodeModifier<TOwner>;
  insert: CodeInsert<TOwner>;
  remove: CodeRemove<TOwner>;
  replace: CodeReplace<TOwner>;
}

export type CodeSignal<TOwner> = Signal<
  PossibleCodeScope,
  CodeScope,
  TOwner,
  CodeSignalContext<TOwner>
> &
  CodeSignalHelpers<TOwner>;

type CodePlan = (
  units: readonly ContentUnit<CodePiece>[],
) => ContentChange<CodePiece>;

function rows(text: string): number {
  let rows = 0;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
    rows++;
  }
  return rows;
}

function textOf(units: readonly ContentUnit<CodePiece>[]): string {
  return units.map(({piece}) => pieceText(piece)).join('');
}

/** The units and motion of a code signal used as a piece of other code. */
export function nestedCode(piece: CodePiece): NestedCode | null {
  if (
    typeof piece === 'function' &&
    'context' in piece &&
    piece.context instanceof CodeSignalContext
  ) {
    return {units: piece.context.units(), motion: piece.context.motion};
  }
  return null;
}

export class CodeSignalContext<TOwner>
  extends SignalContext<PossibleCodeScope, CodeScope, TOwner>
  implements CodeSignalHelpers<TOwner>
{
  /** The edits in flight. The value of the signal is always their target. */
  public readonly motion: CodeMotion;

  /** The keys of the value the last edit wrote. */
  private readonly keys = createSignal<CodeKeys | null>(null);

  /** The units of the value, keyed from `keys` when the value is the same. */
  public readonly units = createComputed(() =>
    codeUnits(this.get(), this.keys()),
  );

  public constructor(
    initial: SignalValue<PossibleCodeScope>,
    owner: TOwner,
    private readonly highlighter?: SignalValue<CodeHighlighter | null>,
  ) {
    super(initial, deepLerp, owner);
    if (owner instanceof Code) {
      this.highlighter ??= owner.highlighter;
    }
    const adapter: ContentAdapter<CodePiece, CodeSnapshot, CodeChange> = {
      ...CodePieces,
      layout: units => this.layout(units),
      change: (removed, inserted) => ({
        removedRows: rows(removed),
        insertedRows: rows(inserted),
      }),
      snapshots: source => {
        const highlight = highlightOf(this.drawnHighlighter(), source);
        return (from, to, at) => ({
          text: source.slice(from, to),
          column: at.x,
          colors: colorRuns(highlight, from, to),
        });
      },
      morphs: (before, after, survivors) =>
        this.morphs(before, after, survivors),
    };
    this.motion = new ContentMotion(adapter, () => this.transitions());
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
    return this.motion.entries.size() > 0;
  }

  protected override *tween(
    value: SignalValue<PossibleCodeScope> | typeof DEFAULT,
    duration: number,
    timingFunction: TimingFunction,
  ): ThreadGenerator {
    yield* this.tweener(
      value === DEFAULT ? (this.getInitial() ?? []) : value,
      duration,
      timingFunction,
    );
  }

  public override *tweener(
    value: SignalValue<PossibleCodeScope>,
    duration: number,
    timingFunction: TimingFunction,
  ): ThreadGenerator {
    const highlighter = unwrap(this.highlighter);
    if (highlighter) {
      yield (async () => {
        do {
          await DependencyContext.consumePromises();
          highlighter.initialize();
        } while (DependencyContext.hasPromises());
      })();
    }

    const target = codePieces(unwrap(value));
    yield* this.animate(
      units => ({
        next: target,
        replacements: pairCode(
          textOf(units),
          target.map(pieceText).join(''),
          this.tokenizer(),
        ),
      }),
      duration,
      {},
      timingFunction,
    );
    if (isReactive(value)) {
      this.set(value);
    }
  }

  public edit(
    duration: number = 0.6,
    transitions?: EditTransitions,
  ): TagGenerator {
    return (strings, ...tags) =>
      this.animate(
        units =>
          templateChange(
            textOf(units),
            CODE(strings, ...tags),
            this.tokenizer(),
          ),
        duration,
        transitions,
      );
  }

  public append(code: CodeTag): TOwner;
  public append(
    code: CodeTag,
    duration: number,
    transitions?: EditTransitions,
  ): CodeEdit;
  public append(duration?: number, transitions?: EditTransitions): TagGenerator;
  public append(
    first: CodeTag | number = 0.6,
    second?: number | EditTransitions,
    third?: EditTransitions,
  ): TOwner | CodeEdit | TagGenerator {
    return this.modify(
      (units, code) => {
        const end = textOf(units).length;
        return spliceUnits(units, end, end, codePieces(code));
      },
      first,
      second,
      third,
    );
  }

  public prepend(code: CodeTag): TOwner;
  public prepend(
    code: CodeTag,
    duration: number,
    transitions?: EditTransitions,
  ): CodeEdit;
  public prepend(
    duration?: number,
    transitions?: EditTransitions,
  ): TagGenerator;
  public prepend(
    first: CodeTag | number = 0.6,
    second?: number | EditTransitions,
    third?: EditTransitions,
  ): TOwner | CodeEdit | TagGenerator {
    return this.modify(
      (units, code) => spliceUnits(units, 0, 0, codePieces(code)),
      first,
      second,
      third,
    );
  }

  public insert(point: CodePoint, code: CodeTag): TOwner;
  public insert(
    point: CodePoint,
    code: CodeTag,
    duration: number,
    transitions?: EditTransitions,
  ): CodeEdit;
  public insert(
    point: CodePoint,
    duration?: number,
    transitions?: EditTransitions,
  ): TagGenerator;
  public insert(
    point: CodePoint,
    first: CodeTag | number = 0.6,
    second?: number | EditTransitions,
    third?: EditTransitions,
  ): TOwner | CodeEdit | TagGenerator {
    return this.modify(
      (units, code) => replaceRange(units, [point, point], code),
      first,
      second,
      third,
    );
  }

  public remove(range: CodeRange): TOwner;
  public remove(
    range: CodeRange,
    duration: number,
    transitions?: EditTransitions,
  ): CodeEdit;
  public remove(
    range: CodeRange,
    duration?: number,
    transitions?: EditTransitions,
  ): TOwner | CodeEdit {
    const plan: CodePlan = units => replaceRange(units, range, '');
    return duration === undefined
      ? this.change(plan)
      : this.animate(plan, duration, transitions);
  }

  public replace(range: CodeRange, code: CodeTag): TOwner;
  public replace(
    range: CodeRange,
    code: CodeTag,
    duration: number,
    transitions?: EditTransitions,
  ): CodeEdit;
  public replace(
    range: CodeRange,
    duration?: number,
    transitions?: EditTransitions,
  ): TagGenerator;
  public replace(
    range: CodeRange,
    first: CodeTag | number = 0.6,
    second?: number | EditTransitions,
    third?: EditTransitions,
  ): TOwner | CodeEdit | TagGenerator {
    return this.modify(
      (units, code) => replaceRange(units, range, code),
      first,
      second,
      third,
    );
  }

  public override parse(value: PossibleCodeScope): CodeScope {
    return parseCodeScope(value);
  }

  public override dispose() {
    this.units.context.dispose();
    this.keys.context.dispose();
    super.dispose();
  }

  public override toSignal(): CodeSignal<TOwner> {
    return this.invokable;
  }

  private modify(
    plan: (
      units: readonly ContentUnit<CodePiece>[],
      code: CodeTag,
    ) => ContentChange<CodePiece>,
    first: CodeTag | number,
    second?: number | EditTransitions,
    third?: EditTransitions,
  ): TOwner | CodeEdit | TagGenerator {
    return editCall(
      {
        change: p => this.change(p),
        animate: (p, duration, transitions) =>
          this.animate(p, duration, transitions),
      },
      plan,
      (strings, tags) => CODE(strings, ...tags),
      first,
      second,
      third,
    );
  }

  private change(plan: CodePlan): TOwner {
    const units = this.units();
    this.write(this.motion.apply(units, plan(units)));
    return this.owner;
  }

  private animate(
    plan: CodePlan,
    duration: number,
    transitions?: EditTransitions,
    timing: TimingFunction = easeInOutCubic,
  ): CodeEdit {
    return this.motion.animate(
      () => this.units(),
      units => this.write(units),
      plan,
      codeRange,
      duration,
      timing,
      transitions,
    );
  }

  private write(units: readonly ContentUnit<CodePiece>[]) {
    const record = codeValue(this.motion.settle(units));
    this.keys(record);
    this.set(record.value);
  }

  private tokenizer(): CodeTokenizer {
    const highlighter = unwrap(this.highlighter);
    return highlighter
      ? (input: string) => highlighter.tokenize(input)
      : defaultTokenize;
  }

  /** The Code node that draws this signal as its own code. */
  private drawnBy(): Code | null {
    const owner = this.owner;
    return owner instanceof Code && owner.code.context === this ? owner : null;
  }

  private transitions(): CodeTransitions {
    return this.drawnBy()?.resolvedTransitions() ?? DefaultCodeTransitions;
  }

  private layout(units: readonly ContentUnit<CodePiece>[]): CodeLayout {
    return (
      this.drawnBy()?.layoutUnits(units) ??
      new CodeLayout(units, this.motion, text => text.length, nestedCode)
    );
  }

  private drawnHighlighter(): CodeHighlighter | null {
    return (
      this.drawnBy()?.highlighter() ??
      unwrap(this.highlighter) ??
      Code.defaultHighlighter
    );
  }

  private *morphs(
    before: string,
    after: string,
    survivors: readonly Survivor[],
  ): Iterable<[UnitKey, CodeSnapshot]> {
    const highlighter = this.drawnBy()?.highlighter();
    const from = highlightOf(highlighter, before);
    const to = highlightOf(highlighter, after);
    if (!from || !to) {
      return;
    }
    for (const survivor of survivors) {
      const end = survivor.before + survivor.length;
      for (let i = 0; i < survivor.length;) {
        const was = from(survivor.before + i);
        const is = to(survivor.after + i);
        if (was.color !== is.color) {
          yield [
            survivor.key,
            {
              text: before.slice(survivor.before, end),
              column: 0,
              colors: colorRuns(from, survivor.before, end),
            },
          ];
          break;
        }
        i += Math.max(1, Math.min(was.skipAhead, is.skipAhead));
      }
    }
  }
}

export function codeSignal(): PropertyDecorator {
  return (target: object, key) => {
    const meta = getPropertyMetaOrCreate<PossibleCodeScope>(target, key);
    addInitializer(target, (instance: object) => {
      Reflect.set(
        instance,
        key,
        new CodeSignalContext(meta.default ?? [], instance).toSignal(),
      );
    });
  };
}
