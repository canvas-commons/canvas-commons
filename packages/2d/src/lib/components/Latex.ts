import {
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
  tween,
  useLogger,
} from '@canvas-commons/core';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html.js';
import {TeX} from 'mathjax-full/js/input/tex.js';
import {AllPackages} from 'mathjax-full/js/input/tex/AllPackages.js';
import {mathjax} from 'mathjax-full/js/mathjax.js';
import {SVG} from 'mathjax-full/js/output/svg.js';
import {OptionList} from 'mathjax-full/js/util/Options.js';
import {computed, initial, parser, signal} from '../decorators/index.js';
import {Curve} from './Curve.js';
import {Node} from './Node.js';
import {Path} from './Path.js';
import {Rect} from './Rect.js';
import {
  SVGDocument,
  SVGDocumentData,
  SVG as SVGNode,
  SVGProps,
  SVGShapeData,
} from './SVG.js';

const Adaptor = liteAdaptor();
RegisterHTMLHandler(Adaptor);

const JaxDocument = mathjax.document('', {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  InputJax: new TeX({packages: AllPackages}),
  // eslint-disable-next-line @typescript-eslint/naming-convention
  OutputJax: new SVG({fontCache: 'local'}),
});

export interface LatexProps extends Omit<SVGProps, 'svg'> {
  tex?: SignalValue<string[] | string>;
  renderProps?: SignalValue<OptionList>;
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

  @initial({})
  @signal()
  declare public readonly options: SimpleSignal<OptionList, this>;

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

