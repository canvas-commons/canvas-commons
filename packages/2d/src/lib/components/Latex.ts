import {
  all,
  delay,
  lazy,
  SerializedVector2,
  Signal,
  SignalValue,
  SimpleSignal,
  threadable,
  ThreadGenerator,
  TimingFunction,
  useLogger,
  Vector2,
} from '@canvas-commons/core';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html';
import {TeX} from 'mathjax-full/js/input/tex';
import {AllPackages} from 'mathjax-full/js/input/tex/AllPackages';
import {mathjax} from 'mathjax-full/js/mathjax';
import {SVG} from 'mathjax-full/js/output/svg';
import {OptionList} from 'mathjax-full/js/util/Options';
import {computed, initial, parser, signal} from '../decorators';
import {CanvasStyle} from '../partials';
import {Node} from './Node';
import {Path} from './Path';
import {
  SVGDocument,
  SVGDocumentData,
  SVG as SVGNode,
  SVGProps,
  SVGShapeData,
} from './SVG';

const Adaptor = liteAdaptor();
RegisterHTMLHandler(Adaptor);

const JaxDocument = mathjax.document('', {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  InputJax: new TeX({packages: AllPackages}),
  // eslint-disable-next-line @typescript-eslint/naming-convention
  OutputJax: new SVG({fontCache: 'local'}),
});

// presets required for the Pitex animations to work
const FACTOR = 2;
const BUFFER = 0.25;

