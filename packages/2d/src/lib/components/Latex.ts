import {
  BBox,
  PossibleVector2,
  SerializedVector2,
  Signal,
  SignalValue,
  SimpleSignal,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  clampRemap,
  createMotionStack,
  createSignal,
  easeInOutCubic,
  lazy,
  map,
  threadable,
  unwrap,
  useLogger,
} from '@canvas-commons/core';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html.js';
import {TeX} from 'mathjax-full/js/input/tex.js';
import {AllPackages} from 'mathjax-full/js/input/tex/AllPackages.js';
import {mathjax} from 'mathjax-full/js/mathjax.js';
import {SVG} from 'mathjax-full/js/output/svg.js';
import {OptionList} from 'mathjax-full/js/util/Options.js';
import {
  ContentTransitions,
  EntryBase,
  IncomingEntry,
  MorphEntry,
  MovedEntry,
  UnitKey,
  createUnitKey,
  entryPose,
  restPose,
} from '../content';
import {computed, initial, parser, signal} from '../decorators';
import {alignSequences} from '../utils/diff';
import {NoDelta, turnDelta} from './layoutMotion';
import {Node} from './Node';
import {Path} from './Path';
import {Rect} from './Rect';
import {SVGDocument, SVG as SVGNode, SVGProps, SVGShapeData} from './SVG';
import {Txt} from './Txt';

const Adaptor = liteAdaptor();
RegisterHTMLHandler(Adaptor);

const SvgOutputJax = new SVG({fontCache: 'local'});
const JaxDocument = mathjax.document('', {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  InputJax: new TeX({packages: AllPackages}),
  // eslint-disable-next-line @typescript-eslint/naming-convention
  OutputJax: SvgOutputJax,
});

// MathJax sizes the root <svg> in `ex` of its own font. A browser resolves `ex`
// from the x-height of the container font, which differs between platforms.
const EX_TO_EM = SvgOutputJax.font.params.x_height;

function rootExToEm(svg: string): string {
  const rootTagEnd = svg.indexOf('>') + 1;
  const rootTag = svg
    .slice(0, rootTagEnd)
    .replace(
      /(-?[\d.]+)ex/g,
      (_, value: string) => `${Number(value) * EX_TO_EM}em`,
    );
  return rootTag + svg.slice(rootTagEnd);
}

/** The tex of the fragments on each side of a change. */
export interface LatexChange {
  readonly before: string;
  readonly after: string;
}

/** A glyph as a transition sees it: `id` names the character it draws. */
export interface LatexGlyphId {
  readonly id: string;
}

export interface LatexGlyphPair<T> {
  from: T | null;
  to: T | null;
}

/**
 * How a Latex node shows its edits.
 *
 * @remarks
 * `pair` decides which glyphs of a fragment move to which glyphs of the
 * fragment that replaced it; a glyph left without a partner leaves or arrives
 * with `outgoing` or `incoming`. The progress the hooks get is already eased.
 */
export interface LatexTransitions extends ContentTransitions<LatexChange> {
  pair<T extends LatexGlyphId>(
    from: readonly T[],
    to: readonly T[],
  ): LatexGlyphPair<T>[];
}

/**
 * How a fragment animates into the fragment that replaced it.
 *
 * @remarks
 * `morph` and `partialFade` pair up the two fragments' glyphs, so a glyph that
 * survives the change moves to its new place and one that was replaced either
 * morphs into its replacement or crosses over with it. `fade` pairs nothing and
 * crosses the whole fragment over. An object overrides the hooks it names.
 */
export type LatexTransition =
  'morph' | 'partialFade' | 'fade' | Partial<LatexTransitions>;

export interface LatexProps extends Omit<SVGProps, 'svg'> {
  tex?: SignalValue<string[] | string>;
  renderProps?: SignalValue<OptionList>;
  fragmentTransition?: SignalValue<LatexTransition>;
  debugFragments?: SignalValue<boolean>;
}

/**
 * Both states of the sub-tex occupying one slot of an {@link Latex.edit}
 * template.
 *
 * @remarks
 * The `insert`, `remove` and `replace` helpers that `Code` uses make these too.
 * Their fragments use {@link Latex.fragmentTransition}.
 */
export interface LatexEditFragment {
  before: string;
  after: string;
  transition?: LatexTransition;
}

export interface LatexEditGenerator {
  (
    strings: TemplateStringsArray,
    ...fragments: LatexEditFragment[]
  ): ThreadGenerator;
}

/**
 * Create an edit fragment whose glyphs morph into their replacements.
 *
 * @remarks
 * An empty `before` inserts the fragment and an empty `after` removes it.
 *
 * @param before - The sub-tex to change from.
 * @param after - The sub-tex to change to.
 */
export function morph(before: string, after: string): LatexEditFragment {
  return {before, after, transition: 'morph'};
}

/**
 * Create an edit fragment that crosses over with its replacement.
 *
 * @remarks
 * Glyphs the two states share fade with the rest; use {@link partialFade} to
 * keep them. An empty `before` inserts the fragment and an empty `after` removes
 * it.
 *
 * @param before - The sub-tex to change from.
 * @param after - The sub-tex to change to.
 */
export function fade(before: string, after: string): LatexEditFragment {
  return {before, after, transition: 'fade'};
}

