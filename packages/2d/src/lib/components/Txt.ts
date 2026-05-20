import {
  BBox,
  DEFAULT,
  InterpolationFunction,
  SignalValue,
  SimpleSignal,
  ThreadGenerator,
  TimingFunction,
  all,
  threadable,
} from '@canvas-commons/core';
import {
  PreparedTextWithSegments,
  materializeLineRange,
  measureLineStats,
  measureNaturalWidth,
  prepareWithSegments,
  walkLineRanges,
} from '@chenglou/pretext';
import {computed, initial, nodeName, signal} from '../decorators';
import {CanvasStyle} from '../partials';
import {
  PreparedRichInline,
  RichInlineItem,
  buildCanvasFontString,
  knuthPlass,
  materializeRichInlineLineRange,
  measureRichInlineStats,
  prepareRichInline,
  resolveLineHeight,
  segment,
  walkRichInlineLineRanges,
} from '../text';
import {fontsVersion, requestFontLoad, resolveCanvasStyle} from '../utils';
import {MeasureMode} from '../utils/yoga';
import {Node} from './Node';
import {Shape, ShapeProps} from './Shape';
import {TxtLeaf} from './TxtLeaf';
import {ComponentChildren} from './types';

type TxtChildren = string | Node | (string | Node)[];
type AnyTxt = Txt | TxtLeaf;

export type TxtWrapMode = 'greedy' | 'knuth-plass';

/**
 * Function that splits a single word into syllable-like pieces. Pieces are
 * joined with U+00AD (soft hyphen) and passed to pretext, which uses them as
 * optional break points.
 */
export type HyphenateFn = (word: string) => string[];

export interface TxtProps extends ShapeProps {
  children?: TxtChildren;
  text?: SignalValue<string>;
  autoSize?: SignalValue<boolean>;
  wrapMode?: SignalValue<TxtWrapMode>;
  hyphenate?: SignalValue<HyphenateFn | null>;
}

type FontComponents = {
  style: string;
  weight: number;
  size: number;
  family: string;
};

type FragmentStyle = {
  fill: CanvasStyle;
  stroke: CanvasStyle;
  lineWidth: number;
  strokeFirst: boolean;
  font: string;
  fontComponents: FontComponents;
  letterSpacing: number;
};

/**
 * A single styled slice of laid-out text on one line of a {@link Txt}.
 *
 * @remarks
 * `x` is the fragment's left edge in pretext-space (`0` is the left edge of
 * the text block, before the `Txt`'s own anchor is applied). `style` mirrors
 * the owning `Txt` node's text properties at layout time.
 */
export type StyledFragment = {
  text: string;
  x: number;
  style: FragmentStyle;
};

/**
 * A single laid-out line of a {@link Txt} block.
 *
 * @remarks
 * `top` is the line box's top edge in pretext-space (`0` is the top of the
 * text block). `height` is the line box height — the base line height.
 */
export type TextLine = {
  fragments: StyledFragment[];
  top: number;
  height: number;
};

/**
 * Result of laying out a {@link Txt}.
 *
 * @remarks
 * Returned by {@link Txt.textLines}; the same shape backs the internal
 * measure pipeline used during yoga sizing and `draw()`.
 *
 * - `lines` is one entry per visual line, with its fragments and line box.
 * - `width` / `height` are the natural rendered size of the text block.
 * - `lineHeight` is the base per-line advance.
 */
export type TextLayoutResult = {
  lines: TextLine[];
  width: number;
  height: number;
  lineHeight: number;
};

/**
 * Fold line statistics over per-line rich groups. `null` entries are blank
 * lines — one line of height, no width.
 */
function measureGroupStats(
  groups: Array<PreparedRichInline | null>,
  maxWidth: number,
): {lineCount: number; maxLineWidth: number} {
  let lineCount = 0;
  let maxLineWidth = 0;
  for (const prepared of groups) {
    if (prepared === null) {
      lineCount++;
      continue;
    }
    const stats = measureRichInlineStats(prepared, maxWidth);
    lineCount += stats.lineCount;
    if (stats.maxLineWidth > maxLineWidth) {
      maxLineWidth = stats.maxLineWidth;
    }
  }
  return {lineCount, maxLineWidth};
}

