import {
  BBox,
  SerializedVector2,
  Signal,
  SignalValue,
  SimpleSignal,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  all,
  delay,
  easeInOutCubic,
  lazy,
  threadable,
  useLogger,
} from '@canvas-commons/core';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html.js';
import {TeX} from 'mathjax-full/js/input/tex.js';
import {AllPackages} from 'mathjax-full/js/input/tex/AllPackages.js';
import {mathjax} from 'mathjax-full/js/mathjax.js';
import {SVG} from 'mathjax-full/js/output/svg.js';
import {OptionList} from 'mathjax-full/js/util/Options.js';
import {computed, initial, parser, signal} from '../decorators';
import {AlignedPair, alignSequences} from '../utils/diff';
import {Curve} from './Curve';
import {Node} from './Node';
import {Path} from './Path';
import {Rect} from './Rect';
import {
  SVGDocument,
  SVGDocumentData,
  SVG as SVGNode,
  SVGProps,
  SVGShape,
  SVGShapeData,
} from './SVG';
import {Txt} from './Txt';

const Adaptor = liteAdaptor();
RegisterHTMLHandler(Adaptor);

const JaxDocument = mathjax.document('', {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  InputJax: new TeX({packages: AllPackages}),
  // eslint-disable-next-line @typescript-eslint/naming-convention
  OutputJax: new SVG({fontCache: 'local'}),
});

/**
 * How a fragment animates into the fragment that replaced it.
 *
 * @remarks
 * `morph` and `partialFade` pair up the two fragments' glyphs, so a glyph that
 * survives the change moves to its new place and one that was replaced either
 * morphs into its replacement or crosses over with it. `fade` pairs nothing and
 * crosses the whole fragment over.
 */
export type LatexTransition = 'morph' | 'partialFade' | 'fade';

export interface LatexProps extends Omit<SVGProps, 'svg'> {
  tex?: SignalValue<string[] | string>;
  renderProps?: SignalValue<OptionList>;
  fragmentTransition?: SignalValue<LatexTransition>;
  debugFragments?: SignalValue<boolean>;
}

/**
 * Both states of the sub-tex occupying one slot of an {@link Latex.edit}
 * template.
 */
