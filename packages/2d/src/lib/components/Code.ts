import {
  BBox,
  Color,
  createMotionStack,
  createSignal,
  experimentalLog,
  map,
  SerializedVector2,
  Signal,
  SignalValue,
  SimpleSignal,
  ThreadGenerator,
  TimingFunction,
  useLogger,
  useScene,
  Vector2,
} from '@canvas-commons/core';
import {
  CodeHighlighter,
  CodePoint,
  CodeRange,
  CodeSelection,
  CodeSignal,
  codeSignal,
  CodeSignalContext,
  findAllCodeRanges,
  isPointInCodeSelection,
  lines,
  nestedCode,
  parseCodeSelection,
  PossibleCodeScope,
  PossibleCodeSelection,
  resolveScope,
} from '../code';
import {CodePiece} from '../code/CodeContent';
import {
  CodeCells,
  CodeEmbed,
  CodeFragmentDrawingInfo,
  CodeLayout,
  CodeMotion,
  CodeRegion,
  CodeSnapshot,
  colorAt,
  colorRuns,
  highlightOf,
} from '../code/CodeLayout';
import {CodeTransitions, DefaultCodeTransitions} from '../code/codeTransitions';
import {
  ContentBoxKey,
  ContentUnit,
  restPose,
  UnitKey,
  UnitPose,
} from '../content';
import {computed, initial, nodeName, parser, signal} from '../decorators';
import {DesiredLength} from '../partials';
import {sharedMeasurementContext} from '../utils/measurement';
import {Shape, ShapeProps} from './Shape';

/**
 * @experimental
 */
export interface DrawTokenHook {
  (
    ctx: CanvasRenderingContext2D,
    text: string,
    position: Vector2,
    color: string,
    selection: number,
  ): void;
}

/**
 * Describes custom drawing logic used by the Code node.
 *
 * @experimental
 */
export interface DrawHooks {
  /**
   * Custom drawing logic for individual code tokens.
   *
   * @example
   * ```ts
   * token(ctx, text, position, color, selection) {
   *   const blur = map(3, 0, selection);
   *   const alpha = map(0.5, 1, selection);
   *   ctx.globalAlpha *= alpha;
   *   ctx.filter = `blur(${blur}px)`;
   *   ctx.fillStyle = color;
   *   ctx.fillText(text, position.x, position.y);
   * }
   * ```
   */
  token: DrawTokenHook;
}

export interface CodeProps extends ShapeProps {
  /**
   * {@inheritDoc Code.highlighter}
   */
  highlighter?: SignalValue<CodeHighlighter | null>;
  /**
   * {@inheritDoc Code.code}
   */
  code?: SignalValue<PossibleCodeScope>;
  /**
   * {@inheritDoc Code.selection}
   */
  selection?: SignalValue<PossibleCodeSelection>;
  /**
   * {@inheritDoc Code.drawHooks}
   */
  drawHooks?: SignalValue<DrawHooks>;
  /**
   * {@inheritDoc Code.transitions}
   */
  transitions?: SignalValue<Partial<CodeTransitions>>;
}

interface CodeFont {
  readonly monoWidth: number;
  readonly lineHeight: number;
  readonly fontHeight: number;
  readonly verticalOffset: number;
  measure(text: string): number;
  readonly cells: CodeCells;
}

interface CodeRun {
  readonly text: string;
  /** The offset of the run in its unit. */
  readonly from: number;
  /** Where the run starts from its unit, in cells and rows. */
  readonly offset: Vector2;
  readonly cursor: Vector2;
  readonly color: string | null;
  /** Whether each selection in `Code.selectionSteps` contains the run. */
  readonly selected: readonly boolean[];
}

/** A selection tween: the selection it leaves, and its progress. */
interface SelectionStep {
  readonly progress: SimpleSignal<number>;
  readonly from: CodeSelection;
}

const SelectionKey = 'selection';

function sameSelected(a: readonly boolean[], b: readonly boolean[]) {
  return a.every((value, i) => value === b[i]);
}