/**
 * A {@link TextLine} with alignment fully resolved: `alignOffset` is the
 * horizontal shift for the current `textAlign`.
 */
type PositionedLine = {
  fragments: StyledFragment[];
  top: number;
  height: number;
  alignOffset: number;
  /**
   * Offset from the line-box top to each fragment's alphabetic baseline,
   * computed from real font metrics so glyphs land where CSS inline layout
   * would put them.
   */
  baselineOffsets: number[];
};

type PreparedLayout =
  | {kind: 'rich'; prepared: PreparedRichInline; styles: FragmentStyle[]}
  | {
      kind: 'simple';
      prepared: PreparedTextWithSegments;
      style: FragmentStyle;
    };

@nodeName('Txt')
export class Txt extends Shape {
  /**
   * Create a bold text node.
   *
   * @remarks
   * This is a shortcut for
   * ```tsx
   * <Txt fontWeight={700} />
   * ```
   *
   * @param props - Additional text properties.
   */
  public static b(props: TxtProps) {
    return new Txt({...props, fontWeight: 700});
  }

  /**
   * Create an italic text node.
   *
   * @remarks
   * This is a shortcut for
   * ```tsx
   * <Txt fontStyle={'italic'} />
   * ```
   *
   * @param props - Additional text properties.
   */
  public static i(props: TxtProps) {
    return new Txt({...props, fontStyle: 'italic'});
  }

  @initial('')
  @signal()
  declare public readonly text: SimpleSignal<string, this>;

  /**
   * Automatically shrink the font to fit the configured `width` and `height`.
   *
   * @remarks
   * When `true`, the rendered font size is computed by {@link fitFontSize}
   * against the configured `width` and `height`, clamped to the user's
   * `fontSize` (which acts as an upper bound). Requires both `width` and
   * `height` to resolve to concrete pixel numbers; falls back to the raw
   * `fontSize` otherwise.
   *
   * @example
   * ```tsx
   * <Txt autoSize width={400} height={120} fontSize={96}>
   *   This text shrinks to fit the box
   * </Txt>
   * ```
   */
  @initial(false)
  @signal()
  declare public readonly autoSize: SimpleSignal<boolean, this>;

  /**
   * Line-breaking algorithm.
   *
   * @remarks
   * - `'greedy'` (default) — pretext's first-fit pass. Fast.
   * - `'knuth-plass'` — dynamic-programming search for an optimal break
   *   sequence that minimizes a badness score (justification ratio, rivers,
   *   tight lines, soft-hyphen breaks). Only takes effect when the text is a
   *   single-style run; mixed-style `<Txt>` falls back to greedy.
   *
   * Named `wrapMode` rather than `wrap` to avoid clashing with the
   * `wrap: FlexWrap` flex signal inherited from {@link Layout}.
   *
   * @example
   * ```tsx
   * <Txt width={400} wrapMode={'knuth-plass'}>{loremIpsum}</Txt>
   * ```
   */
  @initial('greedy')
  @signal()
  declare public readonly wrapMode: SimpleSignal<TxtWrapMode, this>;

  /**
   * Word-level hyphenator. Receives a single word and returns an array of
   * syllable-like pieces; pieces are rejoined with U+00AD (soft hyphen) and
   * fed to pretext, which treats soft hyphens as optional break points.
   *
   * @remarks
   * No bundled dictionary — wire in your own (Hyphenopoly, hypher, etc.) or
   * leave this `null` to disable hyphenation.
   *
   * Signals treat raw function values as reactive getters, so set this via a
   * thunk: `hyphenate={() => myHyphenator}` (JSX) or
   * `txt.hyphenate(() => myHyphenator)` (imperative). Calling `txt.hyphenate()`
   * then returns the hyphenator.
   */
  @initial(null)
  @signal()
  declare public readonly hyphenate: SimpleSignal<HyphenateFn | null, this>;