export interface LatexEditFragment {
  before: string;
  after: string;
  transition: LatexTransition;
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

interface LatexFragment {
  id: string;
  shapes: Curve[];
}

interface LatexFragmentPair extends AlignedPair<LatexFragment, LatexFragment> {
  transition: LatexTransition;
}

const LABEL_SIZE = 16;

// Everything that leaves a formula does so at the start of a tween and
// everything that arrives does so at the end, leaving the middle to the glyphs
// that are moving.
const FADE_PORTION = 0.3;

function isMorphable(node: Node): node is Curve {
  return node instanceof Path || node instanceof Rect;
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
  private static texNodesPool: Record<string, SVGDocumentData> = {};
  private svgSubTexMap: Record<string, string[]> = {};
  private readonly glyphIds = new WeakMap<Node, string>();

  @initial({})
  @signal()
  declare public readonly options: SimpleSignal<OptionList, this>;

  /**
   * How a fragment animates into the fragment that replaced it.
   *
   * @remarks
   * Can be changed between tweens to animate one step differently from the
   * next. {@link edit} overrides it per fragment.
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
    return this.texToSvg(this.tex());
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

  private getNodeCharacterId({id}: SVGShapeData) {
    if (!id.includes('-')) return id;
    return id.substring(id.lastIndexOf('-') + 1);
  }

  protected override buildShape(data: SVGShapeData): SVGShape {
    const shape = super.buildShape(data);
    this.glyphIds.set(shape.shape, this.getNodeCharacterId(data));
    return shape;
  }

  private isSameGlyph(from: Node, to: Node): boolean {
    const id = this.glyphIds.get(from);
    return id !== undefined && id === this.glyphIds.get(to);
  }

  private getFragments(nodes: SVGShape[]): LatexFragment[] {
    return nodes.map(({id, shape}) => {
      const children = shape.children();
      return {
        id,
        shapes: (children.length > 0 ? children : [shape]).filter(isMorphable),
      };
    });
  }

  private alignFragments(
    from: LatexFragment[],
    to: LatexFragment[],
  ): AlignedPair<LatexFragment, LatexFragment>[] {
    const pairs = alignSequences(from, to, (a, b) => a.id === b.id);
    const insertions = pairs.filter(pair => !pair.from && pair.to);

    for (const deletion of pairs) {
      if (deletion.to || !deletion.from) continue;
      const insertion = insertions.find(
        candidate => candidate.to?.id === deletion.from?.id,
      );
      if (!insertion) continue;
      deletion.to = insertion.to;
      insertion.to = null;
    }

    return pairs.filter(({from, to}) => from !== null || to !== null);
  }

  protected override parseSVG(svg: string): SVGDocument {
    if (!this.svgSubTexMap[svg]) {
      return super.parseSVG(svg);
    }
    const subTexs = this.svgSubTexMap[svg].map(sub => sub.trim());
    const key = `[${subTexs.join(',')}]::${JSON.stringify(this.options())}`;
    const cached = Latex.texNodesPool[key];
    if (cached && (cached.size.x > 0 || cached.size.y > 0)) {
      return this.buildDocument(Latex.texNodesPool[key]);
    }
    const oldSVG = SVGNode.parseSVGData(svg);
    const oldNodes = [...oldSVG.nodes];

    const newNodes: SVGShapeData[] = [];
    for (const sub of subTexs) {
      const subSvg = this.subTexToSVG(sub);
      const subNodes = SVGNode.parseSVGData(subSvg).nodes;

      if (subNodes.length === 0) {
        continue;
      }

      // MathJax does not always emit a fragment's glyphs together: the radical
      // of a `\sqrt` trails its radicand.
      const children: SVGShapeData[] = [];
      let cursor = 0;
      for (const subNode of subNodes) {
        const id = this.getNodeCharacterId(subNode);
        const index = oldNodes.findIndex(
          (node, at) => at >= cursor && this.getNodeCharacterId(node) === id,
        );
        if (index === -1) continue;
        children.push(...oldNodes.splice(index, 1));
        cursor = index;
      }

      if (children.length === 0) {
        continue;
      }

      // Wrapping keeps the sub-tex naming the fragment from replacing the id
      // that identifies the glyph a shape renders.
      newNodes.push({
        id: sub,
        type: Node,
        props: {},
        children,
      });
    }
    if (oldNodes.length > 0) {
      newNodes.push({
        id: '__structural__',
        type: Node,
        props: {},
        children: [...oldNodes],
      });
    }

    const newSVG: SVGDocumentData = {
      size: oldSVG.size,
      nodes: newNodes,
    };
    Latex.texNodesPool[key] = newSVG;
    return this.buildDocument(newSVG);
  }

  protected texToSvg(subTexs: string[]) {
    const singleTex = subTexs.join('');
    const svg = this.singleTexToSVG(singleTex);
    if (subTexs.length > 1) {
      this.svgSubTexMap[svg] = subTexs;
    }
    return svg;
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
      Adaptor.innerHTML(JaxDocument.convert(tex, this.options()));
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

  private fadeOutShapes(
    shapes: Curve[],
    time: number,
    timingFunction: TimingFunction,
  ): ThreadGenerator[] {
    return shapes.map(shape =>
      shape.opacity(0, time * FADE_PORTION, timingFunction),
    );
  }

  private fadeInShapes(
    shapes: Curve[],
    time: number,
    timingFunction: TimingFunction,
  ): ThreadGenerator[] {
    return shapes.map(shape => {
      const clone = shape.clone();
      clone.opacity(0);
      this.wrapper.add(clone);
      return delay(
        time * (1 - FADE_PORTION),
        clone.opacity(1, time * FADE_PORTION, timingFunction),
      );
    });
  }

  private crossfadeShapes(
    from: Curve[],
    to: Curve[],
    time: number,
    timingFunction: TimingFunction,
  ): ThreadGenerator[] {
    return [
      ...this.fadeOutShapes(from, time, timingFunction),
      ...this.fadeInShapes(to, time, timingFunction),
    ];
  }

  private createFragmentMorphAnimations(
    sourceShapes: Curve[],
    targetShapes: Curve[],
    time: number,
    timingFunction: TimingFunction,
    transition: LatexTransition,
  ): ThreadGenerator[] {
    const animations: ThreadGenerator[] = [];
    const crossfade = transition === 'partialFade';

    for (const {from, to} of alignSequences(
      sourceShapes,
      targetShapes,
      (a, b) => this.isSameGlyph(a, b),
    )) {
      if (from && to) {
        if (crossfade && !this.isSameGlyph(from, to)) {
          animations.push(
            ...this.crossfadeShapes([from], [to], time, timingFunction),
          );
        } else if (from instanceof Path && to instanceof Path) {
          const fromData = from.data();
          const toData = to.data();
          if (fromData && toData && fromData !== toData) {
            const interpolator = this.morpher.createInterpolator(
              fromData,
              toData,
            );
            animations.push(
              from.data(toData, time, timingFunction, (_from, _to, value) =>
                interpolator(value),
              ),
            );
          }
          animations.push(
            from.position(to.position(), time, timingFunction),
            from.scale(to.scale(), time, timingFunction),
          );
        } else if (from instanceof Rect && to instanceof Rect) {
          animations.push(
            from.position(to.position(), time, timingFunction),
            from.scale(to.scale(), time, timingFunction),
            from.size(to.size(), time, timingFunction),
          );
        } else {
          animations.push(
            ...this.crossfadeShapes([from], [to], time, timingFunction),
          );
        }
      } else if (from) {
        animations.push(...this.fadeOutShapes([from], time, timingFunction));
      } else if (to) {
        animations.push(...this.fadeInShapes([to], time, timingFunction));
      }
    }

    return animations;
  }

  @threadable()
  protected *tweenTex(
    value: string[],
    time: number,
    timingFunction: TimingFunction,
  ) {
    const parsedValue = this.tex.context.parse(value);
    const newSVG = this.texToSvg(parsedValue);
    const targetDoc = this.parseSVG(newSVG);
    const transition = this.fragmentTransition();

    const pairs = this.alignFragments(
      this.getFragments(this.document().nodes),
      this.getFragments(targetDoc.nodes),
    ).map(pair => ({...pair, transition}));

    yield* this.tweenFragments(
      pairs,
      {svg: newSVG, tex: parsedValue, document: targetDoc},
      time,
      timingFunction,
    );
  }

  @threadable()
  private *tweenFragments(
    pairs: LatexFragmentPair[],
    target: {svg: string; tex: string[]; document: SVGDocument},
    time: number,
    timingFunction: TimingFunction,
  ) {
    const newSize = target.document.size.mul(
      this.calculateWrapperScale(target.document.size, this.getCurrentSize()),
    );
    const lockedScale = new Vector2(this.wrapper.scale());

    this.lockLayout();
    this.wrapper.scale(lockedScale);

    const animations: ThreadGenerator[] = [];
    for (const {from, to, transition} of pairs) {
      // An unchanged fragment has nothing to cross over with.
      if (from && to && (transition !== 'fade' || from.id === to.id)) {
        animations.push(
          ...this.createFragmentMorphAnimations(
            from.shapes,
            to.shapes,
            time,
            timingFunction,
            transition,
          ),
        );
        continue;
      }

      animations.push(
        ...this.crossfadeShapes(
          from?.shapes ?? [],
          to?.shapes ?? [],
          time,
          timingFunction,
        ),
      );
    }

    yield* all(...animations, this.size(newSize, time, timingFunction));

    this.svg.context.setter(target.svg);
    this.tex.context.setter(target.tex);
    this.wrapper.children(this.documentNodes);
    this.wrapper.scale(this.wrapperScale);
    this.releaseLayout();
    this.width.reset();
    this.height.reset();
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
   * yield* tex().edit(1)`d=\sqrt{${fade('x', '(-54.934)')}^2}`;
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

    const sourceSVG = this.texToSvg(sourceTex);
    const targetSVG = this.texToSvg(targetTex);

    // The template decides where the fragments are, so the formula is reparsed
    // against its slots even when it is already on screen.
    this.svg.context.setter(sourceSVG);
    this.tex.context.setter(sourceTex);
    const sourceDoc = this.parseSVG(sourceSVG);
    this.wrapper.children(sourceDoc.nodes.map(({shape}) => shape));
    this.wrapper.scale(this.wrapperScale);

    const targetDoc = this.parseSVG(targetSVG);
    const sourceSlots = this.matchFragmentsToSlots(
      this.getFragments(sourceDoc.nodes),
      source,
    );
    const targetSlots = this.matchFragmentsToSlots(
      this.getFragments(targetDoc.nodes),
      target,
    );

    const pairs: LatexFragmentPair[] = [];
    slots.forEach(({transition}, slot) => {
      const from = sourceSlots.matched.get(slot) ?? null;
      const to = targetSlots.matched.get(slot) ?? null;
      if (from || to) {
        pairs.push({from, to, transition});
      }
    });

    const transition = this.fragmentTransition();
    pairs.push(
      ...this.alignFragments(sourceSlots.extra, targetSlots.extra).map(
        pair => ({
          ...pair,
          transition,
        }),
      ),
    );

    yield* this.tweenFragments(
      pairs,
      {svg: targetSVG, tex: targetTex, document: targetDoc},
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

  private matchFragmentsToSlots(
    fragments: LatexFragment[],
    slots: {slot: number; tex: string}[],
  ): {matched: Map<number, LatexFragment>; extra: LatexFragment[]} {
    const matched = new Map<number, LatexFragment>();
    const extra: LatexFragment[] = [];
    let next = 0;

    for (const fragment of fragments) {
      const found = slots.findIndex(
        ({tex}, index) => index >= next && tex.trim() === fragment.id,
      );
      if (found === -1) {
        extra.push(fragment);
        continue;
      }
      next = found + 1;
      matched.set(slots[found].slot, fragment);
    }

    return {matched, extra};
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
    timingFunction?: TimingFunction,
  ) {
    const logger = useLogger();
    const parsedValue = this.tex.context.parse(value);
    const newSVG = this.texToSvg(parsedValue);
    const targetDoc = this.parseSVG(newSVG);

    const timing: TimingFunction = timingFunction ?? easeInOutCubic;
    const transition = this.fragmentTransition();

    const sourceFragments = this.getFragments(this.document().nodes).map(
      ({shapes}) => shapes,
    );
    const targetFragments = this.getFragments(targetDoc.nodes).map(
      ({shapes}) => shapes,
    );

    const mappedTargetIndices = new Set<number>();
    const animations: ThreadGenerator[] = [];

    for (let srcIdx = 0; srcIdx < mapping.length; srcIdx++) {
      const targetIndices = mapping[srcIdx];
      const srcShapes = sourceFragments[srcIdx];

      if (!srcShapes || srcShapes.length === 0) {
        continue;
      }

      if (!targetIndices || targetIndices.length === 0) {
        animations.push(...this.fadeOutShapes(srcShapes, time, timing));
        continue;
      }

      for (let t = 0; t < targetIndices.length; t++) {
        const tgtIdx = targetIndices[t];

        if (tgtIdx < 0 || tgtIdx >= targetFragments.length) {
          logger.warn(
            `texMap: target index ${tgtIdx} is out of bounds (0-${targetFragments.length - 1})`,
          );
          continue;
        }

        mappedTargetIndices.add(tgtIdx);
        const tgtShapes = targetFragments[tgtIdx];

        if (t === 0) {
          animations.push(
            ...this.createFragmentMorphAnimations(
              srcShapes,
              tgtShapes,
              time,
              timing,
              transition,
            ),
          );
        } else {
          const clonedSrc = srcShapes.map(shape => {
            const clone = shape.clone();
            this.wrapper.add(clone);
            return clone;
          });
          animations.push(
            ...this.createFragmentMorphAnimations(
              clonedSrc,
              tgtShapes,
              time,
              timing,
              transition,
            ),
          );
        }
      }
    }

    for (
      let srcIdx = mapping.length;
      srcIdx < sourceFragments.length;
      srcIdx++
    ) {
      const srcShapes = sourceFragments[srcIdx];
      if (srcShapes) {
        animations.push(...this.fadeOutShapes(srcShapes, time, timing));
      }
    }

    for (let tgtIdx = 0; tgtIdx < targetFragments.length; tgtIdx++) {
      if (mappedTargetIndices.has(tgtIdx)) {
        continue;
      }

      animations.push(
        ...this.fadeInShapes(targetFragments[tgtIdx], time, timing),
      );
    }

    yield* all(...animations);

    this.svg.context.setter(newSVG);
    this.tex.context.setter(parsedValue);
    this.wrapper.children(this.documentNodes);
  }
}