interface CodeDrawingInfo {
  fragments: CodeFragmentDrawingInfo[];
  /** Code that edits removed and still draw. */
  ghosts: CodeFragmentDrawingInfo[];
  verticalOffset: number;
  fontHeight: number;
}

const CharacterCells: CodeCells = text => text.length;

/** The pose of a unit inside the units of the signals it is nested in. */
function embeddedPose(
  motion: CodeMotion,
  key: UnitKey,
  embeds: readonly CodeEmbed[],
  rest: UnitPose,
  transitions: CodeTransitions,
): UnitPose {
  let pose = motion.pose(key, rest, transitions);
  for (let i = embeds.length - 1; i >= 0; i--) {
    pose = embeds[i].motion.pose(embeds[i].key, pose, transitions);
  }
  return pose;
}

function snapshotRuns(
  snapshot: CodeSnapshot,
  cells: CodeCells,
): {text: string; offset: Vector2; color: string | null}[] {
  const runs: {text: string; offset: Vector2; color: string | null}[] = [];
  let at = Vector2.zero;
  for (const {from, to, color} of snapshot.colors) {
    const lines = snapshot.text.slice(from, to).split('\n');
    lines.forEach((text, index) => {
      if (index > 0) {
        at = new Vector2(-snapshot.column, at.y + 1);
      }
      if (text.length > 0) {
        runs.push({text, offset: at, color});
        at = at.addX(cells(text));
      }
    });
  }
  return runs;
}

/**
 * A node for displaying and animating code.
 *
 * @preview
 * ```tsx editor
 * import {Code, makeScene2D} from '@canvas-commons/2d';
 * import {createRef} from '@canvas-commons/core';
 *
 * export default makeScene2D(function* (view) {
 *   const code = createRef<Code>();
 *
 *   view.add(
 *     <Code
 *       ref={code}
 *       anchor={-1}
 *       position={view.size().scale(-0.5).add(60)}
 *       fontFamily={'JetBrains Mono, monospace'}
 *       fontSize={36}
 *       code={`\
 * function hello() {
 *   console.log('Hello');
 * }`}
 *     />,
 *   );
 *
 *   yield* code()
 *     .code(
 *       `\
 * function hello() {
 *   console.warn('Hello World');
 * }`,
 *       1,
 *     )
 *     .wait(0.5)
 *     .back(1)
 *     .wait(0.5);
 * });
 * ```
 */
@nodeName('Code')
export class Code extends Shape {
  /**
   * Create a standalone code signal.
   *
   * @param initial - The initial code.
   * @param highlighter - Custom highlighter to use.
   */
  public static createSignal(
    initial: SignalValue<PossibleCodeScope>,
    highlighter?: SignalValue<CodeHighlighter>,
  ): CodeSignal<void> {
    return new CodeSignalContext<void>(
      initial,
      undefined,
      highlighter,
    ).toSignal();
  }

  public static defaultHighlighter: CodeHighlighter | null = null;

  /**
   * How every code node shows its edits, unless a node or an edit says
   * otherwise.
   */
  public static defaultTransitions: CodeTransitions = DefaultCodeTransitions;

  /**
   * The code highlighter to use for this code node.
   *
   * @remarks
   * Defaults to a shared {@link code.LezerHighlighter}.
   */
  @initial(() => Code.defaultHighlighter)
  @signal()
  declare public readonly highlighter: SimpleSignal<
    CodeHighlighter | null,
    this
  >;

  /**
   * The code to display.
   */
  @codeSignal()
  declare public readonly code: CodeSignal<this>;