  protected getText(): string {
    return this.innerText();
  }

  protected setText(value: SignalValue<string>) {
    const children = this.children();
    let leaf: TxtLeaf | null = null;
    for (const child of children) {
      if (leaf === null && child instanceof TxtLeaf) {
        leaf = child;
      } else {
        child.parent(null);
      }
    }

    if (leaf === null) {
      leaf = new TxtLeaf({text: value});
      leaf.parent(this);
    } else {
      leaf.text(value);
    }

    this.setParsedChildren([leaf]);
  }

  protected override setChildren(value: SignalValue<ComponentChildren>) {
    if (this.children.context.raw() === value) {
      return;
    }

    if (typeof value === 'string') {
      this.text(value);
    } else {
      super.setChildren(value);
    }
  }

  @threadable()
  protected *tweenText(
    value: SignalValue<string>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<string>,
  ): ThreadGenerator {
    const children = this.children();
    if (children.length !== 1 || !(children[0] instanceof TxtLeaf)) {
      this.text.save();
    }

    const leaf = this.childAs<TxtLeaf>(0);
    if (!leaf) return;

    // Suppress wrapping while the box tweens between text sizes.
    const oldWrap = this.textWrap.context.raw();
    this.textWrap(false);

    const oldText = leaf.text.context.raw();
    const oldSize = this.size.context.raw();
    leaf.text(value);
    const newSize = this.size();
    leaf.text(oldText ?? DEFAULT);

    const oldHeight = this.height();
    if (oldHeight === 0) {
      this.height(newSize.height);
    } else if (newSize.height === 0) {
      newSize.height = oldHeight;
    }

    yield* all(
      this.size(newSize, time, timingFunction),
      leaf.text(value, time, timingFunction, interpolationFunction),
    );

    this.children.context.setter(value);
    this.size(oldSize);
    this.textWrap(oldWrap ?? DEFAULT);
  }

  protected getLayout(): boolean {
    return true;
  }

  public constructor({children, text, ...props}: TxtProps) {
    super(props);
    this.children(text ?? children);

    this.yogaNode.setMeasureFunc((width, widthMode) =>
      this.measureForYoga(width, widthMode),
    );
    this.measureFuncReady = true;
  }

  @computed()
  public override layoutEnabled(): boolean {
    // Nested Txts fold into the outer Txt's inline stream, not yoga siblings.
    if (this.parentTxt()) {
      return false;
    }
    return super.layoutEnabled();
  }

  @computed()
  public override layoutChildrenEnabled(): boolean {
    // Txt is a yoga leaf: children render through pretext, not yoga placement.
    return false;
  }

  private lastMeasureKey: unknown[] | null = null;
  private measureFuncReady = false;

  @computed()
  protected override updateLayout() {
    super.updateLayout();
    // Yoga caches measure-func results until the node is marked dirty, so a
    // change to any measurement input has to bust the cache.
    const prepared = this.preparedLayout();
    const key: unknown[] = [
      prepared,
      this.resolvedLineHeight(),
      this.wrapMode(),
    ];
    const last = this.lastMeasureKey;
    if (
      !last ||
      last.length !== key.length ||
      key.some((value, i) => value !== last[i])
    ) {
      this.lastMeasureKey = key;
      // The super constructor lays out before setMeasureFunc runs; markDirty
      // on a measure-less yoga node aborts, so defer until the func is set.
      if (this.measureFuncReady) {
        this.yogaNode.markDirty();
      }
    }
  }

  @computed()
  protected innerText(): string {
    const children = this.childrenAs<Txt | TxtLeaf>();
    let text = '';
    for (const child of children) {
      text += child.text();
    }

    return text;
  }