/**
 * Create an edit fragment whose replaced glyphs cross over while the rest move.
 *
 * @remarks
 * Glyphs the two states share travel to their new place instead of fading, so
 * `x^2` becoming `y^2` keeps its exponent. An empty `before` inserts the
 * fragment and an empty `after` removes it.
 *
 * @param before - The sub-tex to change from.
 * @param after - The sub-tex to change to.
 */
export function partialFade(before: string, after: string): LatexEditFragment {
  return {before, after, transition: 'partialFade'};
}

const LABEL_SIZE = 16;

// Everything that leaves a formula does so at the start of a tween and
// everything that arrives does so at the end, leaving the middle to the glyphs
// that are moving.
const FADE_PORTION = 0.3;

function isSameGlyph(from: LatexGlyphId, to: LatexGlyphId) {
  return from.id === to.id;
}

function pairMorphing<T extends LatexGlyphId>(
  from: readonly T[],
  to: readonly T[],
): LatexGlyphPair<T>[] {
  return alignSequences(from, to, isSameGlyph);
}
/** Fade a fragment out at the start of an edit and in at its end. */
export const DefaultLatexTransitions: LatexTransitions = {
  incoming: (pose, progress) => ({
    ...pose,
    opacity: pose.opacity * clampRemap(1 - FADE_PORTION, 1, 0, 1, progress),
  }),
  outgoing: (pose, progress) => ({
    ...pose,
    opacity: pose.opacity * clampRemap(0, FADE_PORTION, 1, 0, progress),
  }),
  move: (pose, progress, delta) => ({
    ...pose,
    position: pose.position.add(Vector2.lerp(delta, Vector2.zero, progress)),
  }),
  morph: progress => 1 - progress,
  pair: pairMorphing,
};

const LatexTransitionPresets: Record<
  'morph' | 'partialFade' | 'fade',
  Partial<LatexTransitions>
> = {
  morph: {pair: pairMorphing},
  partialFade: {
    pair: (from, to) =>
      pairMorphing(from, to).flatMap(pair =>
        pair.from && pair.to && !isSameGlyph(pair.from, pair.to)
          ? [
              {from: pair.from, to: null},
              {from: null, to: pair.to},
            ]
          : [pair],
      ),
  },
  fade: {
    pair: (from, to) => [
      ...from.map(glyph => ({from: glyph, to: null})),
      ...to.map(glyph => ({from: null, to: glyph})),
    ],
  },
};

function transitionOverrides(
  transition: LatexTransition | undefined,
): Partial<LatexTransitions> {
  if (transition === undefined) return {};
  return typeof transition === 'string'
    ? LatexTransitionPresets[transition]
    : transition;
}

/** Where a glyph is when no edit moves it. */
interface GlyphRest {
  readonly position: Vector2;
  readonly scale: Vector2;
  readonly rotation: number;
  readonly skew: Vector2;
  readonly size: Vector2 | null;
  readonly data: string | null;
  readonly opacity: number;
}

interface LatexGlyph extends LatexGlyphId {
  /** The place of the glyph in the formula. */
  readonly index: number;
  readonly data: SVGShapeData;
  readonly rest: GlyphRest;
}

/** The glyphs of one tex part, or the ones no part claims when `tex` is null. */
interface LatexGroup {
  readonly tex: string | null;
  readonly glyphs: readonly LatexGlyph[];
}

interface LatexLayout {
  readonly size: Vector2;
  /** One group per tex part, then the unclaimed glyphs. */
  readonly groups: readonly LatexGroup[];
  readonly ids: readonly string[];
}

interface LatexPart {
  readonly key: UnitKey;
  readonly group: LatexGroup;
  readonly node: Node;
  readonly glyphs: readonly Node[];
}

/** The keys of the groups of one tex value. */
interface LatexKeys {
  readonly tex: readonly string[];
  readonly keys: readonly UnitKey[];
}

/** Groups of two layouts that one edit pairs, by index. */
interface LatexGroupPair {
  readonly from: number | null;
  readonly to: number | null;
  readonly transitions: LatexTransitions;
}

interface GlyphPlan {
  readonly from: LatexGlyph | null;
  readonly change: LatexChange;
  readonly transitions: LatexTransitions;
}

/** How a glyph was drawn when an edit began. */
interface GlyphStart {
  readonly matrix: DOMMatrix;
  readonly opacity: number;
  readonly data: string | null;
  readonly size: Vector2 | null;
  readonly rest: GlyphRest;
}

interface GlyphGhost extends EntryBase<LatexChange> {
  readonly kind: 'outgoing';
  readonly change: LatexChange;
  readonly rest: GlyphRest;
}

type GlyphEntry =
  | IncomingEntry<LatexChange>
  | GlyphGhost
  | MovedEntry<LatexChange>
  | MorphEntry<string, LatexChange>;

function characterId({id}: SVGShapeData) {
  return id.includes('-') ? id.substring(id.lastIndexOf('-') + 1) : id;
}

function vector(
  value: SignalValue<PossibleVector2> | undefined,
  fallback: number,
): Vector2 {
  return new Vector2(value === undefined ? fallback : unwrap(value));
}

function glyphRest({props}: SVGShapeData): GlyphRest {
  const width = props.width === undefined ? null : unwrap(props.width);
  const height = props.height === undefined ? null : unwrap(props.height);
  return {
    position: vector(props.position, 0),
    scale: vector(props.scale, 1),
    rotation: props.rotation === undefined ? 0 : unwrap(props.rotation),
    skew: vector(props.skew, 0),
    size:
      typeof width === 'number' && typeof height === 'number'
        ? new Vector2(width, height)
        : null,
    data: 'data' in props && typeof props.data === 'string' ? props.data : null,
    opacity: props.opacity === undefined ? 1 : unwrap(props.opacity),
  };
}