  /**
   * Custom drawing logic for the code.
   *
   * @remarks
   * Check out {@link DrawHooks} for available render hooks.
   *
   * @experimental
   *
   * @example
   * Make the unselected code blurry and transparent:
   * ```tsx
   * <Code
   *   drawHooks={{
   *     token(ctx, text, position, color, selection) {
   *       const blur = map(3, 0, selection);
   *       const alpha = map(0.5, 1, selection);
   *       ctx.globalAlpha *= alpha;
   *       ctx.filter = `blur(${blur}px)`;
   *       ctx.fillStyle = color;
   *       ctx.fillText(text, position.x, position.y);
   *     },
   *   }}
   *   // ...
   * />
   * ```
   */
  @initial<DrawHooks>({
    token(ctx, text, position, color, selection) {
      ctx.fillStyle = color;
      ctx.globalAlpha *= map(0.2, 1, selection);
      ctx.fillText(text, position.x, position.y);
    },
  })
  @signal()
  declare public readonly drawHooks: SimpleSignal<DrawHooks, this>;

  protected setDrawHooks(value: DrawHooks) {
    if (
      !useScene().experimentalFeatures &&
      value !== this.drawHooks.context.getInitial()
    ) {
      useLogger().log({
        ...experimentalLog(`Code uses experimental draw hooks.`),
        inspect: this.key,
      });
    } else {
      this.drawHooks.context.setter(value);
    }
  }

  /**
   * How this node shows its edits, over {@link Code.defaultTransitions}.
   *
   * @example
   * Fade inserted code in from below instead of swapping it at the middle:
   * ```tsx
   * <Code
   *   transitions={{
   *     incoming: (pose, progress) => ({
   *       ...pose,
   *       position: pose.position.addY(1 - progress),
   *       opacity: pose.opacity * progress,
   *     }),
   *   }}
   *   code={'const number = 7;'}
   * />
   * ```
   */
  @initial({})
  @signal()
  declare public readonly transitions: SimpleSignal<
    Partial<CodeTransitions>,
    this
  >;

  /**
   * The currently selected code range.
   *
   * @remarks
   * Either a single {@link code.CodeRange} or an array of them
   * describing which parts of the code should be visually emphasized.
   *
   * You can use {@link code.word} and
   * {@link code.lines} to quickly create ranges.
   *
   * @example
   * The following will select the word "console" in the code.
   * Both lines and columns are 0-based. So it will select a 7-character-long
   * (`7`) word in the second line (`1`) starting at the third character (`2`).
   * ```tsx
   * <Code
   *   selection={word(1, 2, 7)}
   *   code={`\
   * function hello() => {
   *   console.log('Hello');
   * }`}
   *   // ...
   * />
   * ```
   */
  @initial(lines(0, Infinity))
  @parser(parseCodeSelection)
  @signal()
  declare public readonly selection: Signal<
    PossibleCodeSelection,
    CodeSelection,
    this
  >;
  private readonly selectionMotion = createMotionStack<string, SelectionStep>();

  protected *tweenSelection(
    value: CodeRange[],
    duration: number,
    timingFunction: TimingFunction,
  ): ThreadGenerator {
    const progress = createSignal(0);
    this.selectionMotion.push(SelectionKey, {
      progress,
      from: this.selection(),
    });
    this.selection(value);
    try {
      yield* progress(1, duration, timingFunction);
    } finally {
      this.selectionMotion.release(progress);
      progress.context.dispose();
    }
  }

  /** The selections the drawn one blends through, oldest first. */
  private selectionSteps(): readonly SelectionStep[] {
    return this.selectionMotion.entries(SelectionKey);
  }

  /**
   * Get the currently displayed code as a string.
   *
   * @remarks
   * During an edit, this is the code the edit ends with.
   */
  @computed()
  public parsed(): string {
    return resolveScope(this.code(), true);
  }

  @computed()
  public highlighterCache() {
    const highlighter = this.highlighter();
    if (!highlighter || !highlighter.initialize()) return null;
    return highlighter.prepare(this.parsed());
  }

  /** The transitions this node uses, over the class defaults. */
  @computed()
  public resolvedTransitions(): CodeTransitions {
    return {...Code.defaultTransitions, ...this.transitions()};
  }

  public constructor(props: CodeProps) {
    super({
      fontFamily: 'monospace',
      highlighter: Code.defaultHighlighter,
      ...props,
    });
  }

