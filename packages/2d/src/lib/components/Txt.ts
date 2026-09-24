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
  createSignal,
  isReactive,
  threadable,
  tween,
  unwrap,
  useLogger,
} from '@canvas-commons/core';
import {
  CurveProfile,
  createCurveSampler,
  isClosedProfile,
} from '../curves/CurveProfile';
import {getPathProfile} from '../curves/getPathProfile';
import {Segment} from '../curves/Segment';
import {computed, initial, nodeName, signal} from '../decorators';
import {CanvasStyle, Gradient, Pattern} from '../partials';
import type {TextExclusion, TextShapeExclusion} from '../partials/types';
import {useScene2D} from '../scenes/useScene2D';
import {
  ADVANCE_SCALE_ERROR,
  AdvanceMeasurer,
  BrokenParagraph,
  ContentRun,
  FIT_TOLERANCE,
  FontBox,
  OBJECT_MARKER,
  OverflowWrapMode,
  OwnerSpan,
  PaintCall,
  ParagraphContent,
  ParagraphCursor,
  ParagraphItems,
  ParagraphMetrics,
  ParagraphVerticalMetrics,
  PlacedLine,
  PlacedParagraph,
  PlacedPiece,
  ProbeVerdict,
  SOFT_HYPHEN,
  SegmentGranularity,
  TextDirection,
  WhiteSpaceMode,
  advanceBoundHolds,
  breakParagraph,
  breakParagraphOptimally,
  buildCanvasFontString,
  buildParagraphContent,
  canvasFontSize,
  canvasParagraphMeasurer,
  leastLineCount,
  measureMinContentWidth,
  paintAnchorOf,
  paintCalls,
  paintsText,
  paragraphFitMiss,
  paragraphInk,
  placeParagraph,
  prepareMixedParagraph,
  rangeExtentOf,
  readVerticalMetrics,
  resolveLineHeight,
  scaledParagraphReader,
  searchFitSize,
  segment,
  textLocaleVersion,
} from '../text';
import {fontsVersion, is, requestFontLoad, resolveCanvasStyle} from '../utils';
import {sharedMeasurementContext} from '../utils/measurement';
import {MeasureMode} from '../utils/yoga';
import {Circle} from './Circle';
import {ContentFloors} from './contentFloors';
import {Curve} from './Curve';
import {Layout} from './Layout';
import {Node} from './Node';
import {LayoutSettlers, SettledBoxes} from './settledLayout';
import {Shape, ShapeProps} from './Shape';
import {TxtLeaf} from './TxtLeaf';
import {ComponentChild, ComponentChildren} from './types';

type TxtChildren = string | Node | (string | Node)[];

export type TxtWrapMode = 'greedy' | 'knuth-plass';

export type {OverflowWrapMode};

/**
 * Function that splits a single word into syllable-like pieces. Pieces are
 * joined with U+00AD (soft hyphen), which the line breaker uses as optional
 * break points.
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
  'baseline' | 'top' | 'middle' | 'bottom' | 'smooth' | number;

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
  overflowWrap?: SignalValue<OverflowWrapMode>;
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

/** What a run measures with; no paint value may reach it. */
type RunTypeface = {
  font: string;
  fontComponents: FontComponents;
  letterSpacing: number;
};

type FragmentStyle = RunTypeface & {
  fill: CanvasStyle;
  stroke: CanvasStyle;
  lineWidth: number;
  strokeFirst: boolean;
  /** Opacity of the owning node relative to the root `Txt`. */
  opacity: number;
};

/**
 * A single styled slice of laid-out text on one line of a {@link Txt}.
 *
 * @remarks
 * `x` is the fragment's left edge in block space (`0` is the left edge of the
 * text block, before the `Txt`'s own anchor is applied). `style` mirrors the
 * owning `Txt` node's text properties at layout time.
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
   * present.
   */
  inlineWidth?: number;
};

/**
 * A single laid-out line of a {@link Txt} block.
 *
 * @remarks
 * `top` is the line box's top edge in block space (`0` is the top of the text
 * block). `height` is the line box height — the tallest line height the runs on
 * it ask for, grown by a taller inline element.
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

/** The endpoint layouts a stabilized text tween reads every frame. */
type TextTweenPlan = {
  from: LineBreakOffset[] | null;
  to: LineBreakOffset[] | null;
  fits: (line: string) => boolean;
  sizes: [Vector2, Vector2];
};

/** One paint of a unit: a range of one piece, under one owner. */
type UnitPart = {
  text: string;
  run: TxtRunStyle;
  /** Pen the part is painted from, relative to the unit's own center. */
  penOffset: number;
  /** Advance the part paints over, so a gap between parts is readable. */
  advance: number;
};

/** A unit of the placed layout, with every paint that covers it. */
type PlacedUnit = {
  unit: TextUnit;
  /** Baseline the unit sits on, in Txt-local coordinates. */
  baseline: number;
  /** Font box of the run the unit begins in, as the preparation read it. */
  box: FontBox;
  parts: UnitPart[];
};

/** A painted stretch of one line: part of one piece, under one owner. */
type PaintedSlice = {
  piece: PlacedPiece;
  span: TxtOwnerSpan;
  start: number;
  end: number;
};

/** A run's typeface and the node whose paint it takes, read at paint time. */
type TxtRunStyle = RunTypeface & {node: Txt};
type TxtRun = ContentRun<Layout | null, TxtRunStyle>;
type TxtOwnerSpan = OwnerSpan<Layout | null, TxtRunStyle>;

/** Everything one paragraph of text needs before a width is known. */
type OwnedParagraph = {
  content: ParagraphContent<Layout | null, TxtRunStyle>;
  items: ParagraphItems;
  metrics: readonly ParagraphMetrics[];
  vertical: ParagraphVerticalMetrics;
  /** Offsets a paint change begins at, which split a piece into paint calls. */
  seams: readonly number[];
  /** Breaks and placements of this paragraph, newest first. */
  broken: {key: unknown[]; broken: BrokenParagraph}[];
  placed: {
    key: unknown[];
    placed: PlacedParagraph;
    paint: PlannedPaint[] | null;
  }[];
};

/** A paint call, the owner span whose paint it takes, and its spacing. */
type PlannedPaint = {call: PaintCall; owner: number; letterSpacing: string};

/** An owner's paint as the canvas takes it: a colour is serialized once. */
type RunPaint = {
  fill: string | Gradient | Pattern;
  stroke: string | Gradient | Pattern;
  lineWidth: number;
  strokeFirst: boolean;
  opacity: number;
};

/** A paragraph autoSize prepared, and the fits read from it, newest first. */
type Preparation = {
  key: unknown[];
  paragraph: OwnedParagraph;
  fits: {key: unknown[]; size: number}[];
};

type PlaceRequest = {
  maxWidth: number;
  /** Whether the break pass may wrap, which a probe asks for on its own. */
  textWrap: boolean;
  blockWidth: number;
  blockHeight: number;
  textAlign: CanvasTextAlign | 'justify';
  direction: TextDirection;
  verticalAlign: 'top' | 'middle' | 'bottom';
};

type LineBreakOffset = {
  /**
   * Cut position in the text; content before it (including a terminating
   * hard break) belongs to the line the cut ends.
   */
  offset: number;
  /** True when the cut breaks a word at a soft hyphen and needs a visible '-'. */
  hyphen: boolean;
};

const LAYOUT_CACHE_SIZE = 6;

/**
 * Breaks an exclusion layout may take to agree with the box height it was
 * broken against; a layout that has not settled keeps the lowest box it saw.
 */
const EXCLUSION_HEIGHT_PASSES = 4;

/** Untyped callers pass values a `string` signal cannot hold. */
function textValue(value: string): string {
  return value === null || value === undefined ? '' : String(value);
}

/** The layout root whose yoga pass places `node`. */
function layoutRootOf(node: Layout): Layout {
  let root = node;
  while (!root.isLayoutRoot()) {
    const parent = root.findAncestor(is(Layout));
    if (parent === null) break;
    root = parent;
  }
  return root;
}

const NO_BOX = {left: 0, top: 0, width: 0, height: 0};

/**
 * Center-origin box of a node yoga places, and its position in its parent, as
 * its layout root's last finished pass left them. Reading them subscribes to
 * nothing, so a pass that is still computing can ask.
 */
function settledGeometry(node: Layout): {position: Vector2; size: Vector2} {
  const box = SettledBoxes.get(node) ?? NO_BOX;
  const ancestor = node.findAncestor(is(Layout));
  const parent = ancestor ? SettledBoxes.get(ancestor) : undefined;
  const anchor = node.anchor();
  return {
    size: new Vector2(box.width, box.height),
    position: new Vector2(
      box.left + (box.width / 2) * (1 + anchor.x) - (parent?.width ?? 0) / 2,
      box.top + (box.height / 2) * (1 + anchor.y) - (parent?.height ?? 0) / 2,
    ),
  };
}

/** {@link Layout.localToParent} of a node yoga places, from its settled box. */
function settledLocalToParent(node: Layout): DOMMatrix {
  const {position, size} = settledGeometry(node);
  const matrix = new DOMMatrix();
  matrix.translateSelf(position.x, position.y);
  matrix.rotateSelf(0, 0, node.rotation());
  matrix.scaleSelf(node.scale.x(), node.scale.y());
  matrix.skewXSelf(node.skew.x());
  matrix.skewYSelf(node.skew.y());
  const translate = node.translate();
  matrix.translateSelf(translate.x, translate.y);
  const anchor = size.mul(node.anchor()).scale(-0.5);
  matrix.translateSelf(anchor.x, anchor.y);
  return matrix;
}

/** Points of an ellipse inside a centered box, no more than 8px apart. */
function ellipseOutline(size: Vector2): Vector2[] {
  const steps = Math.max(8, Math.ceil((Math.PI * (size.x + size.y)) / 2 / 8));
  const points: Vector2[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    points.push(
      new Vector2(
        (Math.cos(angle) * size.x) / 2,
        (Math.sin(angle) * size.y) / 2,
      ),
    );
  }
  return points;
}

/** Nested nodes already warned that their sizing props do nothing. */
const WarnedSizing = new WeakSet<Txt>();