function sameTex(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((part, i) => part === b[i]);
}

function sameGlyphs(a: readonly LatexGlyph[], b: readonly LatexGlyph[]) {
  return a.length === b.length && a.every((glyph, i) => glyph.id === b[i].id);
}

const MAX_TEX_REPAIRS = 4;

function repairTex(tex: string, error: string): string | null {
  if (/^Missing (argument for|superscript or subscript)/.test(error)) {
    return `${tex}{\\quad}`;
  }

  const unclosed = error.match(/^Missing \\end\{(.*?)\}/);
  return unclosed ? `${tex}\\end{${unclosed[1]}}` : null;
}

/**
 * A node for animating equations with LaTeX.
 *
 * @preview
 * ```tsx editor
 * import {Latex, makeScene2D} from '@canvas-commons/2d';
 * import {createRef, waitFor} from '@canvas-commons/core';
 *
 * export default makeScene2D(function* (view) {
 *   const tex = createRef<Latex>();
 *   view.add(<Latex ref={tex} tex="{{y=}}{{a}}{{x^2}}" fill="white" />);
 *
 *   yield* waitFor(0.2);
 *   yield* tex().tex('{{y=}}{{a}}{{x^2}} + {{bx}}', 1);
 *   yield* waitFor(0.2);
 *   yield* tex().tex(
 *     '{{y=}}{{\\left(}}{{a}}{{x^2}} + {{bx}}{{\\over 1}}{{\\right)}}',
 *     1,
 *   );
 *   yield* waitFor(0.2);
 *   yield* tex().tex('{{y=}}{{a}}{{x^2}}', 1);
 * });
 * ```
 */
export class Latex extends SVGNode {
  @lazy(() => {
    return parseFloat(
      window.getComputedStyle(SVGNode.containerElement).fontSize,
    );
  })
  private static containerFontSize: number;
  private static svgContentsPool: Record<string, string> = {};
  private static layoutPool: Record<string, LatexLayout> = {};

  /**
   * How every Latex node shows its edits, unless a node or a fragment says
   * otherwise.
   */
  public static defaultTransitions: LatexTransitions = DefaultLatexTransitions;

  /** The keys the last edit gave the parts of its target. */
  private readonly partKeys = createSignal<LatexKeys | null>(null);
  private partCache = new Map<UnitKey, LatexPart>();
  /** The edits in flight. The tex is always their target. */
  private readonly glyphMotion = createMotionStack<Node, GlyphEntry>();
  private readonly glyphMorphs = new WeakMap<
    GlyphEntry,
    {to: string; at: (progress: number) => string}
  >();

  @initial({})
  @signal()
  declare public readonly options: SimpleSignal<OptionList, this>;

  /**
   * How a fragment animates into the fragment that replaced it.
   *
   * @remarks
   * Overrides {@link Latex.defaultTransitions}. Can be changed between tweens
   * to animate one step differently from the next. {@link edit} overrides it
   * per fragment.
   */
  @initial('morph')
  @signal()
  declare public readonly fragmentTransition: SimpleSignal<
    LatexTransition,
    this
  >;

  /**
   * Outline and label each fragment with the index it has in {@link map}.
   */
  @initial(false)
  @signal()
  declare public readonly debugFragments: SimpleSignal<boolean, this>;

  /**
   * The formula, as one string or as a list of parts.
   *
   * @remarks
   * Each part is one fragment: an item of the list, or the text between `{{`
   * and `}}`. Fragments are what {@link map} indexes and what a tween moves as
   * a unit. A formula with no marked parts is one fragment.
   *
   * During a tween, this is the formula the tween ends with.
   */
  @initial('')
  @parser(function (this: Latex, value: string[] | string): string[] {
    const array = typeof value === 'string' ? [value] : value;
    return array
      .reduce<string[]>((prev, current) => {
        prev.push(...current.split(/{{(.*?)}}/));
        return prev;
      }, [])
      .filter(sub => sub.trim().length > 0);
  })
  @signal()
  declare public readonly tex: Signal<string[] | string, string[], this>;

  public constructor(props: LatexProps) {
    super({
      fontSize: 48,
      ...props,
      svg: '',
    });
    this.svg(this.latexSVG);

    const ghosts = new Node({});
    ghosts.children(this.ghostNodes);
    ghosts.scale(this.wrapperScale);
    this.add(ghosts);

    const overlay = new Node({});
    overlay.children(this.fragmentOverlay);
    overlay.scale(this.wrapperScale);
    this.add(overlay);
  }

  protected override calculateWrapperScale(
    documentSize: Vector2,
    parentSize: SerializedVector2<number | null>,
  ): Vector2 {
    if (parentSize.x || parentSize.y) {
      return super.calculateWrapperScale(documentSize, parentSize);
    }
    return new Vector2(this.fontSize() / Latex.containerFontSize);
  }

  @computed()
  protected latexSVG() {
    return this.singleTexToSVG(this.tex().join(''));
  }

  /** The transitions of this node, over the class defaults. */
  @computed()
  public resolvedTransitions(): LatexTransitions {
    return {
      ...Latex.defaultTransitions,
      ...transitionOverrides(this.fragmentTransition()),
    };
  }