export function math(tex: string) {
  return tex.replace(/\//g, '\\').split(' ');
}

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
  public declare readonly options: SimpleSignal<OptionList, this>;

  @initial('')
  @parser(function (this: SVGNode, value: string[] | string): string[] {
    const array = typeof value === 'string' ? [value] : value;
    return array
      .reduce<string[]>((prev, current) => {
        prev.push(...current.split(/{{(.*?)}}/));
        return prev;
      }, [])
      .filter(sub => sub.trim().length > 0);
  })
  @signal()
  public declare readonly tex: Signal<string[] | string, string[], this>;

  private color: CanvasStyle;

  public constructor(props: LatexProps) {
    super({
      fontSize: 48,
      ...props,
      svg: '',
    });
    this.svg(this.latexSVG);
    this.color = this.fill();
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
    const subTexs = this.svgSubTexMap[svg]!.map(sub => sub.trim());
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

      const firstId = this.getNodeCharacterId(subNodes[0]);
      const spliceIndex = oldNodes.findIndex(
        node => this.getNodeCharacterId(node) === firstId,
      );
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
    if (oldNodes.length > 0) {
      useLogger().error({
        message: 'Matching between Latex SVG and tex parts failed',
        inspect: this.key,
      });
    }

    const newSVG: SVGDocumentData = {
      size: oldSVG.size,
      nodes: newNodes,
    };
    Latex.texNodesPool[key] = newSVG;
    return this.buildDocument(newSVG);
  }

  private texToSvg(subTexs: string[]) {
    const singleTex = subTexs.join('');
    const svg = this.singleTexToSVG(singleTex);
    this.svgSubTexMap[svg] = subTexs;
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

  @threadable()
  protected *tweenTex(
    value: string[],
    time: number,
    timingFunction: TimingFunction,
  ) {
    const newSVG = this.texToSvg(this.tex.context.parse(value));
    yield* this.svg(newSVG, time, timingFunction);
    this.svg(this.latexSVG);
  }

  public getPaths() {
    return this.childAs(0)
      ?.children()
      .flatMap(part =>
        part.children().length ? (part.children() as Path[]) : part,
      ) as Path[];
  }

  public *write(time: number, timingFunction?: TimingFunction) {
    const paths = this.getPaths();
    const duration = time / paths.length;
    const animations: ThreadGenerator[] = [];

    for (let i = 0; i < paths.length; i++) {
      paths[i].fill(null).stroke(this.color).lineWidth(40).start(0).end(0);
      animations.push(
        delay(
          (i * duration) / FACTOR,
          paths[i].end(1, duration, timingFunction),
        ),
        delay(
          ((i + 1) * duration) / FACTOR,
          paths[i].fill(this.color, duration, timingFunction),
        ),
        delay(
          ((i + 1) * duration) / FACTOR,
          paths[i].lineWidth(0, duration, timingFunction),
        ),
      );
    }

    yield* all(...animations);
  }

  public *unwrite(time: number, timingFunction?: TimingFunction) {
    const paths = this.getPaths();
    const duration = time / paths.length;
    const animations: ThreadGenerator[] = [];

    for (let i = 0; i < paths.length; i++) {
      paths[i].lineWidth(0).stroke(this.color).start(0);
      animations.push(
        delay(
          (i * duration) / FACTOR,
          paths[i].fill(null, duration, timingFunction),
        ),
        delay(
          (i * duration) / FACTOR,
          paths[i].lineWidth(40, duration, timingFunction),
        ),
        delay(
          ((i + 1) * duration) / FACTOR,
          paths[i].start(1, duration, timingFunction),
        ),
      );
    }

    yield* all(...animations);
  }

  public *edit(tex: string, time: number) {
    yield* this.tex(math(tex), time);
  }

  public *morph(ptx: Latex, time: number) {
    const paths = this.getPaths();
    const targets = ptx.getPaths();
    const animations: ThreadGenerator[] = [];

    for (let i = 0; i < paths.length; i++) {
      paths[i].stroke(this.fill());

      animations.push(
        paths[i].fill(null, time * BUFFER),
        paths[i].lineWidth(40, time * BUFFER),
        delay(
          time * BUFFER,
          paths[i].data(targets[i].data(), time * (1 - 2 * BUFFER)),
        ),
        delay(
          time * BUFFER,
          paths[i].position(targets[i].position(), time * (1 - 2 * BUFFER)),
        ),
        delay(
          time * BUFFER,
          paths[i].scale(targets[i].scale(), time * (1 - 2 * BUFFER)),
        ),
        delay(time * (1 - BUFFER), paths[i].fill(paths[i].stroke(), time / 2)),
        delay(time * (1 - BUFFER), paths[i].lineWidth(0, time / 2)),
      );
    }

    yield* all(...animations);
  }

  public *map(ptx: Latex, mapping: number[][], time: number) {
    let paths = this.getPaths();
    const len = paths.length;
    const targets = ptx.getPaths();
    const animations: ThreadGenerator[] = [];
    const taken = targets.map(() => false);
    const extras: number[] = [];

    for (let i = 0; i < len; i++) {
      if (!mapping[i].length) {
        animations.push(
          delay(time * BUFFER, paths[i].opacity(0, time * (1 - 2 * BUFFER))),
        );
        extras.push(i);
        continue;
      }

      for (let j = 0; j < mapping[i].length; j++) {
        let index = i;

        if (j > 0) {
          const subToPihedron = this.childAs(0)?.childAs(0);
          index = subToPihedron?.children().length ?? i;
          subToPihedron?.add(this.getPaths()[i].clone());
        }

        if (taken[mapping[i][j]]) extras.push(index);

        taken[mapping[i][j]] = true;

        paths = this.getPaths();

        animations.push(
          delay(
            time * BUFFER,
            paths[index].data(
              targets[mapping[i][j]].data(),
              time * (1 - 2 * BUFFER),
            ),
          ),
          delay(
            time * BUFFER,
            paths[index].position(
              targets[mapping[i][j]].position(),
              time * (1 - 2 * BUFFER),
            ),
          ),
          delay(
            time * BUFFER,
            paths[index].scale(
              targets[mapping[i][j]].scale(),
              time * (1 - 2 * BUFFER),
            ),
          ),
        );
      }
    }

    paths = this.getPaths();

    for (let i = 0; i < paths.length; i++) {
      paths[i].stroke(this.fill());

      animations.push(
        paths[i].fill(null, time * BUFFER),
        paths[i].lineWidth(40, time * BUFFER),
        delay(time * (1 - BUFFER), paths[i].fill(paths[i].stroke(), time / 2)),
        delay(time * (1 - BUFFER), paths[i].lineWidth(0, time / 2)),
      );
    }

    yield* all(...animations);

    extras.forEach(i => paths[i].remove());
  }
}