  @computed()
  protected parentTxt(): Txt | null {
    const parent = this.parent();
    return parent instanceof Txt ? parent : null;
  }

  @computed()
  public override resolvedLineHeight(): number {
    return resolveLineHeight(this.lineHeight(), this.effectiveFontSize());
  }

  @computed()
  public override canvasFont(): string {
    return buildCanvasFontString(
      this.fontStyle(),
      this.fontWeight(),
      this.effectiveFontSize(),
      this.fontFamily(),
    );
  }

  /**
   * Effective font size used for rendering this text block.
   *
   * @remarks
   * Equals {@link fontSize} unless {@link autoSize} is enabled with concrete
   * `width` and `height` — in which case it is `fitFontSize(width, height)`.
   */
  @computed()
  public effectiveFontSize(): number {
    if (!this.autoSize()) return this.fontSize();
    const w = this.width.context.getter();
    const h = this.height.context.getter();
    if (typeof w !== 'number' || typeof h !== 'number') {
      return this.fontSize();
    }
    return this.fitFontSize(w, h);
  }

  private collectItemsWithScale(scale: number): {
    items: RichInlineItem[];
    styles: FragmentStyle[];
  } {
    // Re-collect when a web font finishes loading; it has no signal to track.
    fontsVersion();
    const items: RichInlineItem[] = [];
    const styles: FragmentStyle[] = [];

    const collect = (node: Node, ownerTxt: Txt) => {
      if (node instanceof TxtLeaf) {
        const txt = ownerTxt;
        const fontComponents: FontComponents = {
          style: txt.fontStyle(),
          weight: txt.fontWeight(),
          size: txt.fontSize() * scale,
          family: txt.fontFamily(),
        };
        const font = buildCanvasFontString(
          fontComponents.style,
          fontComponents.weight,
          fontComponents.size,
          fontComponents.family,
        );
        requestFontLoad(font);
        const letterSpacing = txt.letterSpacing() * scale;
        items.push({
          text: node.text(),
          font,
          letterSpacing: letterSpacing || undefined,
        });
        styles.push({
          fill: txt.fill(),
          stroke: txt.stroke(),
          lineWidth: txt.lineWidth(),
          strokeFirst: txt.strokeFirst(),
          font,
          fontComponents,
          letterSpacing,
        });
      } else if (node instanceof Txt && node !== this) {
        for (const child of node.children()) {
          collect(child, node);
        }
      }
    };

    for (const child of this.children()) {
      collect(child, this);
    }

    return {items, styles};
  }

  /**
   * Collect all descendant text runs as RichInlineItems with their styles.
   *
   * Walks `TxtLeaf` and nested `Txt` descendants; non-text children are
   * ignored.
   */
  @computed()
  protected collectInlineItems(): {
    items: RichInlineItem[];
    styles: FragmentStyle[];
  } {
    const raw = this.fontSize();
    const scale = raw > 0 ? this.effectiveFontSize() / raw : 1;
    return this.collectItemsWithScale(scale);
  }

  /**
   * Apply the user-provided hyphenator to every word in `text`, joining the
   * returned syllables with U+00AD so pretext can use them as soft breaks.
   */
  private applyHyphenation(text: string, hyphenate: HyphenateFn): string {
    let result = '';
    for (const seg of segment(text, 'word')) {
      if (seg.isWordLike) {
        const parts = hyphenate(seg.segment);
        result += parts.length <= 1 ? seg.segment : parts.join('­');
      } else {
        result += seg.segment;
      }
    }
    return result;
  }