  private transitionsOf(transition?: LatexTransition): LatexTransitions {
    return {
      ...this.resolvedTransitions(),
      ...transitionOverrides(transition),
    };
  }

  @computed()
  private texLayout(): LatexLayout {
    return this.layoutOf(this.tex());
  }

  /** The nodes of each group; a group keeps its nodes while it keeps its key. */
  @computed()
  private parts(): LatexPart[] {
    const layout = this.texLayout();
    const record = this.partKeys();
    const keys =
      record &&
      record.keys.length === layout.groups.length &&
      sameTex(record.tex, this.tex())
        ? record.keys
        : null;
    const cache = new Map<UnitKey, LatexPart>();
    const parts = layout.groups.map((group, index) => {
      const key = keys?.[index] ?? createUnitKey();
      const cached = this.partCache.get(key);
      const part =
        cached && sameGlyphs(cached.group.glyphs, group.glyphs)
          ? {...cached, group}
          : this.buildPart(key, group);
      cache.set(key, part);
      return part;
    });
    this.partCache = cache;
    return parts;
  }

  @computed()
  private glyphRests(): Map<Node, GlyphRest> {
    const rests = new Map<Node, GlyphRest>();
    for (const {group, glyphs} of this.parts()) {
      glyphs.forEach((node, index) =>
        rests.set(node, group.glyphs[index].rest),
      );
    }
    return rests;
  }

  @computed()
  protected override document(): SVGDocument {
    return {
      size: this.texLayout().size,
      nodes: this.parts()
        .filter(({glyphs}) => glyphs.length > 0)
        .map(({group, node}) => ({
          id: group.tex ?? '__structural__',
          shape: node,
        })),
    };
  }

  /** The glyphs that left the formula and are still drawn. */
  @computed()
  private ghostNodes(): Node[] {
    return this.glyphMotion.keys().filter(node => this.ghostOf(node));
  }

  private ghostOf(node: Node): GlyphGhost | null {
    for (const entry of this.glyphMotion.entries(node)) {
      if (entry.kind === 'outgoing') return entry;
    }
    return null;
  }

  private buildPart(key: UnitKey, group: LatexGroup): LatexPart {
    const glyphs = group.glyphs.map(glyph => this.buildGlyph(glyph));
    return {key, group, glyphs, node: new Node({children: glyphs})};
  }

  /** Build a glyph whose pose and shape follow its rest and its entries. */
  private buildGlyph(glyph: LatexGlyph): Node {
    const {shape} = this.buildShape(glyph.data);
    const rest = () =>
      this.glyphRests().get(shape) ?? this.ghostOf(shape)?.rest ?? glyph.rest;
    const pose = () =>
      entryPose(
        this.glyphMotion.entries(shape),
        {...restPose(Vector2.zero), opacity: rest().opacity},
        this.resolvedTransitions(),
      );
    shape.position(() => rest().position.add(pose().position));
    shape.scale(() => rest().scale.mul(pose().scale));
    shape.rotation(() => rest().rotation);
    shape.skew(() => rest().skew);
    shape.opacity(() => pose().opacity);
    if (shape instanceof Path) {
      shape.data(() => this.drawnData(shape, rest().data ?? ''));
    }
    if (shape instanceof Rect) {
      shape.size(() => rest().size ?? Vector2.zero);
    }
    return shape;
  }

  private drawnData(node: Node, target: string): string {
    let data = target;
    for (const entry of this.glyphMotion.entries(node)) {
      if (entry.kind !== 'morph') continue;
      const weight = (
        entry.transitions.morph ?? this.resolvedTransitions().morph
      )(entry.progress());
      if (weight <= 0) continue;
      if (weight >= 1) {
        data = entry.from;
        continue;
      }
      let morph = this.glyphMorphs.get(entry);
      if (morph?.to !== data) {
        morph = {
          to: data,
          at: this.morpher.createInterpolator(entry.from, data),
        };
        this.glyphMorphs.set(entry, morph);
      }
      data = morph.at(1 - weight);
    }
    return data;
  }

  @computed()
  private fragmentOverlay(): Node[] {
    if (!this.debugFragments()) {
      return [];
    }

    const scale = this.wrapperScale();
    const labelSize = LABEL_SIZE / scale.y;
    const nodes = this.document().nodes;

    return nodes.flatMap(({shape}, index) => {
      const box = BBox.fromPoints(
        ...shape.cacheBBox().transformCorners(shape.localToParent()),
      );
      if (box.width === 0 && box.height === 0) {
        return [];
      }

      const color = `hsl(${Math.round((index * 360) / nodes.length)}, 100%, 50%)`;
      // Alternate sides and heights so neighboring labels miss each other.
      const offset = labelSize * (1 + (index % 3));
      return [
        new Rect({
          position: box.center,
          size: box.size,
          stroke: color,
          lineWidth: 1 / scale.x,
          fill: null,
        }),
        new Txt({
          text: `${index}`,
          fill: color,
          fontSize: labelSize,
          position: [
            box.center.x,
            index % 2 === 0 ? box.top - offset : box.bottom + offset,
          ],
        }),
      ];
    });
  }