function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * A paragraph of text. A nested `Txt` is a span of its root's paragraph.
 *
 * @remarks
 * A nested `Txt` does not lay itself out, and ignores its `width`, `height`
 * and `padding`. Its `size()` is the extent of the pieces it owns in the
 * root's placement, from the first line's top to the last line's bottom, in
 * its own space, and its `cacheBBox()` is that box around its text. Its
 * `position()` is the offset its own `x` and `y` give from its parent's
 * center, as for any node outside a flex layout. Its text queries read the
 * root's placement: `textLines()` from the top left of its extent, and the
 * units of `textWords()` and `split()` in its own space.
 */
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
   * When `true`, the rendered font size is the largest whole pixel size at or
   * below `fontSize` whose layout fits the configured box. Requires both
   * `width` and `height` to resolve to concrete pixel numbers; falls back to
   * the raw `fontSize` otherwise.
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
   * - `'greedy'` (default) — first-fit, one line at a time. Fast.
   * - `'knuth-plass'` — dynamic-programming search for an optimal break
   *   sequence that minimizes a badness score (justification ratio, rivers,
   *   tight lines, soft-hyphen breaks). Each line is scored against the free
   *   segment its own {@link exclusions} bands leave.
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
   * What a word wider than the line may do, as CSS `overflow-wrap`.
   *
   * @remarks
   * - `'normal'` (default) — the word stays whole and overflows the box. A
   *   break the word offers of its own (a dash, a soft hyphen) is still taken.
   * - `'anywhere'` — the word breaks at a grapheme so the line fits.
   *
   * @example
   * ```tsx
   * <Txt width={80} overflowWrap={'anywhere'}>indistinguishable</Txt>
   * ```
   */
  @initial('normal')
  @signal()
  declare public readonly overflowWrap: SimpleSignal<OverflowWrapMode, this>;

  /**
   * Word-level hyphenator. Receives a single word and returns an array of
   * syllable-like pieces; pieces are rejoined with U+00AD (soft hyphen), which
   * the line breaker treats as optional break points.
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
   * Shapes that text should flow around (CSS `shape-outside`-style obstacles),
   * in Txt-local center-origin coordinates. A `node` exclusion reads its shape
   * from a live {@link Node} and follows that node's transform and size.
   *
   * @remarks
   * Each line is broken against the free segment its own line box leaves, so a
   * taller run or a tall inline element flows around the same shape correctly.
   * A flex layout may place the text, the node, or both: the layout repeats
   * its pass until the text agrees with the boxes it placed. A node the same
   * pass places blocks its box, or the ellipse in it for a full {@link Circle}.
   * When the text's size moves the node (a flex sibling after a text that
   * shrinks, a root that grows around its center), the passes may find no
   * such boxes; the layout then keeps the boxes that give the text the least
   * height, and of those the widest: the text flows around the node where
   * those boxes put it, and the node paints where the text's size then moves
   * it. A tween through such states can jitter, because each frame keeps the
   * best boxes its own passes reach. {@link autoSize} fits the text to the
   * boxes the layout keeps. A node this text's own flow places throws,
   * because its place needs the lines it would shape.
   *
   * @example
   * ```tsx
   * <Rect ref={badge} size={[200, 140]} position={[200, -70]} />
   * <Txt width={800} exclusions={[{kind: 'node', node: badge}]}>
   *   {paragraph}
   * </Txt>
   * ```
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
   * friends. On an open path, glyphs whose advance falls outside it are
   * clipped, not piled at the ends. On a closed path (start and end meet), the
   * text wraps around the loop. {@link pathOffset} slides the run along the
   * arc. `textAlign` anchors it. Reverse the path to flip the text onto the
   * other side (the tangent reverses, so glyphs read upside down along it).
   * Per-glyph rendering drops cross-glyph shaping — set {@link pathSplit} to
   * `word` for scripts that need it.
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
   * On a closed path the offset wraps around the loop.
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
      this.ownedLeaves = [leaf];
    } else {
      leaf.text(value);
      this.ownedLeaves = this.ownedLeaves.includes(leaf) ? [leaf] : [];
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

    const oldWrap = this.textWrap.context.raw();
    const desiredWidth = this.width.context.getter();
    const desiredMaxWidth = this.maxWidth.context.getter();
    const containerWidth =
      desiredWidth !== null && typeof desiredWidth !== 'number';
    let wrapWidth: number | null =
      typeof desiredWidth === 'number'
        ? desiredWidth
        : desiredWidth === null && typeof desiredMaxWidth === 'number'
          ? desiredMaxWidth
          : null;
    if (wrapWidth === null && containerWidth && this.textWrap() !== false) {
      const computedWidth = this.computedSize().x;
      if (Number.isFinite(computedWidth)) {
        // The +0.5 absorbs yoga's pixel rounding, mirroring effectiveMaxWidth.
        wrapWidth = computedWidth + 0.5;
      }
    }
    const keepWrap = this.textWrap() !== false && wrapWidth !== null;
    if (!keepWrap) {
      this.textWrap(false);
    }

    const oldText = leaf.text.context.raw();
    const fromText = leaf.text();
    const oldSizeRaw = this.size.context.raw();

    leaf.text(value);
    const toText = leaf.text();
    leaf.text(oldText ?? DEFAULT);

    // Both endpoint layouts are measured ahead, so the in-flight string can
    // reuse their line breaks instead of re-wrapping every frame. A path
    // never wraps, surrogate pairs would desync the code-unit offsets from
    // textLerp's code-point composition, and lineBreakOffsets bails on
    // layouts whose offsets cannot be mapped back to the raw text.
    const surrogates = /[\uD800-\uDFFF]/;
    const stable =
      keepWrap &&
      wrapWidth !== null &&
      !this.textPath() &&
      !surrogates.test(fromText) &&
      !surrogates.test(toText);

    /** Both endpoints, read at the metrics, box and fonts of right now. */
    const measurePlan = (): TextTweenPlan => {
      const saved = leaf.text.context.raw();
      const forced = this.forcedBreaksOnly();
      this.forcedBreaksOnly(false);
      this.size(oldSizeRaw);

      const measure = (text: string) => {
        leaf.text(text);
        return {
          breaks:
            stable && wrapWidth !== null
              ? this.lineBreakOffsets(text, wrapWidth)
              : null,
          size: new Vector2(this.size()),
        };
      };
      const from = measure(fromText);
      const to = measure(toText);
      const fits =
        from.breaks !== null && to.breaks !== null && wrapWidth !== null
          ? this.lineFitsSegment(wrapWidth)
          : () => true;

      leaf.text(saved ?? DEFAULT);
      this.forcedBreaksOnly(forced);
      // An endpoint with no text of its own keeps the box of the other one.
      if (from.size.y === 0) {
        from.size.y = to.size.y;
      } else if (to.size.y === 0) {
        to.size.y = from.size.y;
      }
      return {
        from: from.breaks,
        to: to.breaks,
        fits,
        sizes: [from.size, to.size],
      };
    };

    const planKey = () => [
      fontsVersion(),
      textLocaleVersion(),
      wrapWidth,
      this.canvasFont(),
      this.letterSpacing(),
      this.lineHeight(),
    ];
    let key = planKey();
    let plan = measurePlan();
    const stabilized = plan.from !== null && plan.to !== null;

    /** The plan of the current state, measured again when that state moves. */
    const currentPlan = (): TextTweenPlan => {
      const next = planKey();
      if (!sameKey(key, next)) {
        key = next;
        plan = measurePlan();
      }
      return plan;
    };

    let planDropped = false;
    /** Give up the measured breaks and the endpoint sizes. */
    const dropPlan = () => {
      if (planDropped) return;
      planDropped = true;
      this.forcedBreaksOnly(false);
      this.size(oldSizeRaw);
    };

    let interpolate: InterpolationFunction<string> = interpolationFunction;
    let lastRaw: string | null = null;
    if (stabilized) {
      interpolate = (from, to, t) => {
        const raw = interpolationFunction(from, to, t);
        lastRaw = raw;
        // A reactive tween target is re-resolved every frame; the measurements
        // above only describe the original endpoints, and the plan cannot be
        // picked back up once a change has dropped it.
        if (planDropped || from !== fromText || to !== toText) {
          dropPlan();
          return raw;
        }
        const live = currentPlan();
        if (live.from === null || live.to === null) return raw;
        return Txt.stabilizeBreaks(
          raw,
          from,
          to,
          live.from,
          live.to,
          live.fits,
        );
      };
    }

    this.lockLayout();
    if (stabilized) {
      this.forcedBreaksOnly(true);
    }

    let completed = false;
    try {
      yield* all(
        tween(time, t => {
          if (planDropped) return;
          const progress = timingFunction(t);
          const [from, to] = currentPlan().sizes;
          const size = Vector2.lerp(from, to, progress);
          // A wrapped percent width stays container-driven, so only the
          // height animates; otherwise the box lerps between text sizes.
          if (keepWrap && containerWidth) {
            this.height(size.y);
          } else {
            this.size(size);
          }
        }),
        leaf.text(value, time, timingFunction, interpolate),
      );

      this.children.context.setter(value);
      completed = true;
    } finally {
      // Don't leave tweens in a broken state
      if (!completed && lastRaw !== null) {
        leaf.text(lastRaw);
      }
      dropPlan();
      this.releaseLayout();
      this.textWrap(oldWrap ?? DEFAULT);
    }
  }

  protected getLayout(): boolean {
    return true;
  }

  /** Offset in the normalized paragraph text a break cursor points at. */
  private static cursorOffset(
    items: ParagraphItems,
    text: string,
    cursor: ParagraphCursor,
  ): number {
    if (cursor.segmentIndex >= items.kinds.length) return text.length;
    const start = items.sourceStarts[cursor.segmentIndex];
    if (cursor.graphemeIndex <= 0) return start;
    const inside = text.slice(start, items.sourceEnds[cursor.segmentIndex]);
    const boundaries = segment(inside, 'grapheme');
    return cursor.graphemeIndex >= boundaries.length
      ? items.sourceEnds[cursor.segmentIndex]
      : start + boundaries[cursor.graphemeIndex].index;
  }

  private lineBreakOffsets(
    source: string,
    maxWidth: number,
  ): LineBreakOffset[] | null {
    const paragraph = this.paragraph();
    if (!paragraph || paragraph.content.ownerSpans.length !== 1) return null;
    if (paragraph.content.objects.length > 0) return null;
    const text = paragraph.content.text;

    const hyphenated = this.hyphenate() !== null;
    if (hyphenated) {
      if (text.replaceAll(SOFT_HYPHEN, '') !== source) return null;
    } else if (text !== source) {
      return null;
    }

    const placed = this.naturalPlacement(maxWidth);
    if (!placed) return null;
    const breaks: LineBreakOffset[] = [];
    for (let i = 0; i < placed.lines.length - 1; i++) {
      const cursor = placed.lines[i].end;
      let offset = Txt.cursorOffset(paragraph.items, text, cursor);
      const hyphen =
        cursor.graphemeIndex === 0 &&
        cursor.segmentIndex > 0 &&
        paragraph.items.kinds[cursor.segmentIndex - 1] === 'soft-hyphen';
      if (hyphenated) {
        let shyCount = 0;
        for (let j = 0; j < offset; j++) {
          if (text[j] === SOFT_HYPHEN) shyCount++;
        }
        offset -= shyCount;
      }
      breaks.push({offset, hyphen});
    }
    return breaks;
  }

  /** Whether a placed line still fits the layout's free segment. */
  private lineFitsSegment(wrapWidth: number): (line: string) => boolean {
    const paragraph = this.paragraph();
    const metrics = paragraph?.metrics[0];
    if (!paragraph || !metrics) return () => true;

    const placed = this.naturalPlacement(wrapWidth);
    let available = wrapWidth;
    for (const line of placed?.lines ?? []) {
      const {left, right} = line.segment;
      if (Number.isFinite(right)) available = Math.min(available, right - left);
    }

    const run = Txt.ownerSpanAt(paragraph.content.ownerSpans, 0).paint;
    const measured = new Map<string, number>();
    return line => {
      const text = line.trimEnd();
      let width = measured.get(text);
      if (width === undefined) {
        width = this.paintedExtentOf(text, run, metrics);
        measured.set(text, width);
      }
      return width <= available + FIT_TOLERANCE;
    };
  }

  /** Right edge the paint calls of one unwrapped line reach. */
  private paintedExtentOf(
    text: string,
    run: TxtRunStyle,
    metrics: ParagraphMetrics,
  ): number {
    const content = buildParagraphContent(
      [{kind: 'text', owner: null, paint: run, metrics, text}],
      'pre-wrap',
    );
    const mixed = prepareMixedParagraph(
      content,
      {whiteSpace: 'pre-wrap', wordBreak: this.wordBreak(), metrics},
      canvasParagraphMeasurer,
    );
    const owned = mixed.preparations.map(one => one.metrics);
    const vertical = readVerticalMetrics(
      mixed.items,
      owned,
      this.lineHeight(),
      canvasParagraphMeasurer,
    );
    const placed = placeParagraph(
      mixed.items,
      breakParagraph(mixed.items, {
        maxWidth: Number.POSITIVE_INFINITY,
        textWrap: false,
        overflowWrap: this.overflowWrap(),
        exclusions: [],
        vertical,
        inkFit: true,
      }),
      {
        text: content.text,
        metrics: owned,
        vertical,
        textAlign: 'left',
        direction: 'ltr',
        verticalAlign: 'top',
        blockWidth: Number.POSITIVE_INFINITY,
        blockHeight: 0,
        measurer: canvasParagraphMeasurer,
      },
    );
    let right = 0;
    for (const call of paintCalls(mixed.items, placed, owned, [])) {
      right = Math.max(right, call.anchor.penX + call.anchor.advance);
    }
    return right;
  }

  private static commonPrefixLength(a: string, b: string): number {
    let length = 0;
    const max = Math.min(a.length, b.length);
    while (length < max && a[length] === b[length]) {
      length++;
    }
    return length;
  }

  /** The owner's last break at or before `offset`, or 0 when it has none. */
  private static lastBreakBefore(
    breaks: readonly LineBreakOffset[],
    offset: number,
  ): number {
    let last = 0;
    for (const brk of breaks) {
      if (brk.offset > offset) break;
      last = brk.offset;
    }
    return last;
  }

  /** The owner's first break after `start` and at or before `end`, if any. */
  private static firstBreakWithin(
    breaks: readonly LineBreakOffset[],
    start: number,
    end: number,
  ): LineBreakOffset | null {
    for (const brk of breaks) {
      if (brk.offset > start) {
        return brk.offset <= end ? brk : null;
      }
    }
    return null;
  }

  private static stabilizeBreaks(
    text: string,
    source: string,
    target: string,
    fromBreaks: LineBreakOffset[],
    toBreaks: LineBreakOffset[],
    fits: (line: string) => boolean,
  ): string {
    const length = text.length;
    const typedTo = Txt.commonPrefixLength(text, target);
    const typedFrom = Txt.commonPrefixLength(text, source);
    const headIsTarget = typedTo >= typedFrom;
    const headEnd = Math.min(headIsTarget ? typedTo : typedFrom, length);
    const headBreaks = headIsTarget ? toBreaks : fromBreaks;
    const tailBreaks = headIsTarget ? fromBreaks : toBreaks;
    const tailEnd = Math.min(
      Math.max(headEnd, headIsTarget ? source.length : target.length),
      length,
    );

    const pieces = [
      {breaks: headBreaks, start: 0, end: headEnd},
      {breaks: tailBreaks, start: headEnd, end: tailEnd},
      {breaks: headBreaks, start: tailEnd, end: length},
    ].filter(piece => piece.end > piece.start);

    const merged: LineBreakOffset[] = [];
    let lineStart = 0;
    pieces.forEach((piece, index) => {
      if (
        index > 0 &&
        Txt.lastBreakBefore(piece.breaks, piece.start) > lineStart
      ) {
        const lineBreak = Txt.firstBreakWithin(
          piece.breaks,
          piece.start,
          piece.end,
        );
        const joined =
          text.slice(lineStart, lineBreak?.offset ?? piece.end) +
          (lineBreak?.hyphen ? '-' : '');
        if (!fits(joined)) {
          merged.push({offset: piece.start, hyphen: false});
          lineStart = piece.start;
        }
      }
      for (const brk of piece.breaks) {
        if (brk.offset > piece.start && brk.offset <= piece.end) {
          merged.push(brk);
          lineStart = brk.offset;
        }
      }
    });

    let result = '';
    let prev = 0;
    for (const brk of merged) {
      if (brk.offset <= prev || brk.offset >= text.length) {
        continue;
      }
      const slice = text.slice(prev, brk.offset);
      result += brk.hyphen
        ? slice + '-\n'
        : slice.endsWith('\n')
          ? slice
          : slice + '\n';
      prev = brk.offset;
    }
    return result + text.slice(prev);
  }

  public constructor({children, text, ...props}: TxtProps) {
    super(props);
    if (text == null) {
      this.children(children);
    } else {
      this.text(text);
    }

    this.yogaNode.setMeasureFunc((width, widthMode) =>
      this.measureForYoga(width, widthMode),
    );
    this.measureFuncReady = true;
    ContentFloors.set(this, () => this.contentFloor());
    LayoutSettlers.set(this, {
      reads: () => this.exclusions().some(({kind}) => kind === 'node'),
      settle: () => this.settleExclusions(),
    });
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
    return false;
  }

  private lastMeasureKey: unknown[] | null = null;
  /** Exclusion key the last yoga measurement read, until it is settled. */
  private measuredExclusionKey: unknown[] | null = null;
  private measureFuncReady = false;

  @computed()
  protected override updateLayout() {
    super.updateLayout();
    // The root lays out a nested Txt's text.
    if (this.parentTxt()) return;
    // Yoga caches measure-func results until the node is marked dirty, so a
    // change to any measurement input has to bust the cache.
    const key = this.paragraphLayoutKey();
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
      text += textValue(child.text());
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
   * `width` and `height` — in which case it is {@link fitFontSize}.
   */
  @computed()
  public effectiveFontSize(): number {
    const box = this.fitBox();
    if (!box) return this.fontSize();
    this.readSettledPass();
    return this.fitFontSize(box.x, box.y);
  }

  /** The box {@link autoSize} fits the text to, or `null` when it does not. */
  private fitBox(): Vector2 | null {
    if (this.parentTxt() || this.pathProfile() || !this.autoSize()) return null;
    const width = this.width.context.getter();
    const height = this.height.context.getter();
    if (typeof width !== 'number' || typeof height !== 'number') return null;
    return new Vector2(width, height);
  }

  /** How much every font size of the tree is scaled by {@link autoSize}. */
  @computed()
  private effectiveScale(): number {
    return this.scaleOf(this.effectiveFontSize());
  }

  /** How much a root size of `size` scales every font size of the tree. */
  private scaleOf(size: number): number {
    const raw = this.fontSize();
    return raw > 0 ? size / raw : 1;
  }

  private static runStyleOf(owner: Txt, scale: number): TxtRunStyle {
    const fontComponents: FontComponents = {
      style: owner.fontStyle(),
      weight: owner.fontWeight(),
      size: owner.fontSize() * scale,
      family: owner.fontFamily(),
    };
    const font = buildCanvasFontString(
      fontComponents.style,
      fontComponents.weight,
      fontComponents.size,
      fontComponents.family,
    );
    requestFontLoad(font);
    return {
      node: owner,
      font,
      fontComponents,
      letterSpacing: owner.letterSpacing() * scale,
    };
  }

  /** Opacity of a run's owner relative to this one, which paints them all. */
  private relativeOpacity(owner: Txt): number {
    let value = 1;
    for (
      let node: Txt | null = owner;
      node !== null && node !== this;
      node = node.parentTxt()
    ) {
      value *= node.opacity();
    }
    return value;
  }

  /** The full style of a run: its typeface and its owner's paint. */
  private styleOf(run: TxtRunStyle): FragmentStyle {
    const {node} = run;
    return {
      font: run.font,
      fontComponents: run.fontComponents,
      letterSpacing: run.letterSpacing,
      fill: node.fill(),
      stroke: node.stroke(),
      lineWidth: node.lineWidth(),
      strokeFirst: node.strokeFirst(),
      opacity: this.relativeOpacity(node),
    };
  }

  /** Every styled run this block paints, in reading order. */
  private runsWithScale(scale: number): TxtRun[] {
    // Neither a finished web font load nor a locale change has a signal of
    // its own, and both change what this collects.
    fontsVersion();
    textLocaleVersion();
    const onPath = this.textPath() !== null;
    const runs: TxtRun[] = [];

    const collect = (node: Node, owner: Txt) => {
      if (node instanceof TxtLeaf) {
        const style = Txt.runStyleOf(owner, scale);
        const source = textValue(node.text());
        // A path forces a single line, so newlines collapse to spaces.
        const raw = onPath ? source.replace(/\n/g, ' ') : source;
        runs.push({
          kind: 'text',
          owner: null,
          paint: style,
          metrics: {font: style.font, letterSpacing: style.letterSpacing},
          text: raw,
        });
      } else if (node instanceof Txt && node !== this) {
        for (const child of node.children()) {
          collect(child, node);
        }
      } else if (node instanceof Layout) {
        const style = Txt.runStyleOf(owner, scale);
        runs.push({
          kind: 'object',
          owner: node,
          paint: style,
          metrics: {font: style.font, letterSpacing: style.letterSpacing},
          width: node.size.x(),
          height: node.size.y(),
        });
      }
    };

    for (const child of this.children()) {
      collect(child, this);
    }

    const hyphenate = this.hyphenate();
    return hyphenate ? Txt.hyphenateRuns(runs, hyphenate) : runs;
  }

  protected override collectAsyncResources() {
    super.collectAsyncResources();
    this.runsWithScale(this.effectiveScale());
  }

  /** Hyphenate whole words across runs, then split them back per run. */
  private static hyphenateRuns(
    runs: readonly TxtRun[],
    hyphenate: HyphenateFn,
  ): TxtRun[] {
    const texts = runs.map(run => (run.kind === 'text' ? run.text : ''));
    const joined = texts.join('');
    const ends: number[] = [];
    let at = 0;
    for (const text of texts) {
      at += text.length;
      ends.push(at);
    }

    const out = texts.map(() => '');
    let run = 0;
    let source = 0;
    const place = (character: string) => {
      while (run < ends.length - 1 && source >= ends[run]) run++;
      out[run] += character;
    };
    for (const seg of segment(joined, 'word')) {
      const parts = seg.isWordLike ? hyphenate(seg.segment) : [seg.segment];
      const written = parts.length <= 1 ? seg.segment : parts.join(SOFT_HYPHEN);
      for (const character of written) {
        if (character === SOFT_HYPHEN && joined[source] !== SOFT_HYPHEN) {
          place(character);
          continue;
        }
        place(character);
        source += character.length;
      }
    }

    return runs.map((one, index) =>
      one.kind === 'text' ? {...one, text: out[index]} : one,
    );
  }

  /** How whitespace and line breaks of the source text are treated. */
  private whiteSpaceMode(): WhiteSpaceMode {
    const wrap = this.textWrap();
    if (wrap === 'pre') return 'pre-wrap';
    return wrap === false ? 'normal' : 'pre-line';
  }

  private paragraphWithScale(scale: number): OwnedParagraph | null {
    if (!this.measurementContext()) return null;
    const runs = this.runsWithScale(scale);
    return runs.length === 0 ? null : this.paragraphOfRuns(runs);
  }

  private paragraphOfRuns(runs: readonly TxtRun[]): OwnedParagraph {
    const whiteSpace = this.whiteSpaceMode();
    const content = buildParagraphContent(runs, whiteSpace);
    const mixed = prepareMixedParagraph(
      content,
      {whiteSpace, wordBreak: this.wordBreak(), metrics: runs[0].metrics},
      canvasParagraphMeasurer,
    );
    const metrics = mixed.preparations.map(one => one.metrics);
    return {
      content,
      items: mixed.items,
      metrics,
      vertical: readVerticalMetrics(
        mixed.items,
        metrics,
        this.lineHeight(),
        canvasParagraphMeasurer,
      ),
      seams: Txt.paintSeams(content),
      broken: [],
      placed: [],
    };
  }

  /** Offsets where paint changes, snapped to grapheme boundaries. */
  private static paintSeams(
    content: ParagraphContent<Layout | null, TxtRunStyle>,
  ): number[] {
    if (content.ownerSpans.length < 2) return [];
    const boundaries = new Set(
      segment(content.text, 'grapheme').map(found => found.index),
    );
    boundaries.add(content.text.length);
    const seams: number[] = [];
    for (const span of content.ownerSpans.slice(1)) {
      let at = span.start;
      while (at < content.text.length && !boundaries.has(at)) at++;
      if (
        at > 0 &&
        at < content.text.length &&
        seams[seams.length - 1] !== at
      ) {
        seams.push(at);
      }
    }
    return seams;
  }

  /** The prepared paragraph of the current state, before a width is known. */
  @computed()
  private paragraph(): OwnedParagraph | null {
    const scale = this.effectiveScale();
    return this.fitBox()
      ? this.preparedWithScale(scale)
      : this.paragraphWithScale(scale);
  }

  /** {@link paragraph}, reading boxes settled so far during layout. */
  private passParagraph(): OwnedParagraph | null {
    const box = this.fitBox();
    if (!box || !this.readsSettledBoxes()) return this.paragraph();
    return this.preparedWithScale(this.scaleOf(this.fitFontSize(box.x, box.y)));
  }

  /** Min-content width: the widest unit the paragraph cannot break. */
  private contentFloorOf(textWrap: boolean): number {
    const paragraph = this.passParagraph();
    if (!paragraph) return 0;
    return measureMinContentWidth(paragraph.items, {
      textWrap,
      overflowWrap: this.overflowWrap(),
      inkFit: true,
    });
  }

  /** {@link contentFloorOf} for the wrapping this node really does. */
  @computed()
  private contentFloor(): number {
    return this.contentFloorOf(this.textWrap() !== false);
  }

  /** Every input a break and placement depend on. */
  @computed()
  private paragraphLayoutKey(): unknown[] {
    return [this.passParagraph(), ...this.layoutInputs()];
  }

  /** Every input of a break and a placement beside the paragraph and box. */
  private layoutInputs(): unknown[] {
    return [
      this.wrapMode(),
      this.overflowWrap(),
      this.textWrap(),
      this.textAlign(),
      this.textDirection(),
      this.verticalAlign(),
      ...this.exclusionKey(),
    ];
  }

  /** Why `node`'s shape can't be read yet, or `null` if it can. */
  private exclusionDependency(node: Node): string | null {
    for (
      let current: Node | null = node;
      current !== null && current !== this;
      current = current.parent()
    ) {
      if (
        current instanceof Layout &&
        !(current instanceof Txt) &&
        !(current instanceof TxtLeaf) &&
        current.parent() instanceof Txt &&
        isReactive(current.position.x.context.raw())
      ) {
        return (
          `${current.key} is placed by the text flow. Move ${current.key} ` +
          "out of the text's children"
        );
      }
    }
    return null;
  }

  /** Reject a `node` exclusion this node's own layout would produce. */
  private assertExclusionsIndependent(): void {
    const exclusions = this.exclusions();
    if (exclusions.length === 0) return;
    // Parsing the children is what binds an inline node to its slot.
    this.children();
    for (const exclusion of exclusions) {
      if (exclusion.kind !== 'node') continue;
      const reason = this.exclusionDependency(unwrap(exclusion.node));
      if (reason !== null) {
        throw new Error(
          `A node exclusion of ${this.key} cannot be resolved: ${reason}, ` +
            'or use a rect or polygon exclusion.',
        );
      }
    }
  }

  /** The exclusion set as plain values, for a memo key. */
  private exclusionKey(): unknown[] {
    const exclusions = this.readableExclusions();
    this.assertExclusionsIndependent();
    const key: unknown[] = [exclusions.length];
    for (const exclusion of exclusions) {
      key.push(
        exclusion.kind,
        exclusion.horizontalPadding ?? 0,
        exclusion.verticalPadding ?? 0,
      );
      if (exclusion.kind === 'rect') {
        key.push(exclusion.x, exclusion.y, exclusion.width, exclusion.height);
      } else if (exclusion.kind === 'polygon') {
        key.push(exclusion.points.length);
        for (const point of exclusion.points) key.push(point.x, point.y);
      } else {
        const node = unwrap(exclusion.node);
        const frame = this.relativeAnchorFrame(node);
        key.push(
          node,
          frame.a,
          frame.b,
          frame.c,
          frame.d,
          frame.e,
          frame.f,
          this.anchor.x(),
          this.anchor.y(),
          ...this.anchorShift(node, Vector2.zero),
        );
        for (const point of this.nodeOutline(node)) key.push(point.x, point.y);
      }
    }
    return key;
  }

  /** The exclusions a break reads now. */
  private readableExclusions(): readonly TextExclusion[] {
    const exclusions = this.exclusions();
    if (!this.placedBySameLayout(this) || SettledBoxes.has(this)) {
      return exclusions;
    }
    // Drop `node` exclusions until this layout's first pass settles a box.
    return exclusions.filter(({kind}) => kind !== 'node');
  }

  /** Run the layout pass that settles `node` exclusion boxes. */
  private readSettledPass(): void {
    if (this.readsSettledBoxes()) this.computedSize();
  }

  /** Whether a `node` exclusion reads the boxes of a pass that places this. */
  private readsSettledBoxes(): boolean {
    return (
      !this.isLayoutRoot() &&
      this.exclusions().some(({kind}) => kind === 'node')
    );
  }

  /** {@link Layout.localToParent} without the size-dependent anchor shift. */
  private anchorFreeLocalToParent(): DOMMatrix {
    const position = this.placedBySameLayout(this)
      ? settledGeometry(this).position
      : this.position();
    const matrix = new DOMMatrix();
    matrix.translateSelf(position.x, position.y);
    matrix.rotateSelf(0, 0, this.rotation());
    matrix.scaleSelf(this.scale.x(), this.scale.y());
    matrix.skewXSelf(this.skew.x());
    matrix.skewYSelf(this.skew.y());
    const translate = this.translate();
    if (!translate.exactlyEquals(Vector2.zero)) {
      matrix.translateSelf(translate.x, translate.y);
    }
    return matrix;
  }

  /** Whether `node` sits under this one in the scene graph. */
  private contains(node: Node): boolean {
    for (let current = node.parent(); current; current = current.parent()) {
      if (current === this) return true;
    }
    return false;
  }

  /** Whether `node` shares this pass; read its settled boxes, not signals. */
  private placedBySameLayout(node: Layout): boolean {
    return !node.isLayoutRoot() && layoutRootOf(node) === layoutRootOf(this);
  }

  private frameInParent(node: Node): DOMMatrix {
    return node instanceof Layout && this.placedBySameLayout(node)
      ? settledLocalToParent(node)
      : node.localToParent();
  }

  /** Compose the frames from `node` up to, but not including, `ancestor`. */
  private composeToAncestor(node: Node, ancestor: Node | null): DOMMatrix {
    let matrix = new DOMMatrix();
    let current: Node | null = node;
    while (current && current !== ancestor) {
      matrix = this.frameInParent(current).multiply(matrix);
      current = current.parent();
    }
    return matrix;
  }

  /** Map `node`-local coordinates into this node's anchor frame. */
  private relativeAnchorFrame(node: Node): DOMMatrix {
    if (this.contains(node)) return this.composeToAncestor(node, this);

    const ancestors = new Set<Node>([this]);
    for (let current = this.parent(); current; current = current.parent()) {
      ancestors.add(current);
    }
    let lca: Node | null = node;
    while (lca && !ancestors.has(lca)) lca = lca.parent();

    let txtToLca = this.anchorFreeLocalToParent();
    for (
      let current = this.parent();
      current && current !== lca;
      current = current.parent()
    ) {
      txtToLca = this.frameInParent(current).multiply(txtToLca);
    }

    return txtToLca.inverse().multiply(this.composeToAncestor(node, lca));
  }

  /** The outline a `node` exclusion blocks, in its own coordinates. */
  private nodeOutline(node: Node): Vector2[] {
    if (node instanceof Layout && this.placedBySameLayout(node)) {
      const {size} = settledGeometry(node);
      if (
        node instanceof Circle &&
        Math.abs(node.endAngle() - node.startAngle()) >= 360
      ) {
        return ellipseOutline(size);
      }
      return BBox.fromSizeCentered(size).corners;
    }
    if (node instanceof Curve) {
      const points: Vector2[] = [];
      node.profile().segments.forEach((segment, index) => {
        const steps = Math.max(1, Math.ceil(segment.arcLength / 8));
        for (let i = index === 0 ? 0 : 1; i <= steps; i++) {
          points.push(segment.getPoint(i / steps).position);
        }
      });
      return points;
    }
    return node.cacheBBox().corners;
  }

  /** Sample a `node` exclusion's outline into a block-space polygon. */
  private sampleNodeExclusion(node: Node, size: Vector2): Vector2[] {
    const frame = this.relativeAnchorFrame(node);
    return this.nodeOutline(node).map(point =>
      point.transformAsPoint(frame).add(this.anchorShift(node, size)),
    );
  }

  /** Anchor-free point to center-origin coordinates of a `size` block. */
  private anchorShift(node: Node, size: Vector2): Vector2 {
    if (this.contains(node)) return Vector2.zero;
    const anchor = this.anchor();
    if (!this.placedBySameLayout(this)) return anchor.mul(size).scale(0.5);
    const settled = settledGeometry(this).size;
    return settled.mul(anchor.add(Vector2.one)).sub(size).scale(0.5);
  }

  /** Exclusions converted into the block space the break pass reads. */
  private blockExclusions(
    exclusions: readonly TextExclusion[],
    size: Vector2,
  ): TextShapeExclusion[] {
    const half = size.scale(0.5);
    const toBlock = (point: Vector2) => point.add(half);
    const resolved: TextShapeExclusion[] = [];

    for (const exclusion of exclusions) {
      const padding = {
        horizontalPadding: exclusion.horizontalPadding,
        verticalPadding: exclusion.verticalPadding,
      };
      if (exclusion.kind === 'rect') {
        const topLeft = toBlock(
          new Vector2(
            exclusion.x - exclusion.width / 2,
            exclusion.y - exclusion.height / 2,
          ),
        );
        resolved.push({
          kind: 'rect',
          x: topLeft.x,
          y: topLeft.y,
          width: exclusion.width,
          height: exclusion.height,
          ...padding,
        });
        continue;
      }
      const points =
        exclusion.kind === 'polygon'
          ? exclusion.points.map(point => new Vector2(point))
          : this.sampleNodeExclusion(unwrap(exclusion.node), size);
      if (points.length === 0) continue;
      resolved.push({kind: 'polygon', points: points.map(toBlock), ...padding});
    }

    return resolved;
  }

  /** Break the paragraph at `maxWidth`, memoized on its inputs. */
  private breakAt(
    paragraph: OwnedParagraph,
    maxWidth: number,
    textWrap = this.textWrap() !== false,
  ): BrokenParagraph {
    const exclusions = this.readableExclusions();
    const key: unknown[] = [
      maxWidth,
      textWrap,
      this.wrapMode(),
      this.overflowWrap(),
      this.textAlign() === 'justify',
      ...this.exclusionKey(),
    ];
    const converge = exclusions.length > 0 && Number.isFinite(maxWidth);
    if (converge) {
      key.push(
        this.height.context.getter(),
        this.minHeight.context.getter(),
        this.maxHeight.context.getter(),
      );
    }
    for (const found of paragraph.broken) {
      if (sameKey(found.key, key)) return found.broken;
    }

    const broken = converge
      ? this.breakConverged(paragraph, maxWidth, exclusions, textWrap)
      : this.breakAround(paragraph, maxWidth, [], textWrap);
    paragraph.broken.unshift({key, broken});
    paragraph.broken.length = Math.min(
      paragraph.broken.length,
      LAYOUT_CACHE_SIZE,
    );
    return broken;
  }

  private breakAround(
    paragraph: OwnedParagraph,
    maxWidth: number,
    exclusions: readonly TextShapeExclusion[],
    textWrap: boolean,
  ): BrokenParagraph {
    const overflowWrap = this.overflowWrap();
    if (this.wrapMode() === 'knuth-plass' && Number.isFinite(maxWidth)) {
      return breakParagraphOptimally(paragraph.items, {
        maxWidth,
        textWrap,
        overflowWrap,
        justify: this.textAlign() === 'justify',
        exclusions,
        vertical: paragraph.vertical,
        inkFit: true,
      });
    }
    return breakParagraph(paragraph.items, {
      maxWidth,
      textWrap,
      overflowWrap,
      exclusions,
      vertical: paragraph.vertical,
      inkFit: true,
    });
  }

  /** Break against exclusions placed on this node's own box. */
  private breakConverged(
    paragraph: OwnedParagraph,
    maxWidth: number,
    exclusions: readonly TextExclusion[],
    textWrap: boolean,
  ): BrokenParagraph {
    const declaredHeight = this.height.context.getter();
    const declaredMin = this.minHeight.context.getter();
    const declaredMax = this.maxHeight.context.getter();

    const attempt = (at: number) =>
      this.breakAround(
        paragraph,
        maxWidth,
        this.blockExclusions(exclusions, new Vector2(maxWidth, at)),
        textWrap,
      );

    if (typeof declaredHeight === 'number') {
      return attempt(declaredHeight);
    }

    const bound = (at: number) =>
      clamp(
        typeof declaredMin === 'number' ? declaredMin : -Infinity,
        typeof declaredMax === 'number' ? declaredMax : Infinity,
        at,
      );

    let height = bound(paragraph.vertical.lineHeight);
    let broken = attempt(height);
    if (broken.lines.length === 0) return broken;
    let best = broken;
    let bestHeight = Math.max(height, broken.height);
    // Repeat until the box height and the broken content agree, since an
    // auto-height box takes its height from the very content broken against it.
    for (let pass = 1; pass < EXCLUSION_HEIGHT_PASSES; pass++) {
      if (broken.height <= height + 0.5) return {...broken, height};
      height = bound(broken.height);
      broken = attempt(height);
      if (Math.max(height, broken.height) < bestHeight) {
        bestHeight = Math.max(height, broken.height);
        best = broken;
      }
    }
    return broken.height <= height + 0.5
      ? {...broken, height}
      : {...best, height: bestHeight};
  }

  /** The edge an alignment really picks, once the direction resolves it. */
  private static resolvedAlign(
    align: CanvasTextAlign | 'justify',
    direction: TextDirection,
  ): string {
    if (align === 'start') return direction === 'rtl' ? 'right' : 'left';
    if (align === 'end') return direction === 'rtl' ? 'left' : 'right';
    return align;
  }

  private placeWith(
    paragraph: OwnedParagraph | null,
    request: PlaceRequest,
  ): PlacedParagraph | null {
    if (!paragraph) return null;

    const broken = this.breakAt(paragraph, request.maxWidth, request.textWrap);
    const aligned = Txt.resolvedAlign(request.textAlign, request.direction);
    // A leading-edge line ignores the block width, and a top-aligned block
    // ignores its height, so the node size and the paint share one placement.
    const key: unknown[] = [
      broken,
      aligned === 'left' ? 0 : request.blockWidth,
      request.verticalAlign === 'top' ? 0 : request.blockHeight,
      aligned,
      request.direction,
      request.verticalAlign,
    ];
    for (const found of paragraph.placed) {
      if (sameKey(found.key, key)) return found.placed;
    }

    const placed = placeParagraph(paragraph.items, broken, {
      text: paragraph.content.text,
      metrics: paragraph.metrics,
      vertical: paragraph.vertical,
      textAlign: request.textAlign,
      direction: request.direction,
      verticalAlign: request.verticalAlign,
      blockWidth: request.blockWidth,
      blockHeight: request.blockHeight,
      measurer: canvasParagraphMeasurer,
    });
    paragraph.placed.unshift({key, placed, paint: null});
    paragraph.placed.length = Math.min(
      paragraph.placed.length,
      LAYOUT_CACHE_SIZE,
    );
    return placed;
  }

  /** The layout at its natural size, with no alignment applied. */
  private naturalPlacement(
    maxWidth: number,
    textWrap = this.textWrap() !== false,
  ): PlacedParagraph | null {
    this.readSettledPass();
    return this.placeNaturally(maxWidth, textWrap);
  }

  /** {@link naturalPlacement} inside the layout pass, which settles nothing. */
  private placeNaturally(
    maxWidth: number,
    textWrap: boolean,
  ): PlacedParagraph | null {
    return this.placeWith(this.passParagraph(), {
      maxWidth,
      textWrap,
      blockWidth: Number.POSITIVE_INFINITY,
      blockHeight: 0,
      textAlign: 'left',
      direction: 'ltr',
      verticalAlign: 'top',
    });
  }

  private textDirectionValue(): TextDirection {
    return this.textDirection() === 'rtl' ? 'rtl' : 'ltr';
  }

  /**
   * The layout with alignment resolved against the node's own box. Paint,
   * queries, `split` and inline children all read this.
   */
  @computed()
  private placement(): PlacedParagraph | null {
    const {x: blockWidth, y: blockHeight} = this.size();
    return this.placeWith(this.paragraph(), {
      maxWidth: this.effectiveMaxWidth(),
      textWrap: this.textWrap() !== false,
      blockWidth,
      blockHeight,
      textAlign: this.textAlign(),
      direction: this.textDirectionValue(),
      verticalAlign: this.verticalAlign(),
    });
  }

  protected positionedLines(): readonly PlacedLine[] {
    return this.placement()?.lines ?? [];
  }

  /** The shared measurement context, or `null` when unavailable. */
  private measurementContext(): CanvasRenderingContext2D | null {
    // Single availability gate: callers branch on this instead of
    // swallowing errors, so a real measurement bug still throws.
    return sharedMeasurementContext();
  }

  private static readonly emptyLayout: TextLayoutResult = {
    lines: [],
    width: 0,
    height: 0,
    lineHeight: 0,
  };

  /** The ink a paint call carries. */
  private static paintOwnerOf(
    paragraph: OwnedParagraph,
    text: string,
    start: number,
  ): number {
    const spans = paragraph.content.ownerSpans;
    // Whitespace has no ink of its own; it takes the ink of the run ahead.
    const at = text.trim() === '' ? start + text.length : start;
    return Txt.ownerIndexAt(spans, Math.min(at, spans[spans.length - 1].start));
  }

  /** Style a fragment carries: {@link paintOwnerOf}'s ink plus its font. */
  private fragmentStyleOf(
    paragraph: OwnedParagraph,
    text: string,
    start: number,
  ): FragmentStyle {
    const spans = paragraph.content.ownerSpans;
    const ink = this.styleOf(
      spans[Txt.paintOwnerOf(paragraph, text, start)].paint,
    );
    const own = Txt.ownerSpanAt(spans, start).paint;
    return {
      ...ink,
      font: own.font,
      fontComponents: own.fontComponents,
      letterSpacing: own.letterSpacing,
    };
  }

  /** The owner span that paints the character at `offset`. */
  private static ownerSpanAt(
    spans: readonly TxtOwnerSpan[],
    offset: number,
  ): TxtOwnerSpan {
    return spans[Txt.ownerIndexAt(spans, offset)];
  }

  private static ownerIndexAt(
    spans: readonly TxtOwnerSpan[],
    offset: number,
  ): number {
    let lo = 0;
    let hi = spans.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (spans[mid].start <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /** Every painted stretch of one line, cut at pieces and paint seams. */
  private static paintedSlices(
    paragraph: OwnedParagraph,
    piece: PlacedPiece,
  ): PaintedSlice[] {
    if (!paintsText(paragraph.items, piece)) return [];
    const slices: PaintedSlice[] = [];
    let from = piece.sourceStart;
    const cuts = [
      ...paragraph.seams.filter(at => at > from && at < piece.sourceEnd),
      piece.sourceEnd,
    ];
    for (const to of cuts) {
      slices.push({
        piece,
        span: Txt.ownerSpanAt(paragraph.content.ownerSpans, from),
        start: from,
        end: to,
      });
      from = to;
    }
    return slices;
  }

  /** Font box the preparation read for the run a placed piece belongs to. */
  private static fontBoxOf(
    paragraph: OwnedParagraph,
    piece: PlacedPiece,
  ): FontBox {
    return {
      ascent: paragraph.vertical.ascents[piece.item],
      descent: paragraph.vertical.descents[piece.item],
    };
  }

  /** One fragment per owner span of a placed line, as the line reads. */
  private fragmentsOf(
    paragraph: OwnedParagraph,
    line: PlacedLine,
  ): StyledFragment[] {
    const {text, ownerSpans} = paragraph.content;
    const fragments: StyledFragment[] = [];
    let open: {
      span: TxtOwnerSpan;
      start: number;
      text: string;
      x: number;
    } | null = null;
    const flush = () => {
      if (!open) return;
      fragments.push({
        text: open.text,
        x: open.x,
        style: this.fragmentStyleOf(paragraph, open.text, open.start),
      });
      open = null;
    };

    for (const piece of line.pieces) {
      if (paragraph.items.kinds[piece.item] === 'inline-box') {
        flush();
        const span = Txt.ownerSpanAt(ownerSpans, piece.sourceStart);
        if (!this.ownsSpan(span)) continue;
        fragments.push({
          text: '',
          x: piece.x,
          style: this.styleOf(span.paint),
          inline: span.owner ?? undefined,
          inlineWidth: piece.advance,
        });
        continue;
      }
      for (const slice of Txt.paintedSlices(paragraph, piece)) {
        if (!this.ownsSpan(slice.span)) continue;
        const x = paintAnchorOf(piece, slice.start, slice.end).penX;
        if (open && open.span === slice.span) {
          open.text += text.slice(slice.start, slice.end);
          open.x = Math.min(open.x, x);
          continue;
        }
        flush();
        open = {
          span: slice.span,
          start: slice.start,
          text: text.slice(slice.start, slice.end),
          x,
        };
      }
      const hyphenSpan = Txt.ownerSpanAt(
        ownerSpans,
        Math.max(piece.sourceStart - 1, 0),
      );
      if (piece.hyphen > 0 && this.ownsSpan(hyphenSpan)) {
        flush();
        fragments.push({
          text: '-',
          x: piece.hyphenX,
          style: this.styleOf(hyphenSpan.paint),
        });
      }
    }
    flush();
    return fragments;
  }

  private layoutResultOf(placed: PlacedParagraph): TextLayoutResult {
    const paragraph = this.paragraph();
    if (!paragraph) return Txt.emptyLayout;
    return {
      lines: placed.lines.map(line => ({
        fragments: this.fragmentsOf(paragraph, line),
        top: line.top,
        height: line.height,
      })),
      width: placed.width,
      height: placed.height,
      lineHeight: paragraph.vertical.lineHeight,
    };
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

  /** Set in a stabilized tween so a materialized hyphen is not re-broken. */
  private readonly forcedBreaksOnly = createSignal(false);

  /**
   * Effective wrap constraint when no explicit yoga measurement is in play
   * (e.g. for `draw()` and `textLines()`).
   */
  @computed()
  protected effectiveMaxWidth(): number {
    if (this.pathProfile() || this.textWrap() === false) {
      return Number.POSITIVE_INFINITY;
    }
    // Exclusions still need the finite width: their per-band x offsets are
    // carved from it, so forced-break layouts keep flowing around them.
    if (this.forcedBreaksOnly() && this.exclusions().length === 0) {
      return Number.POSITIVE_INFINITY;
    }
    const desiredWidth = this.width.context.getter();
    if (typeof desiredWidth === 'number') {
      return desiredWidth;
    }
    // Flex/percent Txts have no numeric width; wrap at the yoga-resolved one.
    // The +0.5 absorbs yoga's pixel rounding, which would otherwise re-wrap.
    const computedWidth = this.computedSize().x;
    return Number.isFinite(computedWidth)
      ? computedWidth + 0.5
      : Number.POSITIVE_INFINITY;
  }

  @computed()
  protected textLayout(): TextLayoutResult {
    if (this.parentTxt()) return this.ownedLayout();
    const placed = this.naturalPlacement(this.effectiveMaxWidth());
    return placed ? this.layoutResultOf(placed) : Txt.emptyLayout;
  }

  private measureForYoga(
    width: number,
    widthMode: number,
  ): {width: number; height: number} {
    if (this.parentTxt()) return {width: 0, height: 0};
    const pathBBox = this.pathBBox();
    if (pathBBox) {
      return {width: pathBBox.width, height: pathBBox.height};
    }
    const maxWidth =
      widthMode === MeasureMode.Undefined ? Number.POSITIVE_INFINITY : width;
    const effectiveMax =
      this.textWrap() === false ? Number.POSITIVE_INFINITY : maxWidth;
    const placed = this.placeNaturally(effectiveMax, this.textWrap() !== false);
    this.measuredExclusionKey = this.exclusionKey();
    if (!placed) return {width: 0, height: 0};
    const measured = widthMode === MeasureMode.Exactly ? width : placed.width;
    return {width: measured, height: placed.height};
  }

  /** Mark this node dirty when its exclusion geometry has moved. */
  private settleExclusions(): boolean {
    const measured = this.measuredExclusionKey;
    if (measured === null || sameKey(measured, this.exclusionKey())) {
      return false;
    }
    this.measuredExclusionKey = null;
    this.yogaNode.markDirty();
    return true;
  }

  private ownedLeaves: TxtLeaf[] = [];

  // Exclude explicit children so one leaf cannot occupy two slots.
  private reusableLeaves(array: ComponentChild[]): TxtLeaf[] {
    const explicit = new Set<Node>(
      array.filter((child): child is Node => child instanceof Node),
    );
    const scene = useScene2D();
    return this.ownedLeaves.filter(
      leaf =>
        this.realChildren.includes(leaf) &&
        !explicit.has(leaf) &&
        scene.getNode(leaf.key) === leaf,
    );
  }

  /** Raw reads keep the leaf out of the dependencies of reactive children. */
  private static leafFor(
    reusable: TxtLeaf[],
    index: number,
    text: string,
  ): TxtLeaf {
    const leaf = reusable[index];
    if (!leaf) {
      return new TxtLeaf({text});
    }
    if (leaf.text.context.raw() !== text) {
      leaf.text(text);
    }
    return leaf;
  }

  protected override parseChildren(children: ComponentChildren): Node[] {
    const result: Node[] = [];
    const array = Array.isArray(children) ? children : [children];
    // Only a string child needs a leaf, and only a leaf needs the scene.
    const reusable = array.some(child => typeof child === 'string')
      ? this.reusableLeaves(array)
      : [];
    const usedLeaves: TxtLeaf[] = [];
    for (const child of array) {
      if (child instanceof Txt || child instanceof TxtLeaf) {
        result.push(child);
      } else if (child instanceof Layout) {
        // Bind position to the text slot; an explicit position() later opts
        // the child out of the flow.
        child.position(() => this.inlinePositionOf(child));
        result.push(child);
      } else if (typeof child === 'string') {
        const leaf = Txt.leafFor(reusable, usedLeaves.length, child);
        usedLeaves.push(leaf);
        result.push(leaf);
      }
    }

    this.ownedLeaves = usedLeaves;
    return result;
  }

  @computed()
  protected rootTxt(): Txt {
    return this.parentTxt()?.rootTxt() ?? this;
  }

  /** Position of an inline child, from its laid-out slot in the root. */
  protected inlinePositionOf(child: Layout): Vector2 {
    const root = this.rootTxt();
    const paragraph = root.paragraph();
    if (!paragraph) return Vector2.zero;
    const object = paragraph.content.objects.find(one => one.owner === child);
    if (!object) return Vector2.zero;

    const {x: width, y: height} = root.size();
    for (const line of root.positionedLines()) {
      for (const piece of line.pieces) {
        if (piece.sourceStart !== object.at) continue;
        return new Vector2(
          width / -2 + piece.center,
          height / -2 + line.middle,
        );
      }
    }
    return Vector2.zero;
  }

  /**
   * Every draw the placed layout makes, kept with its placement. A paint-only
   * change re-reads the styles and leaves this list alone.
   */
  @computed()
  private paintPlan(): PlannedPaint[] {
    const paragraph = this.paragraph();
    const placed = this.placement();
    if (!paragraph || !placed) return [];
    const build = () =>
      paintCalls(
        paragraph.items,
        placed,
        paragraph.metrics,
        paragraph.seams,
      ).map(call => ({
        call,
        owner: Txt.paintOwnerOf(paragraph, call.anchor.text, call.start),
        letterSpacing: `${call.anchor.metrics.letterSpacing}px`,
      }));
    const entry = paragraph.placed.find(one => one.placed === placed);
    if (!entry) return build();
    entry.paint ??= build();
    return entry.paint;
  }

  /** The paint of every owner span, indexed as the paint plan reads it. */
  @computed()
  private runPaints(): RunPaint[] {
    const spans = this.paragraph()?.content.ownerSpans ?? [];
    return spans.map(({paint: {node}}) => ({
      fill: Txt.inkOf(node.fill()),
      stroke: Txt.inkOf(node.stroke()),
      lineWidth: node.lineWidth(),
      strokeFirst: node.strokeFirst(),
      opacity: this.relativeOpacity(node),
    }));
  }

  private static inkOf(style: CanvasStyle): string | Gradient | Pattern {
    if (style instanceof Gradient || style instanceof Pattern) return style;
    return style === null ? '' : style.serialize();
  }

  protected override applyText(context: CanvasRenderingContext2D) {
    super.applyText(context);
    context.textAlign = 'left';
  }

  protected override draw(context: CanvasRenderingContext2D) {
    if (this.parentTxt()) {
      // The root Txt paints all text; a nested Txt only renders its own
      // inline children (positioned reactively off the root's layout).
      this.drawChildren(context);
      return;
    }

    this.assertExclusionsIndependent();
    this.requestFontUpdate();
    const profile = this.pathProfile();
    if (profile) {
      this.drawAlongPath(context, profile);
      this.drawChildren(context);
      return;
    }

    const plan = this.paintPlan();
    if (plan.length === 0) {
      this.drawChildren(context);
      return;
    }
    const paints = this.runPaints();

    const {width, height} = this.size();
    const originX = width / -2;
    const originY = height / -2;

    context.save();
    this.applyStyle(context);
    this.applyText(context);
    context.textBaseline = 'alphabetic';
    const alpha = context.globalAlpha;
    const resolve = (ink: string | Gradient | Pattern) =>
      typeof ink === 'string' ? ink : resolveCanvasStyle(ink, context);
    // A canvas parses a font or a colour on each set, so an unchanged value
    // is not set again.
    let font: string | null = null;
    let spacing: string | null = null;
    let opacity: number | null = null;
    let fill: ReturnType<typeof resolve> | null = null;
    let stroke: ReturnType<typeof resolve> | null = null;
    let lineWidth: number | null = null;

    for (const {call, owner, letterSpacing} of plan) {
      const style = paints[owner];
      const x = originX + call.anchor.penX;
      const y = originY + call.line.baseline;

      if (font !== call.anchor.metrics.font) {
        font = call.anchor.metrics.font;
        context.font = font;
      }
      if (spacing !== letterSpacing) {
        spacing = letterSpacing;
        context.letterSpacing = spacing;
      }
      if (opacity !== style.opacity) {
        opacity = style.opacity;
        context.globalAlpha = alpha * opacity;
      }
      const nextFill = resolve(style.fill);
      if (fill !== nextFill) {
        fill = nextFill;
        context.fillStyle = fill;
      }
      const nextStroke = resolve(style.stroke);
      if (stroke !== nextStroke) {
        stroke = nextStroke;
        context.strokeStyle = stroke;
      }
      if (lineWidth !== style.lineWidth) {
        lineWidth = style.lineWidth;
        context.lineWidth = lineWidth;
      }

      if (style.lineWidth <= 0) {
        context.fillText(call.anchor.text, x, y);
      } else if (style.strokeFirst) {
        context.strokeText(call.anchor.text, x, y);
        context.fillText(call.anchor.text, x, y);
      } else {
        context.fillText(call.anchor.text, x, y);
        context.strokeText(call.anchor.text, x, y);
      }
    }

    context.restore();
    this.drawChildren(context);
  }

  /** Distance along the path where the run begins. */
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
        // Justify is unsupported on a path and falls back to start.
        return rtl ? toEnd : 0;
    }
  }

  /** Build the `pathAlign: 'smooth'` offset by arc distance. */
  private buildSmoothAnchor(
    profile: CurveProfile,
    matrix: DOMMatrix,
    scale: number,
  ): (distance: number) => number {
    const segments = profile.segments;
    const gain = this.pathSmoothness();
    const tangent = (segment: Segment, t: number) =>
      segment.getPoint(t).normal.flipped.perpendicular.transform(matrix);
    const turnBetween = (incoming: Vector2, outgoing: Vector2) =>
      clamp(
        -1,
        1,
        gain *
          Math.atan2(
            incoming.x * outgoing.y - incoming.y * outgoing.x,
            incoming.x * outgoing.x + incoming.y * outgoing.y,
          ),
      );

    const endAnchor = isClosedProfile(profile)
      ? turnBetween(
          tangent(segments[segments.length - 1], 1),
          tangent(segments[0], 0),
        )
      : 0;

    const distances = [0];
    const anchors = [endAnchor];
    let accumulated = 0;
    for (let i = 0; i < segments.length; i++) {
      if (i > 0) {
        const incoming = tangent(segments[i - 1], 1);
        const outgoing = tangent(segments[i], 0);
        distances.push(accumulated * scale);
        anchors.push(turnBetween(incoming, outgoing));
      }
      accumulated += segments[i].arcLength;
    }
    distances.push(accumulated * scale);
    anchors.push(endAnchor);

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
    const lines = this.positionedLines();
    const blockWidth = this.size().x;
    const alignBase = this.pathAlignBase(arcLength, this.textLayout().width);
    const offset = this.pathOffset();
    const sample = createCurveSampler(profile);
    const closed = isClosedProfile(profile);
    const wrap = (distance: number) =>
      ((distance % arcLength) + arcLength) % arcLength;

    // Cross-path anchor: -1 top, 0 middle, 1 bottom; null = alphabetic baseline.
    const align = this.pathAlign();
    const smoothAnchorAt =
      align === 'smooth'
        ? this.buildSmoothAnchor(profile, matrix, scale)
        : null;
    const staticAnchor = resolvePathAnchor(align);
    const glyphBaseline = (box: FontBox, anchor: number | null) => {
      if (anchor === null) return 0;
      const {ascent, descent} = box;
      return (ascent - descent) / 2 - (anchor * (ascent + descent)) / 2;
    };

    context.save();
    this.applyStyle(context);
    this.applyText(context);
    context.textBaseline = 'alphabetic';
    const alpha = context.globalAlpha;

    for (const {unit, box, parts} of this.walkUnits(this.pathSplit(), true)) {
      // `unit.x` is aligned against the node's box; the run is aligned again
      // along the arc, so measure the unit from its own line's left edge.
      const lineLeft = (lines[unit.lineIndex]?.left ?? 0) - blockWidth / 2;
      const rawCenter = unit.x - lineLeft + alignBase + offset;
      // Clip overflow rather than letting the sampler clamp glyphs onto the ends.
      if (!closed && (rawCenter < 0 || rawCenter > arcLength)) {
        continue;
      }
      const center = closed ? wrap(rawCenter) : rawCenter;
      // A unit wider than the loop is capped so its chord cannot point backward.
      const half = closed
        ? Math.min(unit.width / 2, arcLength / 2)
        : unit.width / 2;
      const dStart = closed
        ? wrap(center - half)
        : clamp(0, arcLength, center - half);
      const dEnd = closed
        ? wrap(center + half)
        : clamp(0, arcLength, center + half);

      // Sample in increasing order so the sampler's cursor moves forward.
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
          box,
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
      for (const {text, run, penOffset} of parts) {
        const style = this.styleOf(run);
        context.font = style.font;
        context.letterSpacing = `${style.letterSpacing}px`;
        context.globalAlpha = alpha * style.opacity;
        context.fillStyle = resolveCanvasStyle(style.fill, context);
        context.strokeStyle = resolveCanvasStyle(style.stroke, context);
        context.lineWidth = style.lineWidth;

        if (style.lineWidth <= 0) {
          context.fillText(text, penOffset, 0);
        } else if (style.strokeFirst) {
          context.strokeText(text, penOffset, 0);
          context.fillText(text, penOffset, 0);
        } else {
          context.fillText(text, penOffset, 0);
          context.strokeText(text, penOffset, 0);
        }
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

    const box = this.parentTxt()
      ? this.ownedTextBox()
      : BBox.fromSizeCentered(this.computedSize());
    // Pad vertically for glyphs that overshoot the line box.
    return box.expand([0, this.fontSize() * 0.5]).expand(stroke);
  }

  @computed()
  protected override computedSize(): Vector2 {
    if (!this.parentTxt()) return super.computedSize();
    this.warnIgnoredSizing();
    const extent = this.ownedExtent();
    if (!extent) return Vector2.zero;
    // Translation does not change a size, and the anchor's depends on it.
    const linear = new DOMMatrix()
      .rotateSelf(0, 0, this.rotation())
      .scaleSelf(this.scale.x(), this.scale.y())
      .skewXSelf(this.skew.x())
      .skewYSelf(this.skew.y());
    return this.inOwnSpace(extent, linear).size;
  }

  /** {@link ownedExtent} in this node's space. */
  @computed()
  private ownedTextBox(): BBox {
    const extent = this.ownedExtent();
    return extent ? this.inOwnSpace(extent, this.localToParent()) : new BBox();
  }

  /** A box in the root's space, in this node's space when `own` places it. */
  private inOwnSpace(box: BBox, own: DOMMatrix): BBox {
    const toRoot = this.toRoot(own);
    if (toRoot.isIdentity) return box;
    return BBox.fromPoints(...box.transformCorners(toRoot.inverse()));
  }

  /** The matrix to the root's space, with `own` as this node's part. */
  private toRoot(own: DOMMatrix): DOMMatrix {
    const root = this.rootTxt();
    let matrix = own;
    for (
      let node = this.parentTxt();
      node && node !== root;
      node = node.parentTxt()
    ) {
      matrix = node.localToParent().multiply(matrix);
    }
    return matrix;
  }

  /** Warn once when a sizing prop is set on this nested node. */
  private warnIgnoredSizing(): void {
    const {x, y} = this.desiredSize();
    const {top, right, bottom, left} = this.padding();
    const sized =
      x !== null || y !== null || [top, right, bottom, left].some(Boolean);
    if (!sized || WarnedSizing.has(this)) return;
    WarnedSizing.add(this);
    useLogger().warn({
      message: 'A nested Txt ignores width, height and padding.',
      remarks: 'Its root Txt lays out its text. Size the root instead.',
      inspect: this.key,
    });
  }

  /** The box, in root space, of pieces this node or its children own. */
  private ownedExtent(): BBox | null {
    return this.rootTxt().ownedExtents().get(this) ?? null;
  }

  /** Whether this node or a node under it owns `span`. */
  private ownsSpan(span: TxtOwnerSpan): boolean {
    const node = span.paint.node;
    return node === this || this.contains(node);
  }

  /** The root's placed lines that hold ink this node owns. */
  private ownedLines(): readonly PlacedLine[] {
    const root = this.rootTxt();
    const lines = root.positionedLines();
    const spans = root.paragraph()?.content.ownerSpans;
    if (root === this || !spans) return lines;
    return lines.filter(line =>
      line.pieces.some(piece => {
        if (piece.hanging) return false;
        for (
          let index = Txt.ownerIndexAt(spans, piece.sourceStart);
          index < spans.length && spans[index].start < piece.sourceEnd;
          index++
        ) {
          if (this.ownsSpan(spans[index])) return true;
        }
        return false;
      }),
    );
  }

  /** Where this nested node's origin sits in its root's space. */
  private offsetInRoot(): Vector2 {
    const {a, b, c, d, e, f} = this.toRoot(this.localToParent());
    if (a !== 1 || b !== 0 || c !== 0 || d !== 1) {
      throw new Error(
        `A text query of ${this.key} cannot map the root's layout into it: ` +
          'it is rotated, scaled or skewed against its root Txt.',
      );
    }
    return new Vector2(e, f);
  }

  /** This nested node's owned lines, from its {@link ownedExtent}. */
  private ownedLayout(): TextLayoutResult {
    const root = this.rootTxt();
    const paragraph = root.paragraph();
    const extent = this.ownedExtent();
    if (!paragraph || !extent) return Txt.emptyLayout;
    const corner = extent.position.add(root.size().scale(0.5));
    return {
      lines: this.ownedLines().map(line => ({
        fragments: this.fragmentsOf(paragraph, line).map(fragment => ({
          ...fragment,
          x: fragment.x - corner.x,
        })),
        top: line.top - corner.y,
        height: line.height,
      })),
      width: extent.width,
      height: extent.height,
      lineHeight: paragraph.vertical.lineHeight,
    };
  }

  /** The root whose placement a unit query reads. */
  private unitsRoot(): Txt {
    const root = this.rootTxt();
    root.assertExclusionsIndependent();
    if (root !== this) this.offsetInRoot();
    return root;
  }

  /** Reject a query that only a root Txt, which lays out the text, answers. */
  private assertRoot(query: string): void {
    if (!this.parentTxt()) return;
    throw new Error(
      `${query}() of ${this.key} has no meaning for a nested Txt, whose ` +
        'root Txt lays out its text. Call it on the root.',
    );
  }

  /** {@link ownedExtent} of every nested node, from one pass on the root. */
  @computed()
  private ownedExtents(): Map<Txt, BBox> {
    const extents = new Map<Txt, BBox>();
    const paragraph = this.paragraph();
    const placed = this.placement();
    if (!paragraph || !placed) return extents;
    const spans = paragraph.content.ownerSpans;

    const edges = new Map<Txt, [number, number, number, number]>();
    const credit = (owner: Txt, box: [number, number, number, number]) => {
      for (
        let node: Txt | null = owner;
        node !== null && node !== this;
        node = node.parentTxt()
      ) {
        const edge = edges.get(node);
        if (!edge) {
          edges.set(node, [...box]);
          continue;
        }
        edge[0] = Math.min(edge[0], box[0]);
        edge[1] = Math.max(edge[1], box[1]);
        edge[2] = Math.min(edge[2], box[2]);
        edge[3] = Math.max(edge[3], box[3]);
      }
    };

    for (const line of placed.lines) {
      for (const piece of line.pieces) {
        if (piece.hanging) continue;
        const box: [number, number, number, number] = [
          piece.x,
          piece.x + piece.advance,
          line.top,
          line.top + line.height,
        ];
        if (piece.hyphen > 0) {
          box[0] = Math.min(box[0], piece.hyphenX);
          box[1] = Math.max(box[1], piece.hyphenX + piece.hyphen);
        }
        for (
          let index = Txt.ownerIndexAt(spans, piece.sourceStart);
          index < spans.length && spans[index].start < piece.sourceEnd;
          index++
        ) {
          credit(spans[index].paint.node, box);
        }
      }
    }

    const size = this.size();
    for (const [node, [left, right, top, bottom]] of edges) {
      extents.set(
        node,
        new BBox(
          left - size.x / 2,
          top - size.y / 2,
          right - left,
          bottom - top,
        ),
      );
    }
    return extents;
  }

  /**
   * Get the computed lines of the text layout.
   *
   * @remarks
   * Useful for querying word positions, line counts, and other layout data.
   */
  public textLines(): TextLayoutResult {
    this.rootTxt().assertExclusionsIndependent();
    return this.textLayout();
  }

  /**
   * Get the number of lines in the current text layout.
   */
  public lineCount(): number {
    return this.textLines().lines.length;
  }

  /** Walk every line, pairing segmented units with the paints on them. */
  private walkUnits(
    granularity: SegmentGranularity,
    keepPunctuation: boolean,
  ): PlacedUnit[] {
    const root = this.rootTxt();
    const paragraph = root.paragraph();
    const lines = this.ownedLines();
    if (!paragraph) return [];

    const {text, ownerSpans} = paragraph.content;
    // Where the root's placement puts this node's origin.
    const origin = root
      .size()
      .scale(0.5)
      .add(root === this ? Vector2.zero : this.offsetInRoot());
    const result: PlacedUnit[] = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const y = line.middle - origin.y;
      const baseline = line.baseline - origin.y;

      const slices: PaintedSlice[] = [];
      const sliceOfPiece: number[] = [];
      const sliceAt: number[] = [];
      let logical = '';
      for (let p = 0; p < line.pieces.length; p++) {
        const inline = line.pieces[p];
        // The slot an inline child holds stands in the segmented text, so no
        // word reaches across it and the gap it leaves survives.
        if (paragraph.items.kinds[inline.item] === 'inline-box') {
          if (this.ownsSpan(Txt.ownerSpanAt(ownerSpans, inline.sourceStart))) {
            logical += OBJECT_MARKER;
          }
          continue;
        }
        for (const slice of Txt.paintedSlices(paragraph, inline)) {
          if (!this.ownsSpan(slice.span)) continue;
          slices.push(slice);
          sliceOfPiece.push(p);
          sliceAt.push(logical.length);
          logical += text.slice(slice.start, slice.end);
        }
      }

      const pending: {unit: PlacedUnit; lastPiece: number}[] = [];
      for (const seg of segment(logical, granularity)) {
        if (seg.segment.length === 0) continue;
        if (granularity === 'word' && !seg.isWordLike) {
          // keepPunctuation keeps units like '.'; split() needs them so no
          // ink is lost, other callers (textWords, etc.) drop them.
          if (/^\s+$/.test(seg.segment) || !keepPunctuation) continue;
        }
        const from = seg.index;
        const to = from + seg.segment.length;

        const covered: {slice: PaintedSlice; start: number; end: number}[] = [];
        let lo = Infinity;
        let hi = -Infinity;
        let lastPiece = 0;
        for (let s = 0; s < slices.length; s++) {
          const slice = slices[s];
          const at = sliceAt[s];
          const length = slice.end - slice.start;
          if (at >= to || at + length <= from) continue;
          const start = slice.start + Math.max(from, at) - at;
          const end = slice.start + Math.min(to, at + length) - at;
          const extent = rangeExtentOf(slice.piece, start, end);
          lo = Math.min(lo, extent.left);
          hi = Math.max(hi, extent.right);
          lastPiece = sliceOfPiece[s];
          covered.push({slice, start, end});
        }
        if (covered.length === 0) continue;

        const center = (lo + hi) / 2;
        pending.push({
          lastPiece,
          unit: {
            box: Txt.fontBoxOf(paragraph, covered[0].slice.piece),
            unit: {
              text: seg.segment,
              x: center - origin.x,
              y,
              width: hi - lo,
              height: line.height,
              lineIndex: lineIdx,
              indexInLine: 0,
            },
            baseline,
            parts: covered.map(({slice, start, end}) => {
              const anchor = paintAnchorOf(slice.piece, start, end);
              return {
                text: text.slice(start, end),
                run: slice.span.paint,
                penOffset: anchor.penX - center,
                advance: anchor.advance,
              };
            }),
          },
        });
      }

      let indexInLine = 0;
      let cursor = 0;
      const emit = (placed: PlacedUnit) => {
        result.push({...placed, unit: {...placed.unit, indexInLine}});
        indexInLine++;
      };
      for (let p = 0; p < line.pieces.length; p++) {
        while (cursor < pending.length && pending[cursor].lastPiece <= p) {
          emit(pending[cursor++].unit);
        }
        const piece = line.pieces[p];
        const run = Txt.ownerSpanAt(ownerSpans, piece.sourceStart);
        if (piece.hyphen <= 0 || !this.ownsSpan(run)) continue;
        emit({
          unit: {
            text: '-',
            x: piece.hyphenX + piece.hyphen / 2 - origin.x,
            y,
            width: piece.hyphen,
            height: line.height,
            lineIndex: lineIdx,
            indexInLine: 0,
          },
          baseline,
          box: Txt.fontBoxOf(paragraph, piece),
          parts: [
            {
              text: '-',
              run: run.paint,
              penOffset: -piece.hyphen / 2,
              advance: piece.hyphen,
            },
          ],
        });
      }
      while (cursor < pending.length) emit(pending[cursor++].unit);
    }

    return result;
  }

  private splitLayout(granularity: SegmentGranularity): TextUnit[] {
    if (this.rootTxt().positionedLines().length === 0) {
      // No real 2D canvas context (e.g. jsdom): widths fall back to zero so
      // callers can still inspect text and order.
      return this.fallbackSplit(granularity);
    }
    return this.walkUnits(granularity, false).map(entry => entry.unit);
  }

  /** Cheap segment-only split for headless environments. */
  private fallbackSplit(granularity: SegmentGranularity): TextUnit[] {
    const runs = this.runsWithScale(1);
    if (runs.length === 0) return [];
    const joined = runs
      .map(run => (run.kind === 'text' ? run.text : ''))
      .join('');
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
    return this.unitsRoot().pathProfile() ? [] : this.wordUnits();
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
    return this.unitsRoot().pathProfile() ? [] : this.graphemeUnits();
  }

  /**
   * Sentence-level layout info. One entry per sentence span, in reading order.
   */
  public textSentences(): TextUnit[] {
    return this.unitsRoot().pathProfile() ? [] : this.sentenceUnits();
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
    const root = this.unitsRoot();
    if (root.pathProfile() || root.positionedLines().length === 0) {
      return [];
    }
    return this.walkUnits(granularity, true).map(entry =>
      this.createPiece(entry),
    );
  }

  /** Everything a split piece needs of one owner's paint and typeface. */
  private static pieceStyle(style: FragmentStyle): TxtProps {
    return {
      fontFamily: style.fontComponents.family,
      fontSize: style.fontComponents.size,
      fontStyle: style.fontComponents.style,
      fontWeight: style.fontComponents.weight,
      letterSpacing: style.letterSpacing,
      fill: style.fill,
      stroke: style.stroke,
      lineWidth: style.lineWidth,
      strokeFirst: style.strokeFirst,
      opacity: style.opacity,
    };
  }

  private createPiece(entry: PlacedUnit): Txt {
    // Centering via the piece's own box keeps the center anchor (for
    // rotate/scale) while the pen pins the unit where the source drew it.
    const {unit, parts} = entry;
    const shared: TxtProps = {
      lineCap: this.lineCap(),
      lineJoin: this.lineJoin(),
      lineDash: this.lineDash(),
      lineDashOffset: this.lineDashOffset(),
      textDirection: this.textDirection(),
      textWrap: false,
      textAlign: 'left',
      lineHeight: unit.height,
    };
    const styles = parts.map(part => this.styleOf(part.run));
    // A slot the text flow gave an inline child sits between two parts as a
    // gap, and an empty box of that width holds it open.
    const gapBefore = (index: number) =>
      index === 0
        ? 0
        : parts[index].penOffset -
          (parts[index - 1].penOffset + parts[index - 1].advance);
    const piece =
      parts.length === 1
        ? new Txt({
            ...Txt.pieceStyle(styles[0]),
            ...shared,
            text: parts[0].text,
          })
        : new Txt({
            ...Txt.pieceStyle(styles[0]),
            ...shared,
            opacity: 1,
            children: parts.flatMap((part, index) => {
              const own = new Txt({
                ...Txt.pieceStyle(styles[index]),
                text: part.text,
              });
              const gap = gapBefore(index);
              return gap > FIT_TOLERANCE
                ? [new Layout({width: gap, height: 0}), own]
                : [own];
            }),
          });

    const size = piece.size();
    const penLeft = unit.x + Math.min(...parts.map(part => part.penOffset));
    const own = piece.positionedLines()[0]?.baseline ?? size.y / 2;
    piece.position([penLeft + size.x / 2, entry.baseline - own + size.y / 2]);
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
   * @example
   * ```ts
   * label().width(label().shrinkWrapWidth());
   * ```
   */
  public shrinkWrapWidth(): number {
    this.assertRoot('shrinkWrapWidth');
    this.assertExclusionsIndependent();
    return this.naturalPlacement(Number.POSITIVE_INFINITY)?.width ?? 0;
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
    this.assertRoot('balancedWidth');
    this.assertExclusionsIndependent();
    // The probes ask what a wrapping layout would do, whatever `textWrap` is.
    const natural = this.naturalPlacement(Number.POSITIVE_INFINITY, true);
    if (!natural) return 0;

    const target = targetLineCount ?? natural.lines.length;
    if (target <= 1) return natural.width;

    let lo = Math.max(1, this.contentFloorOf(true));
    let hi = natural.width;
    if (hi <= lo) return Math.ceil(hi);

    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      const lines = this.naturalPlacement(mid, true)?.lines.length ?? 0;
      if (lines <= target) {
        hi = mid;
      } else {
        lo = mid;
      }
    }

    return Math.ceil(hi);
  }

  /** Place one paragraph in the box and measure how far it reaches past it. */
  private fitMissOf(
    paragraph: OwnedParagraph,
    measurer: AdvanceMeasurer,
    maxWidth: number,
    maxHeight: number,
  ): number {
    const placed = placeParagraph(
      paragraph.items,
      this.breakAt(paragraph, maxWidth),
      {
        text: paragraph.content.text,
        metrics: paragraph.metrics,
        vertical: paragraph.vertical,
        textAlign: this.textAlign(),
        direction: this.textDirectionValue(),
        verticalAlign: this.verticalAlign(),
        blockWidth: maxWidth,
        blockHeight: maxHeight,
        measurer,
      },
    );
    return paragraphFitMiss(
      paragraph.items,
      placed,
      paragraph.metrics,
      paragraph.seams,
      {width: maxWidth, height: maxHeight},
    );
  }

  /** Whether the whole paragraph, really laid out at `size`, fits the box. */
  private fitsAtSize(
    size: number,
    maxWidth: number,
    maxHeight: number,
  ): boolean {
    const paragraph = this.paragraphWithScale(this.scaleOf(size));
    if (!paragraph) return true;
    return (
      this.fitMissOf(paragraph, canvasParagraphMeasurer, maxWidth, maxHeight) <=
      FIT_TOLERANCE
    );
  }

  /** Paragraphs autoSize prepared, newest first, keyed on every input. */
  private preparations: Preparation[] = [];

  private preparedWithScale(scale: number): OwnedParagraph | null {
    return this.preparationWithScale(scale)?.paragraph ?? null;
  }

  private preparationWithScale(scale: number): Preparation | null {
    if (!this.measurementContext()) return null;
    const runs = this.runsWithScale(scale);
    if (runs.length === 0) return null;

    const key: unknown[] = [
      fontsVersion(),
      textLocaleVersion(),
      this.whiteSpaceMode(),
      this.wordBreak(),
      this.lineHeight(),
      runs.length,
    ];
    for (const run of runs) {
      key.push(
        run.kind,
        run.metrics.font,
        run.metrics.letterSpacing,
        run.kind === 'text' ? run.text : run.width,
        run.kind === 'text' ? '' : run.height,
      );
    }

    for (const found of this.preparations) {
      if (sameKey(found.key, key)) return found;
    }
    const prepared: Preparation = {
      key,
      paragraph: this.paragraphOfRuns(runs),
      fits: [],
    };
    this.preparations.unshift(prepared);
    this.preparations.length = Math.min(
      this.preparations.length,
      LAYOUT_CACHE_SIZE,
    );
    return prepared;
  }

  /** A probe that answers a fit by scaling the ceiling preparation. */
  private scaledFitProbe(
    prepared: OwnedParagraph,
    ceiling: number,
    maxWidth: number,
    maxHeight: number,
  ): (size: number) => ProbeVerdict {
    const read = scaledParagraphReader({
      items: prepared.items,
      metrics: prepared.metrics,
      vertical: prepared.vertical,
      lineHeight: this.lineHeight(),
      measurer: canvasParagraphMeasurer,
    });
    const missAt = (scale: number, slack: number) => {
      const scaled = read(scale, slack);
      return this.fitMissOf(
        {
          content: prepared.content,
          seams: prepared.seams,
          items: scaled.items,
          metrics: scaled.metrics,
          vertical: scaled.vertical,
          broken: [],
          placed: [],
        },
        scaled.measurer,
        maxWidth,
        maxHeight,
      );
    };

    const bounded = advanceBoundHolds(prepared.items);
    const tooTall = this.heightFloorProbe(prepared, maxWidth, maxHeight);
    return size => {
      const scale = size / ceiling;
      if (tooTall(scale)) return {fits: false, final: true};
      if (missAt(scale, 0) <= FIT_TOLERANCE) return {fits: true, final: false};
      // Final only if it still misses at the narrowest advances allowed;
      // a size-stepped face could otherwise move a break at a wider one.
      return {
        fits: false,
        final: bounded && missAt(scale, ADVANCE_SCALE_ERROR) > FIT_TOLERANCE,
      };
    };
  }

  /** Whether a scale leaves more ink than the box can hold. */
  private heightFloorProbe(
    prepared: OwnedParagraph,
    maxWidth: number,
    maxHeight: number,
  ): (scale: number) => boolean {
    const wraps = this.textWrap() !== false;
    if (!wraps || !Number.isFinite(maxWidth) || !Number.isFinite(maxHeight)) {
      return () => false;
    }
    const ink = paragraphInk(prepared.items);
    const lineHeight = this.lineHeight();
    const capSizes = prepared.metrics.map(one => canvasFontSize(one.font));
    return scale => {
      const narrowest = ink.scalable * scale * (1 - ADVANCE_SCALE_ERROR);
      const lines = leastLineCount(narrowest + ink.fixed, maxWidth);
      const shortest = Math.min(
        ...capSizes.map(size => resolveLineHeight(lineHeight, size * scale)),
      );
      return lines * shortest > maxHeight + FIT_TOLERANCE;
    };
  }

  /** Largest size the box height alone allows, bounded by the declared cap. */
  private fitCeiling(maxHeight: number): number {
    const size = Math.floor(this.fontSize());
    const lineHeight = this.lineHeight();
    if (typeof lineHeight !== 'string') return size;
    const ratio = resolveLineHeight(lineHeight, 1);
    if (ratio <= 0) return size;
    return Math.min(size, Math.floor((maxHeight + FIT_TOLERANCE) / ratio));
  }

  /**
   * Largest whole-pixel font size at or below {@link fontSize} whose layout
   * fits the given box, or `1` when nothing fits.
   *
   * @remarks
   * Reads each leaf at its raw (unscaled) size, so this method is safe to
   * call from inside {@link effectiveFontSize} without creating a dependency
   * cycle. The size returned is always one a real layout accepted, so the
   * answer depends only on the current state.
   *
   * @example
   * ```ts
   * label().fontSize(label().fitFontSize(400, 120));
   * ```
   */
  public fitFontSize(maxWidth: number, maxHeight: number): number {
    this.assertRoot('fitFontSize');
    this.assertExclusionsIndependent();
    if (!this.measurementContext()) return this.fontSize();
    const ceiling = this.fitCeiling(maxHeight);
    if (ceiling < 1) return 1;
    const real = (size: number) => this.fitsAtSize(size, maxWidth, maxHeight);
    const prepared = this.preparationWithScale(this.scaleOf(ceiling));
    if (!prepared) return searchFitSize(ceiling, null, real);

    const key: unknown[] = [
      ceiling,
      maxWidth,
      maxHeight,
      this.height.context.getter(),
      this.minHeight.context.getter(),
      this.maxHeight.context.getter(),
      ...this.layoutInputs(),
    ];
    for (const found of prepared.fits) {
      if (sameKey(found.key, key)) return found.size;
    }
    const size = searchFitSize(
      ceiling,
      this.scaledFitProbe(prepared.paragraph, ceiling, maxWidth, maxHeight),
      real,
    );
    prepared.fits.unshift({key, size});
    prepared.fits.length = Math.min(prepared.fits.length, LAYOUT_CACHE_SIZE);
    return size;
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
