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
  clamp,
  threadable,
  tween,
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
import {CurveProfile, createCurveSampler} from '../curves/CurveProfile';
import {Segment} from '../curves/Segment';
import {getPathProfile} from '../curves/getPathProfile';
import {computed, initial, nodeName, signal} from '../decorators';
import {CanvasStyle} from '../partials';
import type {TextExclusion} from '../partials/types';
import {
  Interval,
  PreparedRichInline,
  RichInlineItem,
  SegmentGranularity,
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
import {
  SVGContext,
  applySVGPaint,
  createSVGElement,
  fontsVersion,
  requestFontLoad,
  resolveCanvasStyle,
  svgNumber,
} from '../utils';
import {MeasureMode} from '../utils/yoga';
import {Curve} from './Curve';
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

/**
 * A path for {@link Txt.textPath}: SVG path data, a pre-built
 * {@link CurveProfile}, or a live {@link Curve} node. Strings and profiles are
 * read in the `Txt`'s own local space; a `Curve` node is sampled in its space
 * and mapped into the `Txt`'s automatically.
 */
export type TxtPath = CurveProfile | string | Curve;

/**
 * Where each glyph sits across {@link Txt.textPath}: the alphabetic `baseline`
 * (default), an edge keyword (`top` / `middle` / `bottom`), `'smooth'` to push
 * glyphs to the outside of every turn automatically, or a number in `[-1, 1]`
 * (`-1` top, `0` middle, `1` bottom). The number is the tweenable form — animate
 * it directly instead of switching states.
 */
export type PathAlign =
  | 'baseline'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'smooth'
  | number;

/**
 * Unit the text breaks into when laid on {@link Txt.textPath}: `grapheme`
 * (default) places each glyph for the tightest curve following, `word` paints
 * each word as one run so contextual shaping and ligatures survive (at the cost
 * of words staying rigid through a bend).
 */
export type PathSplit = 'grapheme' | 'word';

/**
 * Resolve a non-`smooth` {@link PathAlign} to a normalized cross-path offset
 * (`-1` top, `0` middle, `1` bottom), or `null` for the alphabetic baseline.
 * `smooth` also returns `null` here — it is computed per glyph instead.
 */
function resolvePathAnchor(align: PathAlign): number | null {
  switch (align) {
    case 'baseline':
    case 'smooth':
      return null;
    case 'top':
      return -1;
    case 'middle':
      return 0;
    case 'bottom':
      return 1;
    default:
      return clamp(-1, 1, align);
  }
}

export interface TxtProps extends ShapeProps {
  children?: TxtChildren;
  text?: SignalValue<string>;
  autoSize?: SignalValue<boolean>;
  wrapMode?: SignalValue<TxtWrapMode>;
  hyphenate?: SignalValue<HyphenateFn | null>;
  exclusions?: SignalValue<TextExclusion[]>;
  textPath?: SignalValue<TxtPath | null>;
  pathOffset?: SignalValue<number>;
  pathAlign?: SignalValue<PathAlign>;
  pathSmoothness?: SignalValue<number>;
  pathSplit?: SignalValue<PathSplit>;
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

/**
 * A positioned slice of text within a {@link Txt}. Coordinates are in
 * Txt-local center-origin space (the same coordinate system used for `draw()`),
 * so the unit's center is at `(x, y)` relative to the `Txt`'s own position.
 */
export type TextUnit = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lineIndex: number;
  indexInLine: number;
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
  // `null` is a blank line — no items to feed to pretext.
  prepared: PreparedRichInline | null;
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

  /**
   * Lay the text out along a curve instead of a straight baseline.
   *
   * @remarks
   * Accepts SVG path data, a {@link CurveProfile}, or a live {@link Curve} node.
   * Strings and profiles are read in this node's local (center-origin) space; a
   * `Curve` node is sampled in its own space and mapped into this node's
   * automatically, so the two may sit at different transforms. Only translation,
   * rotation, and uniform scale map correctly — non-uniform scale or shear
   * between the two distorts spacing.
   *
   * Setting a path forces a single line (wrapping, `autoSize`, and embedded
   * newlines are ignored) and disables {@link split} / {@link textWords} and
   * friends. Glyphs whose advance falls outside the path are clipped, not piled
   * at the ends. {@link pathOffset} slides the run along the arc; `textAlign`
   * anchors it. Reverse the path to flip the text onto the other side (the
   * tangent reverses, so glyphs read upside down along it). Per-glyph rendering
   * drops cross-glyph shaping — set {@link pathSplit} to `word` for scripts that
   * need it.
   *
   * Prefer smooth curves. Like SVG `<textPath>`, a sharp corner crowds glyphs on
   * the inside of the turn — each glyph orients to the chord across its advance,
   * which softens the bend but cannot space glyphs evenly past a hard vertex.
   * {@link pathAlign} `'smooth'` leans glyphs to the outside of each turn.
   *
   * Pass a live {@link Curve} node to animate the curve itself — the text
   * re-samples it every frame:
   *
   * @example
   * ```tsx
   * const circle = createRef<Circle>();
   * view.add(<Circle ref={circle} size={400} />);
   * view.add(<Txt textPath={circle} fill={'white'}>orbit</Txt>);
   * ```
   */
  @initial(null)
  @signal()
  declare public readonly textPath: SimpleSignal<TxtPath | null, this>;

  /**
   * Distance in pixels to slide the text along {@link textPath} from its
   * anchored start. Animate this for a marquee-style crawl along the curve.
   *
   * @example
   * ```tsx
   * yield * label().pathOffset(300, 2);
   * ```
   */
  @initial(0)
  @signal()
  declare public readonly pathOffset: SimpleSignal<number, this>;

  /**
   * Where each glyph rides {@link textPath} across the curve — `baseline`
   * (default), `top` / `middle` / `bottom`, `smooth`, or a number in `[-1, 1]`.
   *
   * @remarks
   * Anchoring to the outside of a turn keeps glyphs from crowding on the inside
   * of a corner. `smooth` does this automatically, biasing each glyph toward the
   * outside in proportion to how hard the path turns under it. The numeric form
   * (`-1` top, `0` middle, `1` bottom) is continuous, so it tweens cleanly —
   * prefer it over switching keyword states mid-animation.
   *
   * @example
   * ```tsx
   * <Txt textPath={wave} pathAlign={'smooth'}>over and under</Txt>
   * ```
   */
  @initial('baseline')
  @signal()
  declare public readonly pathAlign: SimpleSignal<PathAlign, this>;

  /**
   * How hard {@link pathAlign} `'smooth'` leans into a turn — the gain mapping a
   * vertex's signed turn (radians) to the `[-1, 1]` anchor.
   *
   * @remarks
   * At the default `1.4` a ~64° corner saturates to a full top/bottom anchor;
   * raise it to reach the edge on gentler turns, lower it for a subtler lean.
   * No effect unless `pathAlign` is `'smooth'`.
   */
  @initial(1.4)
  @signal()
  declare public readonly pathSmoothness: SimpleSignal<number, this>;

  /**
   * Unit the text breaks into along {@link textPath} — `grapheme` (default) for
   * the tightest curve following, or `word` to keep contextual shaping and
   * ligatures (e.g. Arabic) by painting each word as one run.
   *
   * @remarks
   * Per-glyph rendering paints each grapheme in isolation, which drops
   * cross-glyph shaping; `word` trades some curve fidelity (words stay rigid
   * through a bend) for correct shaping.
   */
  @initial('grapheme')
  @signal()
  declare public readonly pathSplit: SimpleSignal<PathSplit, this>;

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
    const oldSizeRaw = this.size.context.raw();
    const oldSize = new Vector2(this.size());
    leaf.text(value);
    const newSize = new Vector2(this.size());
    leaf.text(oldText ?? DEFAULT);

    if (oldSize.y === 0) {
      this.height(newSize.y);
      oldSize.y = newSize.y;
    } else if (newSize.y === 0) {
      newSize.y = oldSize.y;
    }

    const startingFontSize = this.fontSize();
    const sizeAt = (base: Vector2): Vector2 => {
      if (startingFontSize === 0) return base;
      const scale = this.fontSize() / startingFontSize;
      return new Vector2(base.x * scale, base.y * scale);
    };

    this.lockLayout();

    yield* all(
      tween(time, t => {
        const progress = timingFunction(t);
        this.size(Vector2.lerp(sizeAt(oldSize), sizeAt(newSize), progress));
      }),
      leaf.text(value, time, timingFunction, interpolationFunction),
    );

    this.children.context.setter(value);
    this.releaseLayout();
    this.textWrap(oldWrap ?? DEFAULT);
    this.size(oldSizeRaw);
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
  public override canLayoutChildren(): boolean {
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
    if (this.pathProfile() || !this.autoSize()) return this.fontSize();
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
        // A path forces a single line, so newlines collapse to spaces.
        const text =
          this.textPath() === null
            ? node.text()
            : node.text().replace(/\n/g, ' ');
        items.push({
          text,
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
      ctx.letterSpacing = '0px';
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
   * Resolve {@link textPath} to a curve profile, or `null` when unset. For
   * a {@link Curve} node the profile is in the curve's own space; pair it with
   * {@link pathTransform} to map into this node's local space.
   */
  @computed()
  protected pathProfile(): CurveProfile | null {
    const path = this.textPath();
    if (path === null) {
      return null;
    }
    if (typeof path === 'string') {
      return getPathProfile(path);
    }
    if (path instanceof Curve) {
      return path.profile();
    }
    return path;
  }

  /**
   * Matrix mapping {@link pathProfile} coordinates into this node's local space.
   * Identity for string and profile paths (already local); the curve→Txt
   * transform for a live {@link Curve} node.
   */
  @computed()
  protected pathTransform(): DOMMatrix {
    const path = this.textPath();
    if (path instanceof Curve) {
      return this.worldToLocal().multiply(path.localToWorld());
    }
    return new DOMMatrix();
  }

  /**
   * Linear scale of {@link pathTransform} — local pixels per unit of path arc
   * length. Keeps glyph advances (px) in step with path distance when the curve
   * sits at a different scale. Non-uniform scale and shear are unsupported.
   */
  @computed()
  protected pathScale(): number {
    const m = this.pathTransform();
    return (Math.hypot(m.a, m.b) + Math.hypot(m.c, m.d)) / 2 || 1;
  }

  /**
   * Arc length of the resolved {@link textPath} in this node's local pixels, or
   * `0` when no path is set.
   */
  @computed()
  public pathArcLength(): number {
    const profile = this.pathProfile();
    return profile ? profile.arcLength * this.pathScale() : 0;
  }

  /**
   * Bounding box of the resolved {@link textPath} in this node's local space, or
   * `null` when no path is set. Sampled along the arc so curved segments are
   * bounded by the curve itself, not its control hull.
   */
  @computed()
  protected pathBBox(): BBox | null {
    const profile = this.pathProfile();
    if (!profile || profile.segments.length === 0) {
      return null;
    }
    const matrix = this.pathTransform();
    const sample = createCurveSampler(profile);
    const steps = clamp(16, 256, Math.ceil(profile.arcLength / 8));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i <= steps; i++) {
      const point = sample(
        (profile.arcLength * i) / steps,
      ).position.transformAsPoint(matrix);
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    return new BBox(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * Effective wrap constraint when no explicit yoga measurement is in play
   * (e.g. for `draw()` and `textLines()`).
   */
  @computed()
  protected effectiveMaxWidth(): number {
    if (this.pathProfile() || this.textWrap() === false) {
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
    const pathBBox = this.pathBBox();
    if (pathBBox) {
      return {width: pathBBox.width, height: pathBBox.height};
    }
    const maxWidth =
      widthMode === MeasureMode.Undefined ? Number.POSITIVE_INFINITY : width;
    const wrap = this.textWrap();
    const effectiveMax = wrap === false ? Number.POSITIVE_INFINITY : maxWidth;
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
    const profile = this.pathProfile();
    if (profile) {
      this.drawAlongPath(context, profile);
      this.drawChildren(context);
      return;
    }

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
          context.letterSpacing = `${style.letterSpacing}px`;
        }

        context.fillStyle = resolveCanvasStyle(style.fill, context);
        context.strokeStyle = resolveCanvasStyle(style.stroke, context);
        context.lineWidth = style.lineWidth;

        const justified = line.justified?.[fragIndex];
        if (justified && line.extraPerSpace > 0) {
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

  public override toSVG(ctx: SVGContext): SVGElement[] {
    // The root Txt paints every fragment; a nested Txt only contributes its
    // inline children (serialized separately).
    if (this.parentTxt()) {
      return [];
    }

    this.requestFontUpdate();
    const profile = this.pathProfile();
    if (profile) {
      return this.toSVGAlongPath(profile, ctx);
    }

    const lines = this.positionedLines();
    const {x: width, y: height} = this.size();

    const elements: SVGElement[] = [];
    for (const line of lines) {
      for (let i = 0; i < line.fragments.length; i++) {
        const fragment = line.fragments[i];
        if (fragment.inline || fragment.text.length === 0) continue;

        const {style} = fragment;
        const y = -height / 2 + line.top + line.baselineOffsets[i];
        const baseX = -width / 2 + fragment.x + line.alignOffset;

        const justified = line.justified?.[i];
        if (justified && line.extraPerSpace > 0) {
          let cursorX = baseX;
          for (const seg of justified) {
            if (!seg.whitespace) {
              elements.push(this.svgText(seg.text, cursorX, y, style, ctx));
              cursorX += seg.advance;
            } else {
              cursorX += seg.advance + line.extraPerSpace;
            }
          }
        } else {
          elements.push(this.svgText(fragment.text, baseX, y, style, ctx));
        }
      }
    }

    return elements;
  }

  private svgText(
    text: string,
    x: number,
    y: number,
    style: FragmentStyle,
    ctx: SVGContext,
  ): SVGElement {
    const element = createSVGElement('text', {x, y});
    this.applySVGTextStyle(element, style, ctx);
    element.textContent = text;
    return element;
  }

  /** Sets the font and paint attributes of a `<text>`/`<textPath>` element. */
  private applySVGTextStyle(
    element: SVGElement,
    style: FragmentStyle,
    ctx: SVGContext,
  ): void {
    const {family, size, weight, style: fontStyle} = style.fontComponents;
    element.setAttribute('font-family', family);
    element.setAttribute('font-size', svgNumber(size));
    if (weight !== 400) {
      element.setAttribute('font-weight', `${weight}`);
    }
    if (fontStyle && fontStyle !== 'normal') {
      element.setAttribute('font-style', fontStyle);
    }
    if (style.letterSpacing !== 0) {
      element.setAttribute('letter-spacing', svgNumber(style.letterSpacing));
    }
    applySVGPaint(element, style.fill, 'fill', ctx);
    if (style.lineWidth > 0) {
      applySVGPaint(element, style.stroke, 'stroke', ctx);
      element.setAttribute('stroke-width', svgNumber(style.lineWidth));
      if (style.strokeFirst) {
        element.setAttribute('paint-order', 'stroke');
      }
    }
  }

  /**
   * Serializes text laid along {@link textPath} as one `<text>` per unit, each
   * translated and rotated onto the curve. Mirrors {@link drawAlongPath} so the
   * vector output matches the rasterized placement glyph for glyph — a native
   * `<textPath>` can't, because a path forces a glyph's rotation to be the
   * curve's tangent, whereas the renderer rotates and offsets each unit
   * independently.
   */
  private toSVGAlongPath(profile: CurveProfile, ctx: SVGContext): SVGElement[] {
    const scale = this.pathScale();
    const arcLength = profile.arcLength * scale;
    if (arcLength <= 0 || profile.segments.length === 0) {
      return [];
    }

    const matrix = this.pathTransform();
    const textWidth = this.textLayout().width;
    const alignBase = this.pathAlignBase(arcLength, textWidth);
    const offset = this.pathOffset();
    const sample = createCurveSampler(profile);

    const align = this.pathAlign();
    const smoothAnchorAt =
      align === 'smooth'
        ? this.buildSmoothAnchor(profile, matrix, scale)
        : null;
    const staticAnchor = resolvePathAnchor(align);
    const metricsCache = new Map<string, {ascent: number; descent: number}>();
    const glyphBaseline = (style: FragmentStyle, anchor: number | null) => {
      if (anchor === null) return 0;
      let metrics = metricsCache.get(style.font);
      if (!metrics) {
        metrics = this.measureFontMetrics(style);
        metricsCache.set(style.font, metrics);
      }
      const {ascent, descent} = metrics;
      return (ascent - descent) / 2 - (anchor * (ascent + descent)) / 2;
    };

    const elements: SVGElement[] = [];
    for (const {unit, style} of this.walkUnits(this.pathSplit(), true)) {
      const center = unit.x + textWidth / 2 + alignBase + offset;
      if (center < 0 || center > arcLength) {
        continue;
      }
      const half = unit.width / 2;
      const dStart = clamp(0, arcLength, center - half);
      const dEnd = clamp(0, arcLength, center + half);

      const startSample = sample(dStart / scale);
      const midPoint = sample(center / scale);
      const endSample = sample(dEnd / scale);
      const startRaw = startSample.position.transformAsPoint(matrix);
      const midRaw = midPoint.position.transformAsPoint(matrix);
      const endRaw = endSample.position.transformAsPoint(matrix);

      const rawChord = endRaw.sub(startRaw);
      const rawLength = rawChord.magnitude;
      const up =
        rawLength > 0
          ? new Vector2(-rawChord.y / rawLength, rawChord.x / rawLength)
          : Vector2.zero;

      const offsetFor = (distance: number) =>
        glyphBaseline(
          style,
          smoothAnchorAt ? smoothAnchorAt(distance) : staticAnchor,
        );
      const startP = startRaw.add(up.scale(offsetFor(dStart)));
      const position = midRaw.add(up.scale(offsetFor(center)));
      const endP = endRaw.add(up.scale(offsetFor(dEnd)));

      const chord = endP.sub(startP);
      const angle =
        chord.magnitude > 0.001
          ? chord.radians
          : midPoint.normal.flipped.perpendicular.transform(matrix).radians;

      const glyphX = this.glyphPenOffset(unit, style);
      const element = this.svgText(unit.text, glyphX, 0, style, ctx);
      element.setAttribute(
        'transform',
        `translate(${svgNumber(position.x)} ${svgNumber(
          position.y,
        )}) rotate(${svgNumber((angle * 180) / Math.PI)})`,
      );
      elements.push(element);
    }

    return elements;
  }

  /**
   * Distance along the path where the run begins, derived from `textAlign` and
   * `textDirection` (mirroring {@link computeAlignOffset}). Justify is
   * unsupported on a path and falls back to the start edge.
   */
  private pathAlignBase(arcLength: number, textWidth: number): number {
    const rtl = this.textDirection() === 'rtl';
    const toEnd = arcLength - textWidth;
    switch (this.textAlign()) {
      case 'center':
        return toEnd / 2;
      case 'right':
        return toEnd;
      case 'left':
        return 0;
      case 'end':
        return rtl ? 0 : toEnd;
      case 'start':
        return rtl ? toEnd : 0;
      default:
        return rtl ? toEnd : 0;
    }
  }

  /**
   * Build the `pathAlign: 'smooth'` offset as a function of arc distance (in
   * local pixels): `0` at the path ends and the signed turn at each interior
   * vertex, interpolated linearly along every segment. The lerp keeps the lean
   * continuous, so glyphs ramp between sides instead of jumping at a corner.
   */
  private buildSmoothAnchor(
    profile: CurveProfile,
    matrix: DOMMatrix,
    scale: number,
  ): (distance: number) => number {
    const segments = profile.segments;
    const gain = this.pathSmoothness();
    const tangent = (segment: Segment, t: number) =>
      segment.getPoint(t).normal.flipped.perpendicular.transform(matrix);

    const distances = [0];
    const anchors = [0];
    let accumulated = 0;
    for (let i = 0; i < segments.length; i++) {
      if (i > 0) {
        const incoming = tangent(segments[i - 1], 1);
        const outgoing = tangent(segments[i], 0);
        const turn = Math.atan2(
          incoming.x * outgoing.y - incoming.y * outgoing.x,
          incoming.x * outgoing.x + incoming.y * outgoing.y,
        );
        distances.push(accumulated * scale);
        anchors.push(clamp(-1, 1, gain * turn));
      }
      accumulated += segments[i].arcLength;
    }
    distances.push(accumulated * scale);
    anchors.push(0);

    return distance => {
      for (let i = 1; i < distances.length; i++) {
        if (distance <= distances[i]) {
          const span = distances[i] - distances[i - 1] || 1;
          const t = clamp(0, 1, (distance - distances[i - 1]) / span);
          return anchors[i - 1] + (anchors[i] - anchors[i - 1]) * t;
        }
      }
      return anchors[anchors.length - 1];
    };
  }

  private drawAlongPath(
    context: CanvasRenderingContext2D,
    profile: CurveProfile,
  ) {
    const scale = this.pathScale();
    const arcLength = profile.arcLength * scale;
    if (arcLength <= 0 || profile.segments.length === 0) {
      return;
    }

    const matrix = this.pathTransform();
    const textWidth = this.textLayout().width;
    const alignBase = this.pathAlignBase(arcLength, textWidth);
    const offset = this.pathOffset();
    const sample = createCurveSampler(profile);

    // Cross-path anchor: -1 top, 0 middle, 1 bottom; null = alphabetic baseline.
    const align = this.pathAlign();
    const smoothAnchorAt =
      align === 'smooth'
        ? this.buildSmoothAnchor(profile, matrix, scale)
        : null;
    const staticAnchor = resolvePathAnchor(align);
    const metricsCache = new Map<string, {ascent: number; descent: number}>();
    const glyphBaseline = (style: FragmentStyle, anchor: number | null) => {
      if (anchor === null) return 0;
      let metrics = metricsCache.get(style.font);
      if (!metrics) {
        metrics = this.measureFontMetrics(style);
        metricsCache.set(style.font, metrics);
      }
      const {ascent, descent} = metrics;
      return (ascent - descent) / 2 - (anchor * (ascent + descent)) / 2;
    };

    context.save();
    this.applyStyle(context);
    this.applyText(context);
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';

    // `walkUnits` is cumulative, so `unit.x`/`unit.width` are kerned — arc
    // spacing follows the real layout, not a sum of isolated advances.
    for (const {unit, style} of this.walkUnits(this.pathSplit(), true)) {
      const center = unit.x + textWidth / 2 + alignBase + offset;
      // Clip overflow rather than letting the sampler clamp glyphs onto the ends.
      if (center < 0 || center > arcLength) {
        continue;
      }
      const half = unit.width / 2;
      const dStart = clamp(0, arcLength, center - half);
      const dEnd = clamp(0, arcLength, center + half);

      // Sample in increasing order so the forward-only cursor stays monotonic.
      const startSample = sample(dStart / scale);
      const midPoint = sample(center / scale);
      const endSample = sample(dEnd / scale);
      const startRaw = startSample.position.transformAsPoint(matrix);
      const midRaw = midPoint.position.transformAsPoint(matrix);
      const endRaw = endSample.position.transformAsPoint(matrix);

      // Displace along the raw chord's perpendicular: the chord stays
      // continuous across a sharp vertex (the tangent doesn't), so a glyph
      // sliding through a corner doesn't pop.
      const rawChord = endRaw.sub(startRaw);
      const rawLength = rawChord.magnitude;
      const up =
        rawLength > 0
          ? new Vector2(-rawChord.y / rawLength, rawChord.x / rawLength)
          : Vector2.zero;

      // Orient by the chord between the displaced points, so a ramping `smooth`
      // offset tilts glyphs to follow it (a constant offset stays parallel). The
      // offset rides the position, so the glyph paints at y = 0.
      const offsetFor = (distance: number) =>
        glyphBaseline(
          style,
          smoothAnchorAt ? smoothAnchorAt(distance) : staticAnchor,
        );
      const startP = startRaw.add(up.scale(offsetFor(dStart)));
      const position = midRaw.add(up.scale(offsetFor(center)));
      const endP = endRaw.add(up.scale(offsetFor(dEnd)));

      const chord = endP.sub(startP);
      const angle =
        chord.magnitude > 0.001
          ? chord.radians
          : midPoint.normal.flipped.perpendicular.transform(matrix).radians;

      context.save();
      context.translate(position.x, position.y);
      context.rotate(angle);
      context.font = style.font;
      if ('letterSpacing' in context) {
        context.letterSpacing = '0px';
      }
      context.fillStyle = resolveCanvasStyle(style.fill, context);
      context.strokeStyle = resolveCanvasStyle(style.stroke, context);
      context.lineWidth = style.lineWidth;

      // Kern-invariant pen (shared with split()) so spacing matches a plain Txt.
      const glyphX = this.glyphPenOffset(unit, style);
      if (style.lineWidth <= 0) {
        context.fillText(unit.text, glyphX, 0);
      } else if (style.strokeFirst) {
        context.strokeText(unit.text, glyphX, 0);
        context.fillText(unit.text, glyphX, 0);
      } else {
        context.fillText(unit.text, glyphX, 0);
        context.strokeText(unit.text, glyphX, 0);
      }
      context.restore();
    }

    context.restore();
  }

  protected override getCacheBBox(): BBox {
    const lineWidth = this.lineWidth();
    // We take the default value of the miterLimit as 10.
    const miterLimitCoefficient = this.lineJoin() === 'miter' ? 0.5 * 10 : 0.5;
    const stroke = lineWidth * miterLimitCoefficient;

    const pathBBox = this.pathBBox();
    if (pathBBox) {
      // Glyphs rotate with the path, so they overshoot the arc in any
      // direction; pad uniformly by a glyph's height plus the stroke.
      return pathBBox.expand(this.fontSize() + stroke);
    }

    // Pad vertically for glyphs that overshoot the line box.
    return BBox.fromSizeCentered(this.computedSize())
      .expand([0, this.fontSize() * 0.5])
      .expand(stroke);
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
   * Walk every line of the current layout, segmenting each line's text at the
   * requested granularity and pairing each unit with its run's style.
   *
   * @remarks
   * Backs {@link textWords}, {@link textGlyphs}, {@link textSentences}, and
   * {@link split}. Positions are in Txt-local center-origin coordinates.
   * `keepPunctuation` keeps non-word, non-whitespace segments (e.g. `'.'`) as
   * their own units under `'word'` granularity; the public accessors drop
   * them, but {@link split} keeps them so no ink is lost.
   */
  private walkUnits(
    granularity: SegmentGranularity,
    keepPunctuation: boolean,
  ): {unit: TextUnit; style: FragmentStyle}[] {
    const lines = this.positionedLines();
    const {x: blockWidth, y: blockHeight} = this.size();
    const result: {unit: TextUnit; style: FragmentStyle}[] = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const y = line.top - blockHeight / 2 + line.height / 2;
      let indexInLine = 0;

      // Measure cumulatively so kerning against the prefix is preserved.
      // `slack` is added per whitespace run (so sentences get it per gap).
      const emit = (
        text: string,
        style: FragmentStyle,
        startX: number,
        slack: number,
      ) => {
        let cursor = startX;
        let cumulativeText = '';
        let prevCum = 0;
        for (const seg of segment(text, granularity)) {
          cumulativeText += seg.segment;
          const cumWidth = this.measureStyledText(cumulativeText, style);
          const runs = slack > 0 ? (seg.segment.match(/\s+/g)?.length ?? 0) : 0;
          const advance = cumWidth - prevCum + slack * runs;
          prevCum = cumWidth;
          if (granularity === 'word' && !seg.isWordLike) {
            const whitespace = /^\s+$/.test(seg.segment);
            if (whitespace || !keepPunctuation) {
              cursor += advance;
              continue;
            }
          }
          if (seg.segment.length === 0) continue;
          result.push({
            unit: {
              text: seg.segment,
              x: cursor + advance / 2,
              y,
              width: advance,
              height: line.height,
              lineIndex: lineIdx,
              indexInLine: indexInLine++,
            },
            style,
          });
          cursor += advance;
        }
      };

      for (let f = 0; f < line.fragments.length; f++) {
        const fragment = line.fragments[f];
        if (fragment.inline) continue;
        const fragLeft = fragment.x + line.alignOffset - blockWidth / 2;
        const justified = line.justified?.[f];
        if (justified && line.extraPerSpace > 0 && granularity !== 'sentence') {
          // Match the word-by-word paint; a whole-fragment measure re-adds the
          // inter-word kerning the paint omits.
          let cursor = fragLeft;
          for (const seg of justified) {
            if (seg.whitespace) {
              cursor += seg.advance + line.extraPerSpace;
            } else {
              emit(seg.text, fragment.style, cursor, 0);
              cursor += seg.advance;
            }
          }
        } else {
          // Sentences span painted words, so measure cumulatively; justified
          // sentence units stay sub-pixel off from the word-by-word paint.
          emit(fragment.text, fragment.style, fragLeft, line.extraPerSpace);
        }
      }
    }

    return result;
  }

  private splitLayout(granularity: SegmentGranularity): TextUnit[] {
    if (this.positionedLines().length === 0) {
      // No real 2D canvas context (e.g. jsdom): widths fall back to zero so
      // callers can still inspect text and order.
      return this.fallbackSplit(granularity);
    }
    return this.walkUnits(granularity, false).map(entry => entry.unit);
  }

  /**
   * Cheap segment-only split used when a real layout is unavailable (jsdom or
   * other headless environments where pretext throws on canvas access).
   * Produces a single-line layout with zero widths; preserves text order.
   */
  private fallbackSplit(granularity: SegmentGranularity): TextUnit[] {
    const {items} = this.collectInlineItems();
    if (items.length === 0) return [];
    const joined = items.map(item => item.text).join('');
    const lh = this.resolvedLineHeight();
    const result: TextUnit[] = [];
    let indexInLine = 0;
    for (const seg of segment(joined, granularity)) {
      if (granularity === 'word' && seg.isWordLike === false) continue;
      if (seg.segment.length === 0) continue;
      result.push({
        text: seg.segment,
        x: 0,
        y: 0,
        width: 0,
        height: lh,
        lineIndex: 0,
        indexInLine: indexInLine++,
      });
    }
    return result;
  }

  /**
   * Word-level layout info. Each entry is one word with its center position
   * (Txt-local), width, and line index. Whitespace runs are skipped.
   *
   * @remarks
   * {@link textGlyphs} and {@link textSentences} mirror this at grapheme and
   * sentence granularity.
   *
   * @example
   * ```tsx
   * for (const word of label().textWords()) {
   *   view.add(<Circle position={label().position().add(word)} size={8} />);
   * }
   * ```
   */
  public textWords(): TextUnit[] {
    return this.pathProfile() ? [] : this.wordUnits();
  }

  /**
   * Grapheme-level layout info. One entry per Unicode grapheme cluster, with
   * its center position and width.
   *
   * @remarks
   * Operates at the grapheme level (via `Intl.Segmenter`), not at the
   * rendered-glyph level — rendered ligatures (e.g. `fi` shaped as one glyph)
   * still produce two entries.
   */
  public textGlyphs(): TextUnit[] {
    return this.pathProfile() ? [] : this.graphemeUnits();
  }

  /**
   * Sentence-level layout info. One entry per sentence span, in reading order.
   */
  public textSentences(): TextUnit[] {
    return this.pathProfile() ? [] : this.sentenceUnits();
  }

  /**
   * Explode this text into one standalone {@link Txt} per unit, each
   * positioned to reproduce the source render exactly so the pieces can be
   * animated independently.
   *
   * @remarks
   * Each piece is a center-anchored `Txt` in this node's local space carrying
   * its run's font and paint. Mount them under a node that shares this node's
   * transform, then hide the source:
   *
   * ```tsx
   * const pieces = label().split('word');
   * view.add(
   *   <Node
   *     position={label().position()}
   *     rotation={label().rotation()}
   *     scale={label().scale()}
   *   >
   *     {pieces}
   *   </Node>,
   * );
   * label().opacity(0);
   * ```
   *
   * Returns an empty array in headless environments without a 2D canvas (e.g.
   * jsdom). Caveats: grapheme splitting breaks ligature shaping; `'sentence'`
   * on justified lines is sub-pixel-approximate; per-node `filters`, `shadow*`,
   * and `cache` on the source are not transferred.
   *
   * @param granularity - `'grapheme'` (default), `'word'`, or `'sentence'`.
   */
  public split(granularity: SegmentGranularity = 'grapheme'): Txt[] {
    if (this.pathProfile() || this.positionedLines().length === 0) {
      return [];
    }
    return this.walkUnits(granularity, true).map(({unit, style}) =>
      this.createPiece(unit, style),
    );
  }

  /**
   * Offset from a unit's kerned center to where its glyph must be drawn so the
   * isolated render lands on the kern-invariant right edge (its kerned advance
   * minus its isolated advance, halved onto the center). Shared by {@link split}
   * and {@link drawAlongPath} so both place glyphs with the source's kerning.
   */
  private glyphPenOffset(unit: TextUnit, style: FragmentStyle): number {
    return unit.width / 2 - this.measureStyledText(unit.text, style);
  }

  private createPiece(unit: TextUnit, style: FragmentStyle): Txt {
    // Centering via the piece's own box keeps the center anchor (for
    // rotate/scale) while the pen pins the unit where the source drew it.
    const penLeft = unit.x + this.glyphPenOffset(unit, style);
    const top = unit.y - unit.height / 2;
    const piece = new Txt({
      text: unit.text,
      fontFamily: style.fontComponents.family,
      fontSize: style.fontComponents.size,
      fontStyle: style.fontComponents.style,
      fontWeight: style.fontComponents.weight,
      letterSpacing: style.letterSpacing,
      fill: style.fill,
      stroke: style.stroke,
      lineWidth: style.lineWidth,
      strokeFirst: style.strokeFirst,
      lineCap: this.lineCap(),
      lineJoin: this.lineJoin(),
      lineDash: this.lineDash(),
      lineDashOffset: this.lineDashOffset(),
      textDirection: this.textDirection(),
      textWrap: false,
      textAlign: 'left',
      lineHeight: unit.height,
    });
    const size = piece.size();
    piece.position([penLeft + size.x / 2, top + size.y / 2]);
    return piece;
  }

  @computed()
  private wordUnits(): TextUnit[] {
    return this.splitLayout('word');
  }

  @computed()
  private graphemeUnits(): TextUnit[] {
    return this.splitLayout('grapheme');
  }

  @computed()
  private sentenceUnits(): TextUnit[] {
    return this.splitLayout('sentence');
  }

  /**
   * Find the tightest container width that still fits all the text.
   *
   * @remarks
   * Uses Pretext's line-stats measurement without allocating fragment strings.
   *
   * @example
   * ```ts
   * label().width(label().shrinkWrapWidth());
   * ```
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
   *
   * @example
   * ```ts
   * label().width(label().balancedWidth(2));
   * ```
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
   *
   * @example
   * ```ts
   * label().fontSize(label().fitFontSize(400, 120));
   * ```
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