  /** Lay out `parts` and claim the glyphs of the formula for each part. */
  private layoutOf(parts: readonly string[]): LatexLayout {
    const subTexs = parts.map(sub => sub.trim());
    const key = `${JSON.stringify(subTexs)}::${JSON.stringify(this.options())}`;
    const cached = Latex.layoutPool[key];
    if (cached) {
      return cached;
    }

    const whole = SVGNode.parseSVGData(this.singleTexToSVG(parts.join('')));
    const remaining = whole.nodes.map((data, index): LatexGlyph => ({
      id: characterId(data),
      index,
      data,
      rest: glyphRest(data),
    }));
    const groups: LatexGroup[] = subTexs.map(tex => ({
      tex,
      glyphs: this.claimGlyphs(tex, remaining),
    }));
    groups.push({tex: null, glyphs: remaining});

    const layout = {
      size: whole.size,
      groups,
      ids: whole.nodes.map(characterId),
    };
    if (layout.size.x > 0 || layout.size.y > 0) {
      Latex.layoutPool[key] = layout;
    }
    return layout;
  }

  private claimGlyphs(tex: string, remaining: LatexGlyph[]): LatexGlyph[] {
    // MathJax does not always emit a fragment's glyphs together: the radical
    // of a `\sqrt` trails its radicand.
    const claimed: LatexGlyph[] = [];
    let cursor = 0;
    for (const node of SVGNode.parseSVGData(this.subTexToSVG(tex)).nodes) {
      const id = characterId(node);
      const index = remaining.findIndex(
        (glyph, at) => at >= cursor && glyph.id === id,
      );
      if (index === -1) continue;
      claimed.push(...remaining.splice(index, 1));
      cursor = index;
    }
    return claimed;
  }

  private subTexToSVG(subTex: string) {
    let tex = subTex.trim();
    if (tex === '\\substack') tex = '\\quad';

    const numLeft = tex.match(/\\left[()[\]|.\\]/g)?.length ?? 0;
    const numRight = tex.match(/\\right[()[\]|.\\]/g)?.length ?? 0;
    if (numLeft !== numRight) {
      tex = tex.replace(/\\left/g, '\\big').replace(/\\right/g, '\\big');
    }

    const bracesLeft = tex.match(/((?<!\\)|(?<=\\\\)){/g)?.length ?? 0;
    const bracesRight = tex.match(/((?<!\\)|(?<=\\\\))}/g)?.length ?? 0;

    if (bracesLeft < bracesRight) {
      tex = '{'.repeat(bracesRight - bracesLeft) + tex;
    } else if (bracesRight < bracesLeft) {
      tex += '}'.repeat(bracesLeft - bracesRight);
    }

    // A fragment is a piece of a formula, so it can be missing the arguments or
    // the `\end` that its commands need. MathJax names what it wants, which
    // repairs any command rather than a list of the ones seen so far. A fragment
    // that cannot be repaired, such as an `\end` without its `\begin`, renders
    // nothing and leaves its glyphs to the fragments around it.
    let attempt = this.renderTex(tex);
    for (let repair = 0; attempt.error && repair < MAX_TEX_REPAIRS; repair++) {
      const repaired = repairTex(tex, attempt.error);
      if (!repaired) break;
      tex = repaired;
      attempt = this.renderTex(tex);
    }

    return attempt.error ? this.renderTex('').svg : attempt.svg;
  }

  private renderTex(tex: string): {svg: string; error: string | null} {
    const src = `${tex}::${JSON.stringify(this.options())}`;
    const svg =
      Latex.svgContentsPool[src] ??
      rootExToEm(Adaptor.innerHTML(JaxDocument.convert(tex, this.options())));
    Latex.svgContentsPool[src] = svg;

    return {svg, error: svg.match(/data-mjx-error="(.*?)"/)?.[1] ?? null};
  }

  private singleTexToSVG(tex: string): string {
    const {svg, error} = this.renderTex(tex);
    if (error) {
      useLogger().error({message: `Invalid MathJax: ${error}`, object: {tex}});
    }
    return svg;
  }

  @threadable()
  protected *tweenTex(
    value: string[],
    time: number,
    timingFunction: TimingFunction,
  ) {
    yield* this.animateGroups(
      this.tex(),
      this.tex.context.parse(value),
      (source, target) => this.alignGroups(source, target),
      time,
      timingFunction,
    );
  }

  /** Pair the parts of two layouts by their tex, as a whole-value tween does. */
  private alignGroups(
    source: LatexLayout,
    target: LatexLayout,
  ): LatexGroupPair[] {
    const parts = (layout: LatexLayout) =>
      layout.groups.slice(0, -1).map((_, index) => index);
    const pairs = alignSequences(
      parts(source),
      parts(target),
      (a, b) => source.groups[a].tex === target.groups[b].tex,
    );

    // A part that moved past others is one part, not a removal and an insertion.
    const insertions = pairs.filter(pair => pair.from === null);
    for (const deletion of pairs) {
      const from = deletion.from;
      if (deletion.to !== null || from === null) continue;
      const insertion = insertions.find(
        ({to}) =>
          to !== null && target.groups[to].tex === source.groups[from].tex,
      );
      if (!insertion) continue;
      deletion.to = insertion.to;
      insertion.to = null;
    }

    const transitions = this.resolvedTransitions();
    return [
      ...pairs
        .filter(({from, to}) => from !== null || to !== null)
        .map(pair => ({...pair, transitions})),
      this.unclaimedPair(source, target),
    ];
  }