  @computed()
  protected preparedLayout(): PreparedLayout | null {
    if (!this.measurementContext()) return null;
    const {items, styles} = this.collectInlineItems();
    if (items.length === 0) return null;

    const hyphenate = this.hyphenate();
    const wordBreak = this.wordBreak();
    const isPreWrap = this.textWrap() === 'pre';
    const useSimplePath = items.length === 1;

    const prepItems = hyphenate
      ? items.map(item => ({
          ...item,
          text: this.applyHyphenation(item.text, hyphenate),
        }))
      : items;

    if (useSimplePath) {
      const prepared = prepareWithSegments(
        prepItems[0].text,
        prepItems[0].font,
        {
          whiteSpace: isPreWrap ? 'pre-wrap' : 'normal',
          wordBreak,
        },
      );
      return {kind: 'simple', prepared, style: styles[0]};
    }
    return {kind: 'rich', prepared: prepareRichInline(prepItems), styles};
  }

  /**
   * The shared measurement context, or `null` in headless environments
   * without 2D canvas support (e.g. jsdom) where pretext cannot measure.
   *
   * @remarks
   * This is the single availability gate for the text pipeline — callers
   * branch on it instead of swallowing errors, so real measurement bugs
   * still throw.
   */
  @computed()
  private measurementContext(): CanvasRenderingContext2D | null {
    try {
      return this.cacheCanvas();
    } catch {
      return null;
    }
  }