  private getNodeCharacterId({id}: SVGShapeData) {
    if (!id.includes('-')) return id;
    return id.substring(id.lastIndexOf('-') + 1);
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
    const pendingFragments: {sub: string; nodeCount: number}[] = [];
    for (const sub of subTexs) {
      const subSvg = this.subTexToSVG(sub);
      const subNodes = SVGNode.parseSVGData(subSvg).nodes;

      if (subNodes.length === 0) {
        continue;
      }

      const firstId = this.getNodeCharacterId(subNodes[0]);
      const spliceIndex = oldNodes.findIndex(
        node => this.getNodeCharacterId(node) === firstId,
      );
      if (spliceIndex === -1) {
        pendingFragments.push({sub, nodeCount: subNodes.length});
        continue;
      }
      const children = oldNodes.splice(spliceIndex, subNodes.length);

      if (children.length === 1) {
        newNodes.push({
          ...children[0],
          id: sub,
        });
        continue;
      }

      newNodes.push({
        id: sub,
        type: Node,
        props: {},
        children,
      });
    }
    for (const pending of pendingFragments) {
      const children = oldNodes.splice(0, pending.nodeCount);
      if (children.length === 0) continue;
      if (children.length === 1) {
        newNodes.push({...children[0], id: pending.sub});
      } else {
        newNodes.push({
          id: pending.sub,
          type: Node,
          props: {},
          children,
        });
      }
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
    if (
      ['\\overline', '\\sqrt', '\\sqrt{'].includes(tex) ||
      tex.endsWith('_') ||
      tex.endsWith('^') ||
      tex.endsWith('dot')
    ) {
      tex += '{\\quad}';
    }

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

    const hasArrayBegin = tex.includes('\\begin{array}');
    const hasArrayEnd = tex.includes('\\end{array}');
    if (hasArrayBegin !== hasArrayEnd) tex = '';

    return this.singleTexToSVG(tex);
  }

  private singleTexToSVG(tex: string): string {
    const src = `${tex}::${JSON.stringify(this.options())}`;
    if (Latex.svgContentsPool[src]) {
      return Latex.svgContentsPool[src];
    }

    const svg = Adaptor.innerHTML(JaxDocument.convert(tex, this.options()));
    if (svg.includes('data-mjx-error')) {
      const errors = svg.match(/data-mjx-error="(.*?)"/);
      if (errors && errors.length > 0) {
        useLogger().error(`Invalid MathJax: ${errors[1]}`);
      }
    }
    Latex.svgContentsPool[src] = svg;
    return svg;
  }

  private getShapes(): Curve[] {
    return this.wrapper
      .children()
      .flatMap(child =>
        child.children().length > 0 ? child.children() : [child],
      )
      .filter((c): c is Curve => c instanceof Path || c instanceof Rect);
  }

  private getFragmentShapes(): Curve[][] {
    return this.wrapper.children().map(child => {
      const children = child.children().length > 0 ? child.children() : [child];
      return children.filter(
        (c): c is Curve => c instanceof Path || c instanceof Rect,
      );
    });
  }

  private getTargetFragmentShapes(doc: SVGDocument): Curve[][] {
    return doc.nodes.map(node => {
      const shape = node.shape;
      if (shape.children().length > 0) {
        return shape
          .children()
          .filter((c): c is Curve => c instanceof Path || c instanceof Rect);
      }
      return shape instanceof Path || shape instanceof Rect ? [shape] : [];
    });
  }

  private createFragmentMorphAnimations(
    sourceShapes: Curve[],
    targetShapes: Curve[],
    time: number,
    timingFunction: TimingFunction,
  ): ThreadGenerator[] {
    const animations: ThreadGenerator[] = [];
    const maxLen = Math.max(sourceShapes.length, targetShapes.length);

    for (let i = 0; i < maxLen; i++) {
      const from = sourceShapes[i];
      const to = targetShapes[i];

      if (from && to) {
        if (from instanceof Path && to instanceof Path) {
          const fromData = from.data();
          const toData = to.data();
          if (fromData && toData && fromData !== toData) {
            const interpolator = this.morpher.createInterpolator(
              fromData,
              toData,
            );
            animations.push(
              tween(time, t => {
                const progress = timingFunction(t);
                from.data.context.setter(interpolator(progress));
              }),
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
          animations.push(from.opacity(0, time * 0.3, timingFunction));
          const clone = to.clone();
          clone.opacity(0);
          this.wrapper.add(clone);
          animations.push(
            delay(time * 0.7, clone.opacity(1, time * 0.3, timingFunction)),
          );
        }
      } else if (from && !to) {
        animations.push(from.opacity(0, time * 0.3, timingFunction));
      } else if (!from && to) {
        const clone = to.clone();
        clone.opacity(0);
        this.wrapper.add(clone);
        animations.push(clone.opacity(1, time, timingFunction));
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
    const currentShapes = this.getShapes();

    const targetDoc = this.parseSVG(newSVG);
    const targetShapes = targetDoc.nodes.flatMap(node => {
      const shape = node.shape;
      if (shape.children().length > 0) {
        return shape
          .children()
          .filter((c): c is Curve => c instanceof Path || c instanceof Rect);
      }
      return shape instanceof Path || shape instanceof Rect ? [shape] : [];
    });

    const currentPaths = currentShapes.filter(
      (s): s is Path => s instanceof Path,
    );
    const currentRects = currentShapes.filter(
      (s): s is Rect => s instanceof Rect,
    );
    const targetPaths = targetShapes.filter(
      (s): s is Path => s instanceof Path,
    );
    const targetRects = targetShapes.filter(
      (s): s is Rect => s instanceof Rect,
    );

    yield* all(
      ...this.createFragmentMorphAnimations(
        currentPaths,
        targetPaths,
        time,
        timingFunction,
      ),
      ...this.createFragmentMorphAnimations(
        currentRects,
        targetRects,
        time,
        timingFunction,
      ),
    );

    this.svg.context.setter(newSVG);
    this.tex.context.setter(parsedValue);
    this.wrapper.children(this.documentNodes);
  }

  /**
   * Animate from the current tex to a new value using a fragment-to-fragment
   * mapping.
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

    const sourceFragments = this.getFragmentShapes();
    const targetFragments = this.getTargetFragmentShapes(targetDoc);

    const mappedTargetIndices = new Set<number>();
    const animations: ThreadGenerator[] = [];

    for (let srcIdx = 0; srcIdx < mapping.length; srcIdx++) {
      const targetIndices = mapping[srcIdx];
      const srcShapes = sourceFragments[srcIdx];

      if (!srcShapes || srcShapes.length === 0) {
        continue;
      }

      if (!targetIndices || targetIndices.length === 0) {
        for (const shape of srcShapes) {
          animations.push(shape.opacity(0, time * 0.3, timing));
        }
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
        for (const shape of srcShapes) {
          animations.push(shape.opacity(0, time * 0.3, timing));
        }
      }
    }

    for (let tgtIdx = 0; tgtIdx < targetFragments.length; tgtIdx++) {
      if (mappedTargetIndices.has(tgtIdx)) {
        continue;
      }

      const tgtShapes = targetFragments[tgtIdx];
      for (const shape of tgtShapes) {
        const clone = shape.clone();
        clone.opacity(0);
        this.wrapper.add(clone);
        animations.push(clone.opacity(1, time, timing));
      }
    }

    yield* all(...animations);

    this.svg.context.setter(newSVG);
    this.tex.context.setter(parsedValue);
    this.wrapper.children(this.documentNodes);
  }
}