  private unclaimedPair(
    source: LatexLayout,
    target: LatexLayout,
  ): LatexGroupPair {
    return {
      from: source.groups.length - 1,
      to: target.groups.length - 1,
      transitions: this.resolvedTransitions(),
    };
  }

  /** Animate from the drawn formula to `targetTex`, pairing groups by `plan`. */
  @threadable()
  private *animateGroups(
    sourceTex: readonly string[],
    targetTex: string[],
    plan: (source: LatexLayout, target: LatexLayout) => LatexGroupPair[],
    time: number,
    timing: TimingFunction,
  ): ThreadGenerator {
    const layout = this.texLayout();
    const parts = this.parts();
    const source = this.layoutOf(sourceTex);
    const target = this.layoutOf(targetTex);
    const pairs = plan(source, target);

    const drawn = new Map<number, Node>();
    parts.forEach(({group, glyphs}) =>
      glyphs.forEach((node, index) =>
        drawn.set(group.glyphs[index].index, node),
      ),
    );
    const sourceIndex = new Map<number, number>();
    for (const {from, to} of alignSequences(
      [...source.ids.keys()],
      [...layout.ids.keys()],
      (a, b) => source.ids[a] === layout.ids[b],
    )) {
      if (from !== null && to !== null && source.ids[from] === layout.ids[to]) {
        sourceIndex.set(from, to);
      }
    }
    const nodeOf = (glyph: LatexGlyph) => {
      const index = sourceIndex.get(glyph.index);
      return index === undefined ? undefined : drawn.get(index);
    };

    const keys = this.keepKeys(parts, layout, source, target, pairs, glyph =>
      sourceIndex.get(glyph.index),
    );
    const {plans, leaving} = this.planGlyphs(source, target, pairs);

    const starts = new Map<Node, GlyphStart>();
    for (const {group, glyphs} of parts) {
      glyphs.forEach((node, index) =>
        starts.set(node, {
          matrix: node.localToParent(),
          opacity: node.opacity(),
          data: node instanceof Path ? node.data() : null,
          size: node instanceof Rect ? node.size() : null,
          rest: group.glyphs[index].rest,
        }),
      );
    }

    const motion = this.offsetLayout(this.flexTree(), () => {
      this.partKeys({tex: targetTex, keys});
      this.tex.context.setter(targetTex);
    });
    const {progress} = motion;

    const handed = new Set<Node>();
    this.parts().forEach(({group, glyphs}, groupIndex) =>
      glyphs.forEach((node, index) => {
        const glyphPlan = plans[groupIndex][index] ?? {
          from: null,
          change: {before: '', after: group.tex ?? ''},
          transitions: this.resolvedTransitions(),
        };
        const own = starts.get(node);
        const sourceNode = glyphPlan.from ? nodeOf(glyphPlan.from) : undefined;
        const start = own ?? (sourceNode && starts.get(sourceNode));
        if (!start) {
          this.glyphMotion.push(node, {
            kind: 'incoming',
            progress,
            transitions: glyphPlan.transitions,
            change: glyphPlan.change,
          });
          return;
        }
        handed.add(own ? node : (sourceNode ?? node));
        this.offsetGlyph(node, start, progress, glyphPlan.transitions);
        if (!own) {
          this.carryGlyph(
            node,
            start,
            group.glyphs[index].rest,
            progress,
            glyphPlan,
          );
        }
      }),
    );

    const leavingNodes = new Map<Node, GlyphPlan>();
    for (const [glyph, glyphPlan] of leaving) {
      const node = nodeOf(glyph);
      if (node) leavingNodes.set(node, glyphPlan);
    }
    for (const [node, start] of starts) {
      if (handed.has(node)) continue;
      const glyphPlan = leavingNodes.get(node);
      this.glyphMotion.push(node, {
        kind: 'outgoing',
        progress,
        transitions: glyphPlan?.transitions ?? this.resolvedTransitions(),
        change: glyphPlan?.change ?? {before: '', after: ''},
        rest: start.rest,
      });
    }

    try {
      yield* progress(1, time, timing);
    } finally {
      motion.release();
      this.glyphMotion.release(progress);
      progress.context.dispose();
    }
  }

  /** The target group keys; a kept group reuses the key of its drawn group. */
  private keepKeys(
    parts: readonly LatexPart[],
    layout: LatexLayout,
    source: LatexLayout,
    target: LatexLayout,
    pairs: readonly LatexGroupPair[],
    drawnIndex: (glyph: LatexGlyph) => number | undefined,
  ): UnitKey[] {
    const signature = (tex: string | null, indices: (number | undefined)[]) =>
      `${JSON.stringify(tex)}:${indices.join(',')}`;
    const owners = new Map<string, number>();
    layout.groups.forEach(({tex, glyphs}, index) =>
      owners.set(
        signature(
          tex,
          glyphs.map(glyph => glyph.index),
        ),
        index,
      ),
    );

    const keys = target.groups.map(() => createUnitKey());
    const kept = new Set<number>();
    for (const {from, to} of pairs) {
      if (from === null || to === null) continue;
      const {tex, glyphs} = source.groups[from];
      if (tex !== target.groups[to].tex) continue;
      const owner = owners.get(signature(tex, glyphs.map(drawnIndex)));
      if (owner !== undefined && !kept.has(owner)) {
        kept.add(owner);
        keys[to] = parts[owner].key;
      }
    }
    return keys;
  }