  /**
   * Create a child code signal.
   *
   * @param initial - The initial code.
   */
  public createSignal(
    initial: SignalValue<PossibleCodeScope>,
  ): CodeSignal<this> {
    return new CodeSignalContext<this>(
      initial,
      this,
      this.highlighter,
    ).toSignal();
  }

  /**
   * Find all code ranges that match the given pattern.
   *
   * @param pattern - Either a string or a regular expression to search for.
   *                  When a string is passed, it looks for **exact matches**.
   *                  When a RegExp object is passed, it will match against it.
   */
  public findAllRanges(pattern: string | RegExp): CodeRange[] {
    return findAllCodeRanges(this.parsed(), pattern);
  }

  /**
   * Find the first code range that matches the given pattern.
   *
   * @param pattern - Either a string or a regular expression to search for.
   *                  When a string is passed, it looks for **exact matches**.
   *                  When a RegExp object is passed, it will match against it.
   */
  public findFirstRange(pattern: string | RegExp): CodeRange {
    return (
      findAllCodeRanges(this.parsed(), pattern, 1)[0] ?? [
        [0, 0],
        [0, 0],
      ]
    );
  }

  /**
   * Find the last code range that matches the given pattern.
   *
   * @param pattern - Either a string or a regular expression to search for.
   *                  When a string is passed, it looks for **exact matches**.
   *                  When a RegExp object is passed, it will match against it.
   */
  public findLastRange(pattern: string | RegExp): CodeRange {
    return (
      findAllCodeRanges(this.parsed(), pattern).at(-1) ?? [
        [0, 0],
        [0, 0],
      ]
    );
  }

  /**
   * Return the bounding box of the given point (character) in the code.
   *
   * @remarks
   * The returned bound box is in local space of the `Code` node.
   *
   * @param point - The point to get the bounding box for.
   */
  public getPointBBox(point: CodePoint): BBox {
    const [line, column] = point;
    const drawingInfo = this.drawingInfo();
    let match: CodeFragmentDrawingInfo | undefined;
    for (const info of drawingInfo.fragments) {
      if (info.cursor.y < line) {
        match = info;
        continue;
      }

      if (info.cursor.y === line && info.cursor.x < column) {
        match = info;
        continue;
      }

      break;
    }

    if (!match) return new BBox();

    const size = this.computedSize();
    return new BBox(
      match.position
        .sub(size.scale(0.5))
        .addX(match.characterSize.x * (column - match.cursor.x)),
      match.characterSize,
    );
  }

  /**
   * Return bounding boxes of all characters in the selection.
   *
   * @remarks
   * The returned bounding boxes are in local space of the `Code` node.
   * Each line of code has a separate bounding box.
   *
   * @param selection - The selection to get the bounding boxes for.
   */
  public getSelectionBBox(selection: PossibleCodeSelection): BBox[] {
    const size = this.computedSize();
    const range = parseCodeSelection(selection);
    const drawingInfo = this.drawingInfo();
    const bboxes: BBox[] = [];

    let current: BBox | null = null;
    let line = 0;
    let column = 0;
    for (const info of drawingInfo.fragments) {
      if (info.cursor.y !== line) {
        line = info.cursor.y;
        if (current) {
          bboxes.push(current);
          current = null;
        }
      }

      column = info.cursor.x;
      for (let i = 0; i < info.text.length; i++) {
        if (isPointInCodeSelection([line, column], range)) {
          const bbox = new BBox(
            info.position
              .sub(size.scale(0.5))
              .addX(info.characterSize.x * (column - info.cursor.x)),
            info.characterSize,
          );
          if (!current) {
            current = bbox;
          } else {
            current = current.union(bbox);
          }
        } else if (current) {
          bboxes.push(current);
          current = null;
        }

        column++;
      }
    }

    if (current) {
      bboxes.push(current);
    }

    return bboxes;
  }

