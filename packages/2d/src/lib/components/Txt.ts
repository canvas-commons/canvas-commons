import {
  BBox,
  DEFAULT,
  InterpolationFunction,
  SignalValue,
  SimpleSignal,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  all,
  threadable,
} from '@canvas-commons/core';
import {
  PreparedTextWithSegments,
  layoutNextLine,
  materializeLineRange,
  measureLineStats,
  measureNaturalWidth,
  prepareWithSegments,
  walkLineRanges,
} from '@chenglou/pretext';
import {computed, initial, nodeName, signal} from '../decorators';
import {CanvasStyle} from '../partials';
import type {TextExclusion} from '../partials/types';
import {
  Interval,
  PreparedRichInline,
  RichInlineItem,
  buildCanvasFontString,
  carveTextLineSlots,
  getPolygonIntervalForBand,
  getRectIntervalsForBand,
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
import {Layout} from './Layout';
import {Node} from './Node';
import {Shape, ShapeProps} from './Shape';
import {TxtLeaf} from './TxtLeaf';
import {ComponentChildren} from './types';

type TxtChildren = string | Node | (string | Node)[];

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
  exclusions?: SignalValue<TextExclusion[]>;
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
  /**
   * Set when this fragment is an inline non-text node placeholder. The owning
   * `Txt` derives `inline`'s position from the fragment's slot center.
   */
  inline?: Layout;
  /**
   * Slot width allocated to an inline element. Only set when `inline` is
   * present; matches the slot width pretext used for layout.
   */
  inlineWidth?: number;
};

/**
 * A single laid-out line of a {@link Txt} block.
 *
 * @remarks
 * `top` is the line box's top edge in pretext-space (`0` is the top of the
 * text block). `height` is the line box height — the base line height unless
 * an inline element on this line is taller, or an exclusion band pushed the
 * line down (in which case `top` reflects the skipped bands).
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
 * - `lineHeight` is the base per-line advance before any line grows.
 */
export type TextLayoutResult = {
  lines: TextLine[];
  width: number;
  height: number;
  lineHeight: number;
};

const HORIZONTAL_WHITESPACE_RE = /[ \t\f\r]+/g;
const MAX_BAND_ITERATIONS = 2048;

/**
 * Normalize runs of horizontal whitespace to a single space while preserving
 * literal newlines. Matches CSS `white-space: pre-line` semantics when the
 * result is fed to pretext under `pre-wrap`.
 */
function collapseInlineWhitespace(text: string): string {
  return text.replace(HORIZONTAL_WHITESPACE_RE, ' ');
}

/**
 * Map a `textWrap` value to the text+whiteSpace pair that pretext's simple
 * path expects.
 */
function prepareTextForWrapMode(
  text: string,
  wrap: boolean | 'pre',
): {text: string; whiteSpace: 'normal' | 'pre-wrap'} {
  if (wrap === 'pre') return {text, whiteSpace: 'pre-wrap'};
  if (wrap === false) return {text, whiteSpace: 'normal'};
  return {text: collapseInlineWhitespace(text), whiteSpace: 'pre-wrap'};
}

type RichGroup = {
  // `null` represents a blank line — no items to feed to pretext.
  prepared: PreparedRichInline | null;
  // Maps the group's local item index back to the shared styles/inlines arrays.
  itemMap: number[];
};

/**
 * Split rich items at explicit newline boundaries into per-line groups.
 *
 * @remarks
 * Pretext's `prepareRichInline` always normalizes whitespace, so a literal
 * `\n` inside an item is collapsed into a space. To preserve newlines under
 * `wrap === true` or `'pre'`, the caller emits each line as its own
 * `prepareRichInline` group and stacks the resulting lines vertically. Empty
 * groups (from `'\\n\\n'`, leading `'\\n'`, or trailing `'\\n'`) survive as
 * blank-line entries so the rendered output matches CSS `pre-wrap`.
 * `wrap === false` ignores newlines (one group with the items as-is).
 */