  /** Which source glyph each target glyph starts from, and which ones leave. */
  private planGlyphs(
    source: LatexLayout,
    target: LatexLayout,
    pairs: readonly LatexGroupPair[],
  ): {
    plans: (GlyphPlan | undefined)[][];
    leaving: Map<LatexGlyph, GlyphPlan>;
  } {
    const plans = target.groups.map(({glyphs}): (GlyphPlan | undefined)[] =>
      glyphs.map(() => undefined),
    );
    const leaving = new Map<LatexGlyph, GlyphPlan>();
    for (const {from, to, transitions} of pairs) {
      const fromGroup = from === null ? null : source.groups[from];
      const toGroup = to === null ? null : target.groups[to];
      const change = {before: fromGroup?.tex ?? '', after: toGroup?.tex ?? ''};
      const fromGlyphs = fromGroup?.glyphs ?? [];
      const toGlyphs = toGroup?.glyphs ?? [];
      // An unchanged fragment has nothing to cross over with.
      const glyphPairs =
        fromGroup && toGroup && fromGroup.tex === toGroup.tex
          ? pairMorphing(fromGlyphs, toGlyphs)
          : transitions.pair(fromGlyphs, toGlyphs);
      for (const pair of glyphPairs) {
        const paired =
          pair.from && pair.to && pair.from.data.type === pair.to.data.type
            ? pair.from
            : null;
        if (to !== null && pair.to) {
          plans[to][toGlyphs.indexOf(pair.to)] = {
            from: paired,
            change,
            transitions,
          };
        }
        if (pair.from && !paired) {
          leaving.set(pair.from, {from: pair.from, change, transitions});
        }
      }
    }
    return {plans, leaving};
  }

  /** Offset `node` back to the pose of `start`. */
  private offsetGlyph(
    node: Node,
    start: GlyphStart,
    progress: SimpleSignal<number>,
    transitions: LatexTransitions,
  ) {
    const view = this.view();
    const after = node.localToParent();
    const move = new Vector2(
      start.matrix.e - after.e,
      start.matrix.f - after.f,
    );
    const turn = turnDelta(start.matrix, after);
    if (
      !move.exactlyEquals(Vector2.zero) ||
      turn.rotation !== 0 ||
      !turn.scale.exactlyEquals(Vector2.one)
    ) {
      view.offsetNode(node, {
        ...NoDelta,
        ...turn,
        move,
        progress,
        interpolation: (delta, _, value) =>
          transitions.move(restPose(Vector2.zero), value, delta).position,
      });
    }
    this.glyphMotion.push(node, {
      kind: 'moved',
      progress,
      delta: move,
      transitions: {
        // `offsetNode` already moves the glyph.
        move: (pose, value, delta) => ({
          ...transitions.move(pose, value, delta),
          position: pose.position,
        }),
      },
    });
    if (start.size && node instanceof Rect) {
      const size = start.size.sub(node.size());
      if (!size.exactlyEquals(Vector2.zero)) {
        view.offsetNode(node, {
          ...NoDelta,
          size,
          progress,
          interpolation: (delta, _, value) =>
            delta.scale(transitions.morph(value)),
        });
      }
    }
  }

  /** Start a new glyph from the opacity and shape of the one it replaces. */
  private carryGlyph(
    node: Node,
    start: GlyphStart,
    rest: GlyphRest,
    progress: SimpleSignal<number>,
    {change, transitions}: GlyphPlan,
  ) {
    if (rest.opacity > 0 && start.opacity !== rest.opacity) {
      const ratio = start.opacity / rest.opacity;
      this.glyphMotion.push(node, {
        kind: 'incoming',
        progress,
        transitions: {
          incoming: (pose, value) => ({
            ...pose,
            opacity: pose.opacity * map(ratio, 1, value),
          }),
        },
        change,
      });
    }
    if (
      node instanceof Path &&
      start.data !== null &&
      start.data !== rest.data
    ) {
      this.glyphMotion.push(node, {
        kind: 'morph',
        progress,
        transitions,
        from: start.data,
      });
    }
  }

  /**
   * Animate between two formulas written as one template.
   *
   * @remarks
   * Each hole of the template is a fragment that knows both of its states, so
   * the correspondence comes from where you wrote it rather than from a list of
   * indices. Everything outside a hole is a fragment that stays as it is.
   *
   * The template is read raw, so LaTeX commands need no extra escaping. The
   * `{{}}` syntax is not recognised here; the holes take its place.
   *
   * @example
   * ```tsx
   * yield* tex().edit(1)`d=\sqrt{${fade('x', '(-54.934)')}^2}${insert('=3')}`;
   * ```
   *
   * @param time - The duration of the animation.
   * @param timingFunction - The timing function.
   */
  public edit(
    time = 0.6,
    timingFunction: TimingFunction = easeInOutCubic,
  ): LatexEditGenerator {
    return (strings, ...fragments) => {
      const slots: LatexEditFragment[] = [];
      for (let i = 0; i < strings.raw.length; i++) {
        slots.push(morph(strings.raw[i], strings.raw[i]));
        const fragment = fragments[i];
        if (fragment) {
          slots.push(fragment);
        }
      }
      return this.tweenEdit(slots, time, timingFunction);
    };
  }