  /**
   * Measure `text` with a fragment's font and letter spacing.
   *
   * @remarks
   * Every measure site sets both `font` and `letterSpacing` before measuring —
   * the cache canvas persists state between calls, so a stale letter spacing
   * from a previous measurement would inflate every subsequent width.
   *
   * Returns `0` when no real 2D context is available (e.g. jsdom).
   */
  private measureStyledText(text: string, style: FragmentStyle): number {
    const ctx = this.measurementContext();
    if (!ctx) return 0;
    ctx.font = style.font;
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = `${style.letterSpacing}px`;
    }
    return ctx.measureText(text).width;
  }

  /**
   * Real font-box metrics for a fragment's font.
   *
   * @remarks
   * CSS inline layout centers the font's content box (ascent + descent) in
   * the line box, not the em square. Painting with these metrics keeps glyph
   * positions identical to the DOM-based pipeline. Falls back to em-square
   * metrics when the context is unavailable or doesn't report font bounds
   * (e.g. jsdom shims).
   */
  private measureFontMetrics(style: FragmentStyle): {
    ascent: number;
    descent: number;
  } {
    const fallback = {ascent: style.fontComponents.size, descent: 0};
    const ctx = this.measurementContext();
    if (!ctx) return fallback;
    ctx.font = style.font;
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = '0px';
    }
    const metrics = ctx.measureText('Mg');
    const ascent = metrics.fontBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent;
    if (
      typeof ascent !== 'number' ||
      typeof descent !== 'number' ||
      !isFinite(ascent + descent) ||
      ascent + descent <= 0
    ) {
      return fallback;
    }
    return {ascent, descent};
  }

  /**
   * Measure widths for the layout-time constants (`' '`, `'-'`) used by the
   * Knuth-Plass scorer.
   */
  private measureFontConstants(font: string): {
    normalSpaceWidth: number;
    hyphenWidth: number;
  } {
    const ctx = this.cacheCanvas();
    ctx.save();
    ctx.font = font;
    if ('letterSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D).letterSpacing = '0px';
    }
    const normalSpaceWidth = ctx.measureText(' ').width;
    const hyphenWidth = ctx.measureText('-').width;
    ctx.restore();
    return {normalSpaceWidth, hyphenWidth};
  }

  private static readonly emptyLayout: TextLayoutResult = {
    lines: [],
    width: 0,
    height: 0,
    lineHeight: 0,
  };

  /**
   * Compute the text layout for an explicit max-width. Used by the yoga
   * measure function (which receives the constraint dynamically) and by
   * draw() / public introspection methods (which read the resolved size).
   */
  protected layoutFor(maxWidth: number): TextLayoutResult {
    const prepared = this.preparedLayout();
    if (!prepared) return Txt.emptyLayout;

    const baseLineHeight = this.resolvedLineHeight();
    const fragmentLines: StyledFragment[][] = [];
    let totalWidth = 0;

    const finish = (): TextLayoutResult => {
      const lines: TextLine[] = [];
      let top = 0;
      for (const fragments of fragmentLines) {
        lines.push({fragments, top, height: baseLineHeight});
        top += baseLineHeight;
      }
      return {
        lines,
        width: totalWidth,
        height: top,
        lineHeight: baseLineHeight,
      };
    };

    if (prepared.kind === 'simple' && this.wrapMode() === 'knuth-plass') {
      const {normalSpaceWidth, hyphenWidth} = this.measureFontConstants(
        prepared.style.font,
      );
      const kpLines = knuthPlass(prepared.prepared, maxWidth, {
        normalSpaceWidth,
        hyphenWidth,
      });
      for (const line of kpLines) {
        fragmentLines.push([{text: line.text, x: 0, style: prepared.style}]);
        if (line.width > totalWidth) totalWidth = line.width;
      }
      return finish();
    }

    if (prepared.kind === 'rich') {
      walkRichInlineLineRanges(prepared.prepared, maxWidth, range => {
        const line = materializeRichInlineLineRange(prepared.prepared, range);
        const styledFragments: StyledFragment[] = [];
        let x = 0;
        for (const fragment of line.fragments) {
          x += fragment.gapBefore;
          const style = prepared.styles[fragment.itemIndex];
          if (style) {
            styledFragments.push({
              text: fragment.text,
              x,
              style,
            });
          }
          x += fragment.occupiedWidth;
        }
        fragmentLines.push(styledFragments);
        if (line.width > totalWidth) {
          totalWidth = line.width;
        }
      });
    } else {
      walkLineRanges(prepared.prepared, maxWidth, range => {
        const line = materializeLineRange(prepared.prepared, range);
        fragmentLines.push([{text: line.text, x: 0, style: prepared.style}]);
        if (line.width > totalWidth) {
          totalWidth = line.width;
        }
      });
    }

    return finish();
  }

  /**
   * Effective wrap constraint when no explicit yoga measurement is in play
   * (e.g. for `draw()` and `textLines()`).
   */
  @computed()
  protected effectiveMaxWidth(): number {
    if (this.textWrap() === false) {
      return Number.POSITIVE_INFINITY;
    }
    const desiredWidth = this.width.context.getter();
    if (typeof desiredWidth === 'number') {
      return desiredWidth;
    }
    // Flex/percent Txts have no numeric width; wrap at the yoga-resolved one.
    // The +0.5 absorbs yoga's pixel rounding, which would otherwise re-wrap.
    const computedWidth = this.computedSize().x;
    return computedWidth > 0 ? computedWidth + 0.5 : Number.POSITIVE_INFINITY;
  }

  @computed()
  protected textLayout(): TextLayoutResult {
    return this.layoutFor(this.effectiveMaxWidth());
  }

  private measureForYoga(
    width: number,
    widthMode: number,
  ): {width: number; height: number} {
    const maxWidth =
      widthMode === MeasureMode.Undefined ? Number.POSITIVE_INFINITY : width;
    const wrap = this.textWrap();
    const effectiveMax = wrap === false ? Number.POSITIVE_INFINITY : maxWidth;
    // Reuse the memoized layout when the constraint matches the declared width.
    const desiredWidth = this.width.context.getter();
    const reusable =
      wrap === false ||
      (typeof desiredWidth === 'number' && effectiveMax === desiredWidth);
    const layout = reusable ? this.textLayout() : this.layoutFor(effectiveMax);
    return {width: layout.width, height: layout.height};
  }

  protected override parseChildren(children: ComponentChildren): AnyTxt[] {
    const result: AnyTxt[] = [];
    const array = Array.isArray(children) ? children : [children];
    for (const child of array) {
      if (child instanceof Txt || child instanceof TxtLeaf) {
        result.push(child);
      } else if (typeof child === 'string') {
        result.push(new TxtLeaf({text: child}));
      }
    }

    return result;
  }

  /**
   * The current layout with alignment fully resolved per line: line widths
   * measured and `textAlign` offsets applied. Single source of truth for
   * `draw()`.
   */
  @computed()
  protected positionedLines(): PositionedLine[] {
    const layout = this.textLayout();
    if (layout.lines.length === 0) return [];
    const {x: blockWidth} = this.size();

    const result: PositionedLine[] = [];
    for (const line of layout.lines) {
      let lineWidth = 0;
      for (const frag of line.fragments) {
        lineWidth = Math.max(
          lineWidth,
          frag.x + this.measureStyledText(frag.text, frag.style),
        );
      }

      const baselineOffsets = line.fragments.map(frag => {
        const {ascent, descent} = this.measureFontMetrics(frag.style);
        return (line.height - (ascent + descent)) / 2 + ascent;
      });

      result.push({
        fragments: line.fragments,
        top: line.top,
        height: line.height,
        alignOffset: this.computeAlignOffset(blockWidth, lineWidth),
        baselineOffsets,
      });
    }

    return result;
  }

  protected override draw(context: CanvasRenderingContext2D) {
    if (this.parentTxt()) {
      return;
    }

    this.requestFontUpdate();
    const lines = this.positionedLines();
    const {width, height} = this.size();

    context.save();
    this.applyStyle(context);
    this.applyText(context);
    context.textBaseline = 'alphabetic';

    for (const line of lines) {
      for (let fragIndex = 0; fragIndex < line.fragments.length; fragIndex++) {
        const fragment = line.fragments[fragIndex];
        const {style} = fragment;
        const x = width / -2 + fragment.x + line.alignOffset;
        // Alphabetic baseline with metric offsets matches CSS line-box
        // centering (content box, not the em square).
        const fragY = height / -2 + line.top + line.baselineOffsets[fragIndex];

        context.font = style.font;
        if ('letterSpacing' in context) {
          (context as CanvasRenderingContext2D).letterSpacing =
            `${style.letterSpacing}px`;
        }

        context.fillStyle = resolveCanvasStyle(style.fill, context);
        context.strokeStyle = resolveCanvasStyle(style.stroke, context);
        context.lineWidth = style.lineWidth;

        if (style.lineWidth <= 0) {
          context.fillText(fragment.text, x, fragY);
        } else if (style.strokeFirst) {
          context.strokeText(fragment.text, x, fragY);
          context.fillText(fragment.text, x, fragY);
        } else {
          context.fillText(fragment.text, x, fragY);
          context.strokeText(fragment.text, x, fragY);
        }
      }
    }

    context.restore();
  }

  protected override getCacheBBox(): BBox {
    const lineWidth = this.lineWidth();
    // We take the default value of the miterLimit as 10.
    const miterLimitCoefficient = this.lineJoin() === 'miter' ? 0.5 * 10 : 0.5;
    // Pad vertically for glyphs that overshoot the line box.
    return BBox.fromSizeCentered(this.computedSize())
      .expand([0, this.fontSize() * 0.5])
      .expand(lineWidth * miterLimitCoefficient);
  }

  private computeAlignOffset(
    containerWidth: number,
    lineWidth: number,
  ): number {
    const align = this.textAlign();
    const rtl = this.textDirection() === 'rtl';
    switch (align) {
      case 'center':
        return (containerWidth - lineWidth) / 2;
      case 'right':
        return containerWidth - lineWidth;
      case 'end':
        return rtl ? 0 : containerWidth - lineWidth;
      case 'start':
        return rtl ? containerWidth - lineWidth : 0;
      case 'left':
        return 0;
      default:
        return rtl ? containerWidth - lineWidth : 0;
    }
  }

  /**
   * Get the computed lines of the text layout.
   *
   * @remarks
   * Useful for querying word positions, line counts, and other layout data.
   */
  public textLines(): TextLayoutResult {
    return this.textLayout();
  }

  /**
   * Get the number of lines in the current text layout.
   */
  public lineCount(): number {
    return this.textLayout().lines.length;
  }

  /**
   * Find the tightest container width that still fits all the text.
   *
   * @remarks
   * Uses Pretext's line-stats measurement without allocating fragment strings.
   */
  public shrinkWrapWidth(): number {
    const prepared = this.preparedLayout();
    if (!prepared) return 0;
    if (prepared.kind === 'simple') {
      return measureNaturalWidth(prepared.prepared);
    }
    return measureGroupStats([prepared.prepared], Number.POSITIVE_INFINITY)
      .maxLineWidth;
  }

  /**
   * Binary search for a balanced text width where lines are roughly equal.
   *
   * @param targetLineCount - Optional target line count. If not provided,
   *   uses the natural (single-line) layout count.
   */
  public balancedWidth(targetLineCount?: number): number {
    const prepared = this.preparedLayout();
    if (!prepared) return 0;

    const measureStats = (maxWidth: number) =>
      prepared.kind === 'simple'
        ? measureLineStats(prepared.prepared, maxWidth)
        : measureGroupStats([prepared.prepared], maxWidth);

    const naturalStats = measureStats(Number.POSITIVE_INFINITY);
    const target = targetLineCount ?? naturalStats.lineCount;
    if (target <= 1) return naturalStats.maxLineWidth;

    let lo = 1;
    let hi = naturalStats.maxLineWidth;

    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      const stats = measureStats(mid);
      if (stats.lineCount <= target) {
        hi = mid;
      } else {
        lo = mid;
      }
    }

    return Math.ceil(hi);
  }

  /**
   * Binary search for the largest font size that fits text within given
   * dimensions, clamped at the configured {@link fontSize}.
   *
   * @remarks
   * Reads each leaf at its raw (unscaled) size, so this method is safe to
   * call from inside {@link effectiveFontSize} without creating a dependency
   * cycle.
   */
  public fitFontSize(maxWidth: number, maxHeight: number): number {
    const {items, styles} = this.collectItemsWithScale(1);
    const rawSize = this.fontSize();
    if (items.length === 0 || !this.measurementContext()) return rawSize;

    let lo = 1;
    let hi = rawSize;

    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      const scale = mid / rawSize;
      const scaledItems = items.map((item, idx) => {
        const {fontComponents} = styles[idx];
        const scaledFont = buildCanvasFontString(
          fontComponents.style,
          fontComponents.weight,
          fontComponents.size * scale,
          fontComponents.family,
        );
        return {...item, font: scaledFont};
      });
      const stats = measureGroupStats(
        [prepareRichInline(scaledItems)],
        maxWidth,
      );
      const lh = resolveLineHeight(this.lineHeight(), mid);
      const height = stats.lineCount * lh;
      const fits = stats.maxLineWidth <= maxWidth && height <= maxHeight;
      if (fits) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    return Math.floor(lo);
  }

  // Nested runs inherit fill / stroke / line settings from the parent Txt.

  protected getDefaultFill(initial: unknown): unknown {
    return this.parentTxt()?.fill() ?? initial;
  }

  protected getDefaultStroke(initial: unknown): unknown {
    return this.parentTxt()?.stroke() ?? initial;
  }

  protected getDefaultLineWidth(initial: unknown): unknown {
    return this.parentTxt()?.lineWidth() ?? initial;
  }

  protected getDefaultStrokeFirst(initial: unknown): unknown {
    return this.parentTxt()?.strokeFirst() ?? initial;
  }

  protected getDefaultLineCap(initial: unknown): unknown {
    return this.parentTxt()?.lineCap() ?? initial;
  }

  protected getDefaultLineJoin(initial: unknown): unknown {
    return this.parentTxt()?.lineJoin() ?? initial;
  }

  protected getDefaultLineDash(initial: unknown): unknown {
    return this.parentTxt()?.lineDash() ?? initial;
  }

  protected getDefaultLineDashOffset(initial: unknown): unknown {
    return this.parentTxt()?.lineDashOffset() ?? initial;
  }
}