  /** The font measurements the code grid is built on. */
  @computed()
  protected codeFont(): CodeFont | null {
    this.requestFontUpdate();
    const context = sharedMeasurementContext();
    if (!context) {
      return null;
    }
    context.save();
    this.applyStyle(context);
    this.applyText(context);
    const {font, direction} = context;
    const letterSpacing =
      'letterSpacing' in context ? context.letterSpacing : '0px';
    const metrics = context.measureText('X');
    context.restore();

    // A fragment callback measuring a sibling node leaves its own font on the
    // shared context, so every measurement restores this node's state.
    const measure = (text: string) => {
      context.font = font;
      context.direction = direction;
      if ('letterSpacing' in context) {
        context.letterSpacing = letterSpacing;
      }
      return context.measureText(text).width;
    };
    const monoWidth = metrics.width;
    return {
      monoWidth,
      lineHeight: this.resolvedLineHeight(),
      fontHeight:
        metrics.fontBoundingBoxDescent + metrics.fontBoundingBoxAscent,
      verticalOffset: metrics.fontBoundingBoxAscent,
      measure,
      cells: text =>
        monoWidth > 0 ? Math.round(measure(text) / monoWidth) : text.length,
    };
  }

  /**
   * Lay out code units on the grid of this node.
   *
   * @internal
   */
  public layoutUnits(units: readonly ContentUnit<CodePiece>[]): CodeLayout {
    return new CodeLayout(
      units,
      this.code.context.motion,
      this.codeFont()?.cells ?? CharacterCells,
      nestedCode,
    );
  }

  @computed()
  protected contentLayout(): CodeLayout {
    return this.layoutUnits(this.code.context.units());
  }

  /** The runs each unit is drawn in, split by color and by selection. */
  @computed()
  protected codeRuns(): CodeRun[][] {
    const layout = this.contentLayout();
    const highlight = highlightOf(this.highlighter(), layout.text);
    const selections = [
      ...this.selectionSteps().map(step => step.from),
      this.selection(),
    ];
    const cells = this.codeFont()?.cells ?? CharacterCells;
    const selectedAt = (row: number, column: number) =>
      selections.map(selection =>
        isPointInCodeSelection([row, column], selection),
      );

    return layout.units.map(unit => {
      const runs: CodeRun[] = [];
      let at = Vector2.zero;
      for (const color of colorRuns(
        highlight,
        unit.from,
        unit.from + unit.text.length,
      )) {
        let from = color.from;
        while (from < color.to) {
          if (unit.text[from] === '\n') {
            at = new Vector2(-unit.start.x, at.y + 1);
            from++;
            continue;
          }
          const [row, column] = layout.point(unit.from + from);
          const selected = selectedAt(row, column);
          let to = from + 1;
          while (
            to < color.to &&
            unit.text[to] !== '\n' &&
            sameSelected(selectedAt(row, column + to - from), selected)
          ) {
            to++;
          }
          const text = unit.text.slice(from, to);
          runs.push({
            text,
            from,
            offset: at,
            cursor: new Vector2(column, row),
            color: color.color,
            selected,
          });
          at = at.addX(cells(text));
          from = to;
        }
      }
      return runs;
    });
  }