export function buildRichGroups(
  items: RichInlineItem[],
  wrap: boolean | 'pre',
): Array<{items: RichInlineItem[]; itemMap: number[]}> {
  if (wrap === false) {
    return [{items: items.slice(), itemMap: items.map((_, i) => i)}];
  }

  const groups: Array<{items: RichInlineItem[]; itemMap: number[]}> = [
    {items: [], itemMap: []},
  ];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.text.includes('\n')) {
      const cur = groups[groups.length - 1];
      cur.items.push(item);
      cur.itemMap.push(i);
      continue;
    }
    const lines = item.text.split('\n');
    for (let j = 0; j < lines.length; j++) {
      if (lines[j].length > 0) {
        const cur = groups[groups.length - 1];
        cur.items.push({...item, text: lines[j]});
        cur.itemMap.push(i);
      }
      if (j < lines.length - 1) {
        groups.push({items: [], itemMap: []});
      }
    }
  }

  return groups;
}

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

type JustifiedSegment = {
  text: string;
  advance: number;
  whitespace: boolean;
};

/**
 * A {@link TextLine} with alignment fully resolved: `top` includes the
 * vertical-align offset, `alignOffset` is the horizontal shift for the
 * current `textAlign`, and `justified` carries pre-measured word segments
 * (one list per fragment) when the line is justified.
 */
type PositionedLine = {
  fragments: StyledFragment[];
  top: number;
  height: number;
  alignOffset: number;
  extraPerSpace: number;
  justified: JustifiedSegment[][] | null;
  /**
   * Offset from the line-box top to each fragment's alphabetic baseline,
   * computed from real font metrics so glyphs land where CSS inline layout
   * would put them. `0` for inline-element fragments.
   */
  baselineOffsets: number[];
};