  /**
   * Animate a change to part of the current formula, leaving the rest alone.
   *
   * @remarks
   * Each replacement's `before` is matched against the current formula and
   * swapped for its `after`, so only the parts that change have to be written
   * out. Matches are claimed left to right, one per replacement, so repeat a
   * replacement to change more than one occurrence of the same sub-tex.
   *
   * A replacement with an empty `before`, such as `insert('=3')`, is added at
   * the end of the formula.
   *
   * A match may not span two sub-tex parts. Splitting a part is fine - matching
   * `x` inside `x^2` turns it into the parts `x` and `^2` - but a match that
   * begins in one part and ends in another is ignored, with a warning. The
   * animation uses {@link easeInOutCubic}; reach for {@link edit} to choose the
   * timing function.
   *
   * @example
   * ```tsx
   * yield* tex().replace(1, fade('x', '(-54.934)'), morph('^2', ''));
   * ```
   *
   * @param time - The duration of the animation.
   * @param replacements - The changes to make.
   */
  @threadable()
  public *replace(time: number, ...replacements: LatexEditFragment[]) {
    yield* this.tweenEdit(
      this.applyReplacements(this.tex(), replacements),
      time,
      easeInOutCubic,
    );
  }

  private applyReplacements(
    parts: string[],
    replacements: LatexEditFragment[],
  ): LatexEditFragment[] {
    const pending = replacements.filter(({before}) => before.length > 0);
    const slots: LatexEditFragment[] = [];

    for (const part of parts) {
      let rest = part;
      let matched = true;
      while (matched && rest.length > 0) {
        matched = false;
        for (const [index, replacement] of pending.entries()) {
          const at = rest.indexOf(replacement.before);
          if (at === -1) continue;

          pending.splice(index, 1);
          if (at > 0) {
            slots.push(morph(rest.slice(0, at), rest.slice(0, at)));
          }
          slots.push(replacement);
          rest = rest.slice(at + replacement.before.length);
          matched = true;
          break;
        }
      }
      if (rest.length > 0) {
        slots.push(morph(rest, rest));
      }
    }

    for (const {before} of pending) {
      useLogger().warn({
        message: `Latex: "${before}" does not occur in the current formula, or spans two of its parts.`,
        object: {formula: parts},
      });
    }

    slots.push(...replacements.filter(({before}) => before.length === 0));
    return slots;
  }

  @threadable()
  protected *tweenEdit(
    slots: LatexEditFragment[],
    time: number,
    timingFunction: TimingFunction,
  ) {
    const source = Latex.resolveSlots(slots, 'before');
    const target = Latex.resolveSlots(slots, 'after');
    const sourceTex = source.map(({tex}) => tex);
    const targetTex = target.map(({tex}) => tex);

    if (this.tex().join('') !== sourceTex.join('')) {
      useLogger().warn({
        message: 'Latex: the current tex differs from the one being edited.',
        object: {current: this.tex().join(''), before: sourceTex.join('')},
      });
    }

    yield* this.animateGroups(
      sourceTex,
      targetTex,
      (sourceLayout, targetLayout) => {
        const pairs: LatexGroupPair[] = [];
        slots.forEach((fragment, slot) => {
          const from = source.findIndex(part => part.slot === slot);
          const to = target.findIndex(part => part.slot === slot);
          if (from !== -1 || to !== -1) {
            pairs.push({
              from: from === -1 ? null : from,
              to: to === -1 ? null : to,
              transitions: this.transitionsOf(fragment.transition),
            });
          }
        });
        pairs.push(this.unclaimedPair(sourceLayout, targetLayout));
        return pairs;
      },
      time,
      timingFunction,
    );
  }

  private static resolveSlots(
    slots: LatexEditFragment[],
    state: 'before' | 'after',
  ): {slot: number; tex: string}[] {
    return slots
      .map((fragment, slot) => ({slot, tex: fragment[state]}))
      .filter(({tex}) => tex.trim().length > 0);
  }

  /**
   * Animate from the current tex to a new value using a fragment-to-fragment
   * mapping.
   *
   * @remarks
   * Prefer {@link edit} unless you need one fragment to feed several others;
   * it describes the same correspondence without the indices.
   *
   * @param value - The new tex value.
   * @param mapping - A mapping from source fragment indices to target fragment
   *   indices. For example, `[[0], [1, 2]]` maps source fragment 0 to target
   *   fragment 0, and source fragment 1 to both target fragments 1 and 2.
   * @param time - The duration of the animation.
   * @param timingFunction - The timing function.
   */
  @threadable()
  public *map(
    value: string[] | string,
    mapping: number[][],
    time: number,
    timingFunction: TimingFunction = easeInOutCubic,
  ) {
    const fragments = (layout: LatexLayout) =>
      layout.groups.flatMap(({glyphs}, index) =>
        glyphs.length > 0 ? [index] : [],
      );

    yield* this.animateGroups(
      this.tex(),
      this.tex.context.parse(value),
      (source, target) => {
        const sourceFragments = fragments(source);
        const targetFragments = fragments(target);
        const transitions = this.resolvedTransitions();
        const pairs: LatexGroupPair[] = [];
        mapping.forEach((targets, sourceIndex) => {
          const from = sourceFragments[sourceIndex];
          if (from === undefined) return;
          for (const targetIndex of targets) {
            const to = targetFragments[targetIndex];
            if (to === undefined) {
              useLogger().warn(
                `texMap: target index ${targetIndex} is out of bounds (0-${targetFragments.length - 1})`,
              );
              continue;
            }
            pairs.push({from, to, transitions});
          }
        });
        return pairs;
      },
      time,
      timingFunction,
    );
  }
}