  @computed()
  protected drawingInfo(): CodeDrawingInfo {
    const font = this.codeFont();
    if (!font) {
      return {fragments: [], ghosts: [], verticalOffset: 0, fontHeight: 0};
    }
    const layout = this.contentLayout();
    const runs = this.codeRuns();
    const transitions = this.resolvedTransitions();
    const steps = this.selectionSteps();
    const selectionTime = (selected: readonly boolean[]) =>
      steps.reduce(
        (time, step, i) => map(time, selected[i + 1] ? 1 : 0, step.progress()),
        selected[0] ? 1 : 0,
      );
    const fallback = this.fallbackFill();
    const grid = new Vector2(font.monoWidth, font.lineHeight);

    const info = (
      run: {text: string; offset: Vector2},
      pose: UnitPose,
      fill: string,
      time: number,
      cursor: Vector2,
    ): CodeFragmentDrawingInfo => ({
      text: run.text,
      position: pose.position.add(run.offset).mul(grid),
      characterSize: new Vector2(
        font.measure(run.text) / run.text.length,
        font.fontHeight,
      ),
      cursor,
      fill,
      time,
      alpha: pose.opacity,
      scale: pose.scale,
      reveal: pose.reveal,
    });

    const fragments: CodeFragmentDrawingInfo[] = [];
    layout.units.forEach((unit, index) => {
      const pose = embeddedPose(
        unit.motion,
        unit.key,
        unit.embeds,
        restPose(unit.start),
        transitions,
      );
      const morphs = unit.motion.morphs(unit.key, transitions);
      for (const run of runs[index]) {
        let fill = run.color ?? fallback;
        if (morphs.length > 0) {
          let color = new Color(fill);
          for (const {from, weight} of morphs) {
            color = Color.lerp(
              colorAt(from.colors, run.from) ?? fallback,
              color,
              1 - weight,
            );
          }
          fill = color.serialize();
        }
        fragments.push(
          info(run, pose, fill, selectionTime(run.selected), run.cursor),
        );
      }
    });

    const ghosts: CodeFragmentDrawingInfo[] = [];
    const selection = this.selection();
    const regions: [CodeMotion, CodeRegion][] = [
      [this.code.context.motion, {from: 0, embeds: []}],
      ...layout.regions,
    ];
    for (const [motion, region] of regions) {
      for (const [key, ghost] of motion.ghosts()) {
        const anchor = region.from + ghost.anchor;
        const pose = embeddedPose(
          motion,
          key,
          region.embeds,
          restPose(layout.caret(anchor).add(ghost.relative)),
          transitions,
        );
        const [row, column] = layout.point(anchor);
        const cursor = new Vector2(column, row);
        const time = isPointInCodeSelection([row, column], selection) ? 1 : 0;
        for (const run of snapshotRuns(ghost.snapshot, font.cells)) {
          ghosts.push(info(run, pose, run.color ?? fallback, time, cursor));
        }
      }
    }

    return {
      fragments,
      ghosts,
      verticalOffset: font.verticalOffset,
      fontHeight: font.fontHeight,
    };
  }

  protected override desiredSize(): SerializedVector2<DesiredLength> {
    const font = this.codeFont();
    if (!font) {
      return {x: 0, y: 0};
    }
    const size = this.code.context.motion.pose(
      ContentBoxKey,
      restPose(this.contentLayout().size),
      this.resolvedTransitions(),
    ).position;
    return {
      x: size.x * font.monoWidth,
      y: size.y * font.lineHeight + font.verticalOffset,
    };
  }

  protected override draw(context: CanvasRenderingContext2D): void {
    this.requestFontUpdate();
    this.applyStyle(context);
    this.applyText(context);
    const size = this.computedSize();
    const drawingInfo = this.drawingInfo();

    context.save();
    context.translate(
      -size.width / 2,
      -size.height / 2 + drawingInfo.verticalOffset,
    );

    const drawHooks = this.drawHooks();
    for (const info of [...drawingInfo.ghosts, ...drawingInfo.fragments]) {
      const text = info.text.slice(
        0,
        Math.ceil(info.text.length * info.reveal),
      );
      if (info.alpha <= 0 || text.length === 0) continue;
      context.save();
      context.globalAlpha *= info.alpha;
      let position = info.position;
      if (info.scale !== 1) {
        context.translate(position.x, position.y);
        context.scale(info.scale, info.scale);
        position = Vector2.zero;
      }
      drawHooks.token(context, text, position, info.fill, info.time);
      context.restore();
    }

    context.restore();

    this.drawChildren(context);
  }

  private fallbackFill(): string {
    const fill = this.fill();
    return (fill instanceof Color ? fill : new Color('white')).serialize();
  }

  protected override applyText(context: CanvasRenderingContext2D) {
    super.applyText(context);
    context.font = this.canvasFont();
    context.textBaseline = 'top';
    if ('letterSpacing' in context) {
      context.letterSpacing = `${this.letterSpacing()}px`;
    }
  }

  protected override collectAsyncResources(): void {
    super.collectAsyncResources();
    this.highlighter()?.initialize();
  }
}