type PreparedLayout =
  | {
      kind: 'rich';
      groups: RichGroup[];
      styles: FragmentStyle[];
      inlines: (Layout | null)[];
    }
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

  /**
   * Shapes that text should flow around (CSS `shape-outside`-style obstacles).
   *
   * @remarks
   * Coordinates are in pretext-space: `(0, 0)` is the top-left of the text
   * block (which corresponds to Txt-local `(-width/2, -height/2)` in canvas
   * coordinates). Rects are axis-aligned; polygons are closed point lists.
   *
   * When any exclusions are present, the line-walking loop switches from
   * pretext's single-`maxWidth` greedy pass to a per-band loop that carves
   * the available width on every line. `wrapMode === 'knuth-plass'` falls back
   * to greedy under exclusions (KP over non-uniform widths is non-trivial).
   *
   * Exclusions currently apply only to single-style text without inline
   * children; rich (nested styled) or inline content ignores them.
   */
  @initial([])
  @signal()
  declare public readonly exclusions: SimpleSignal<TextExclusion[], this>;

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
      this.exclusions(),
    ];
    if (prepared?.kind === 'rich') {
      for (const inline of prepared.inlines) {
        if (inline) key.push(inline.size.y());
      }
    }
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
    inlines: (Layout | null)[];
  } {
    // Re-collect when a web font finishes loading; it has no signal to track.
    fontsVersion();
    const items: RichInlineItem[] = [];
    const styles: FragmentStyle[] = [];
    const inlines: (Layout | null)[] = [];

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
        inlines.push(null);
      } else if (node instanceof Txt && node !== this) {
        for (const child of node.children()) {
          collect(child, node);
        }
      } else if (node instanceof Layout) {
        // Inline children render at native size, not scaled by autoSize.
        const childWidth = node.size.x();
        const fontComponents: FontComponents = {
          style: ownerTxt.fontStyle(),
          weight: ownerTxt.fontWeight(),
          size: ownerTxt.fontSize() * scale,
          family: ownerTxt.fontFamily(),
        };
        const font = buildCanvasFontString(
          fontComponents.style,
          fontComponents.weight,
          fontComponents.size,
          fontComponents.family,
        );
        requestFontLoad(font);
        // Subtract the placeholder's own advance so the slot equals the
        // child's width (pretext reserves measured + extraWidth).
        const placeholderWidth = this.measurePlaceholderWidth(font);
        items.push({
          text: '￼',
          font,
          break: 'never',
          extraWidth: Math.max(0, childWidth - placeholderWidth),
        });
        styles.push({
          fill: null,
          stroke: null,
          lineWidth: 0,
          strokeFirst: false,
          font,
          fontComponents,
          letterSpacing: 0,
        });
        inlines.push(node);
      }
    };

    for (const child of this.children()) {
      collect(child, this);
    }

    return {items, styles, inlines};
  }

  /**
   * Collect all descendant text runs as RichInlineItems with their styles.
   *
   * Walks `TxtLeaf` and nested `Txt` descendants; direct `Layout` children of
   * a top-level `Txt` become atomic inline slots (`break: 'never'`) sized by
   * the child's own `width`/`height` signals.
   */
  @computed()
  protected collectInlineItems(): {
    items: RichInlineItem[];
    styles: FragmentStyle[];
    inlines: (Layout | null)[];
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
    const {items, styles, inlines} = this.collectInlineItems();
    if (items.length === 0) return null;

    const hasInline = inlines.some(n => n !== null);
    const hyphenate = this.hyphenate();
    const wordBreak = this.wordBreak();
    const wrap = this.textWrap();
    const useSimplePath = !hasInline && items.length === 1;

    const prepItems =
      hyphenate && !hasInline
        ? items.map(item => ({
            ...item,
            text: this.applyHyphenation(item.text, hyphenate),
          }))
        : items;

    if (useSimplePath) {
      const {text: sourceText, whiteSpace} = prepareTextForWrapMode(
        prepItems[0].text,
        wrap,
      );
      const prepared = prepareWithSegments(sourceText, prepItems[0].font, {
        whiteSpace,
        wordBreak,
        letterSpacing: styles[0].letterSpacing || undefined,
      });
      return {kind: 'simple', prepared, style: styles[0]};
    }
    const groups = buildRichGroups(prepItems, wrap);
    return {
      kind: 'rich',
      groups: groups.map(g => ({
        prepared: g.items.length > 0 ? prepareRichInline(g.items) : null,
        itemMap: g.itemMap,
      })),
      styles,
      inlines,
    };
  }

  /**
   * Band-by-band greedy layout that wraps around `exclusions`. Used when one
   * or more `exclusions` are present; falls back to pretext's single-width
   * walker otherwise.
   *
   * @returns one entry per laid-out line, with `x` being the slot's left
   *   offset (in Txt-local pretext-space, where 0 = block left).
   */
  private layoutWithExclusions(
    prepared: PreparedTextWithSegments,
    maxWidth: number,
    exclusions: TextExclusion[],
  ): {text: string; x: number; width: number; lineTop: number}[] {
    const lh = this.resolvedLineHeight();
    const lines: {
      text: string;
      x: number;
      width: number;
      lineTop: number;
    }[] = [];
    let cursor = {segmentIndex: 0, graphemeIndex: 0};
    let lineTop = 0;
    const blocked: Interval[] = [];

    for (let i = 0; i < MAX_BAND_ITERATIONS; i++) {
      const bandTop = lineTop;
      const bandBottom = lineTop + lh;
      blocked.length = 0;
      for (const ex of exclusions) {
        const hp = ex.horizontalPadding ?? 0;
        const vp = ex.verticalPadding ?? 0;
        if (ex.kind === 'rect') {
          for (const interval of getRectIntervalsForBand(
            [
              {
                x: ex.x,
                y: ex.y,
                width: ex.width,
                height: ex.height,
              },
            ],
            bandTop,
            bandBottom,
            hp,
            vp,
          )) {
            blocked.push(interval);
          }
        } else {
          const interval = getPolygonIntervalForBand(
            ex.points,
            bandTop,
            bandBottom,
            hp,
            vp,
          );
          if (interval) blocked.push(interval);
        }
      }

      const slots = carveTextLineSlots({left: 0, right: maxWidth}, blocked);
      if (slots.length === 0) {
        lineTop += lh;
        continue;
      }

      let slot = slots[0];
      for (const candidate of slots) {
        if (candidate.right - candidate.left > slot.right - slot.left) {
          slot = candidate;
        }
      }

      const line = layoutNextLine(prepared, cursor, slot.right - slot.left);
      if (line === null) break;
      lines.push({
        text: line.text,
        x: slot.left,
        width: line.width,
        lineTop,
      });
      cursor = line.end;
      lineTop += lh;
    }

    return lines;
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
   * Width of the U+FFFC placeholder glyph in the given font. Subtracted from
   * an inline child's width when computing the slot's `extraWidth`.
   */
  private measurePlaceholderWidth(font: string): number {
    const ctx = this.measurementContext();
    if (!ctx) return 0;
    ctx.font = font;
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = '0px';
    }
    return ctx.measureText('￼').width;
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

    // A tall inline element grows only its own line's box, CSS-style.
    const finish = (): TextLayoutResult => {
      const lines: TextLine[] = [];
      let top = 0;
      for (const fragments of fragmentLines) {
        let height = baseLineHeight;
        for (const frag of fragments) {
          if (frag.inline) {
            const inlineHeight = frag.inline.size.y();
            if (inlineHeight > height) height = inlineHeight;
          }
        }
        lines.push({fragments, top, height});
        top += height;
      }
      return {
        lines,
        width: totalWidth,
        height: top,
        lineHeight: baseLineHeight,
      };
    };

    const exclusions = this.exclusions();
    if (
      exclusions.length > 0 &&
      prepared.kind === 'simple' &&
      Number.isFinite(maxWidth)
    ) {
      const bandLines = this.layoutWithExclusions(
        prepared.prepared,
        maxWidth,
        exclusions,
      );
      const lines: TextLine[] = [];
      for (const line of bandLines) {
        lines.push({
          fragments: [{text: line.text, x: line.x, style: prepared.style}],
          top: line.lineTop,
          height: baseLineHeight,
        });
        const fullRight = line.x + line.width;
        if (fullRight > totalWidth) totalWidth = fullRight;
      }
      const lastLine = lines[lines.length - 1];
      return {
        lines,
        width: totalWidth,
        height: lastLine ? lastLine.top + lastLine.height : 0,
        lineHeight: baseLineHeight,
      };
    }

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
      for (const group of prepared.groups) {
        if (group.prepared === null) {
          fragmentLines.push([]);
          continue;
        }
        const groupPrepared = group.prepared;
        walkRichInlineLineRanges(groupPrepared, maxWidth, range => {
          const line = materializeRichInlineLineRange(groupPrepared, range);
          const styledFragments: StyledFragment[] = [];
          let x = 0;
          for (const fragment of line.fragments) {
            x += fragment.gapBefore;
            const originalIndex = group.itemMap[fragment.itemIndex];
            const style = prepared.styles[originalIndex];
            const inline = prepared.inlines[originalIndex] ?? undefined;
            if (style) {
              styledFragments.push({
                text: fragment.text,
                x,
                style,
                inline,
                inlineWidth: inline ? fragment.occupiedWidth : undefined,
              });
            }
            x += fragment.occupiedWidth;
          }
          fragmentLines.push(styledFragments);
          if (line.width > totalWidth) {
            totalWidth = line.width;
          }
        });
      }
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

  protected override parseChildren(children: ComponentChildren): Node[] {
    const result: Node[] = [];
    const array = Array.isArray(children) ? children : [children];
    for (const child of array) {
      if (child instanceof Txt || child instanceof TxtLeaf) {
        result.push(child);
      } else if (child instanceof Layout) {
        // Bind position to the text slot; an explicit position() later opts
        // the child out of the flow.
        child.position(() => this.inlinePositionOf(child));
        result.push(child);
      } else if (typeof child === 'string') {
        result.push(new TxtLeaf({text: child}));
      }
    }

    return result;
  }

  @computed()
  protected rootTxt(): Txt {
    return this.parentTxt()?.rootTxt() ?? this;
  }

  /**
   * Position of an inline child, derived from the laid-out slot it occupies
   * in the root `Txt`'s text flow. Returns the slot center in root-local
   * coordinates; `(0, 0)` when the child has no slot (e.g. headless layout).
   */
  protected inlinePositionOf(child: Layout): Vector2 {
    const root = this.rootTxt();
    const lines = root.positionedLines();
    const {x: width, y: height} = root.size();
    for (const line of lines) {
      for (const fragment of line.fragments) {
        if (fragment.inline === child) {
          return new Vector2(
            width / -2 +
              fragment.x +
              line.alignOffset +
              (fragment.inlineWidth ?? 0) / 2,
            height / -2 + line.top + line.height / 2,
          );
        }
      }
    }
    return Vector2.zero;
  }

  /**
   * The current layout with alignment fully resolved per line: line widths
   * measured (inline-aware), `textAlign` / `verticalAlign` offsets applied,
   * and justify slack pre-measured. Single source of truth for `draw()`,
   * {@link splitLayout}, and inline child positioning.
   */
  @computed()
  protected positionedLines(): PositionedLine[] {
    const layout = this.textLayout();
    if (layout.lines.length === 0) return [];
    const {x: blockWidth, y: blockHeight} = this.size();
    const align = this.textAlign();
    const verticalAlign = this.verticalAlign();
    const verticalOffset =
      verticalAlign === 'middle'
        ? (blockHeight - layout.height) / 2
        : verticalAlign === 'bottom'
          ? blockHeight - layout.height
          : 0;

    const result: PositionedLine[] = [];
    for (let i = 0; i < layout.lines.length; i++) {
      const line = layout.lines[i];
      const isLastLine = i === layout.lines.length - 1;

      let lineWidth = 0;
      for (const frag of line.fragments) {
        lineWidth = Math.max(
          lineWidth,
          frag.x +
            (frag.inline
              ? (frag.inlineWidth ?? 0)
              : this.measureStyledText(frag.text, frag.style)),
        );
      }

      const justifyLine =
        align === 'justify' && !isLastLine && lineWidth < blockWidth;
      let extraPerSpace = 0;
      let justified: JustifiedSegment[][] | null = null;
      if (justifyLine) {
        let spaceCount = 0;
        justified = line.fragments.map(frag => {
          if (frag.inline) return [];
          const segments: JustifiedSegment[] = [];
          for (const seg of segment(frag.text, 'word')) {
            // Slack rides only whitespace runs, not punctuation.
            const whitespace = !seg.isWordLike && /^\s+$/.test(seg.segment);
            if (whitespace) spaceCount++;
            segments.push({
              text: seg.segment,
              advance: this.measureStyledText(seg.segment, frag.style),
              whitespace,
            });
          }
          return segments;
        });
        if (spaceCount > 0) {
          extraPerSpace = (blockWidth - lineWidth) / spaceCount;
        } else {
          justified = null;
        }
      }

      const baselineOffsets = line.fragments.map(frag => {
        if (frag.inline) return 0;
        const {ascent, descent} = this.measureFontMetrics(frag.style);
        return (line.height - (ascent + descent)) / 2 + ascent;
      });

      result.push({
        fragments: line.fragments,
        top: line.top + verticalOffset,
        height: line.height,
        alignOffset: justifyLine
          ? 0
          : this.computeAlignOffset(blockWidth, lineWidth),
        extraPerSpace,
        justified: extraPerSpace > 0 ? justified : null,
        baselineOffsets,
      });
    }

    return result;
  }

  protected override draw(context: CanvasRenderingContext2D) {
    if (this.parentTxt()) {
      // The root Txt paints all text; a nested Txt only renders its own
      // inline children (positioned reactively off the root's layout).
      this.drawChildren(context);
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
        if (fragment.inline) continue;

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

        const justified = line.justified?.[fragIndex];
        if (justified && line.extraPerSpace > 0) {
          // Whitespace runs absorb the per-space slack; words paint at cursor.
          let cursorX = x;
          for (const seg of justified) {
            if (!seg.whitespace) {
              if (style.lineWidth <= 0) {
                context.fillText(seg.text, cursorX, fragY);
              } else if (style.strokeFirst) {
                context.strokeText(seg.text, cursorX, fragY);
                context.fillText(seg.text, cursorX, fragY);
              } else {
                context.fillText(seg.text, cursorX, fragY);
                context.strokeText(seg.text, cursorX, fragY);
              }
              cursorX += seg.advance;
            } else {
              cursorX += seg.advance + line.extraPerSpace;
            }
          }
        } else if (style.lineWidth <= 0) {
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
    this.drawChildren(context);
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
    return measureGroupStats(
      prepared.groups.map(g => g.prepared),
      Number.POSITIVE_INFINITY,
    ).maxLineWidth;
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
        : measureGroupStats(
            prepared.groups.map(g => g.prepared),
            maxWidth,
          );

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

    const wrap = this.textWrap();
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
      const groups = buildRichGroups(scaledItems, wrap);
      const stats = measureGroupStats(
        groups.map(g =>
          g.items.length > 0 ? prepareRichInline(g.items) : null,
        ),
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
