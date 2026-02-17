import {
  BBox,
  SignalValue,
  SimpleSignal,
  capitalize,
  lazy,
  textLerp,
} from '@canvas-commons/core';
import {
  computed,
  initial,
  interpolation,
  nodeName,
  signal,
} from '../decorators';
import {MeasureMode} from '../utils/yoga';
import {Shape, ShapeProps} from './Shape';
import {Txt} from './Txt';

export interface TxtLeafProps extends ShapeProps {
  children?: string;
  text?: SignalValue<string>;
}

interface GraphemeSegmenter {
  segment(input: string): Iterable<{segment: string}>;
}

type IntlWithSegmenter = typeof Intl & {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Segmenter: new (
    locale: string | undefined,
    options: {granularity: string},
  ) => GraphemeSegmenter;
};

@nodeName('TxtLeaf')
export class TxtLeaf extends Shape {
  @lazy(() => {
    try {
      return new (Intl as IntlWithSegmenter).Segmenter(undefined, {
        granularity: 'grapheme',
      });
    } catch {
      return null;
    }
  })
  protected static readonly segmenter: GraphemeSegmenter | null;

  @initial('')
  @interpolation(textLerp)
  @signal()
  public declare readonly text: SimpleSignal<string, this>;

  public constructor({children, ...rest}: TxtLeafProps) {
    super(rest);
    if (children) {
      this.text(children);
    }
    this.yogaNode.setMeasureFunc((width, widthMode) =>
      this.measureContent(width, widthMode),
    );
  }

  @computed()
  protected parentTxt() {
    const parent = this.parent();
    return parent instanceof Txt ? parent : null;
  }

  private measureContent(
    width: number,
    widthMode: number,
  ): {width: number; height: number} {
    const context = this.cacheCanvas();
    context.save();
    this.applyStyle(context);
    this.applyText(context);
    context.font = this.canvasFont();
    if ('letterSpacing' in context) {
      context.letterSpacing = `${this.letterSpacing()}px`;
    }

    const maxWidth = widthMode === MeasureMode.Undefined ? Infinity : width;
    const lines = this.breakTextIntoLines(context, this.text(), maxWidth);
    const lineHeight = this.resolvedLineHeight();

    let maxLineWidth = 0;
    for (const line of lines) {
      const w = context.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    }

    context.restore();

    return {
      width: maxLineWidth,
      height: lines.length * lineHeight,
    };
  }

  protected breakTextIntoLines(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string[] {
    const whiteSpace = this.resolvedWhiteSpace();
    const shouldWrap = whiteSpace !== 'nowrap' && whiteSpace !== 'pre';
    const preserveNewlines = whiteSpace === 'pre';

    if (!shouldWrap && !preserveNewlines) {
      return [text.replace(/\s+/g, ' ')];
    }

    if (preserveNewlines && !shouldWrap) {
      return text.split('\n');
    }

    const rawLines = preserveNewlines
      ? text.split('\n')
      : [text.replace(/\s+/g, ' ')];
    const result: string[] = [];

    for (const rawLine of rawLines) {
      const segments = TxtLeaf.segmenter
        ? Array.from(
            TxtLeaf.segmenter.segment(rawLine),
            (s: {segment: string}) => s.segment,
          )
        : rawLine.split('');

      let currentLine = '';

      for (const segment of segments) {
        const candidateLine = currentLine + segment;
        const candidateWidth = context.measureText(candidateLine).width;
        if (currentLine.length > 0 && candidateWidth > maxWidth) {
          result.push(currentLine);
          currentLine = segment;
        } else {
          currentLine = candidateLine;
        }
      }

      result.push(currentLine);
    }

    if (result.length === 0) {
      result.push('');
    }

    return result;
  }

  @computed()
  protected textLayout(): {
    lines: string[];
    lineHeight: number;
    fontOffset: number;
  } {
    const context = this.cacheCanvas();
    context.save();
    this.applyStyle(context);
    this.applyText(context);
    context.font = this.canvasFont();
    context.textBaseline = 'bottom';
    if ('letterSpacing' in context) {
      context.letterSpacing = `${this.letterSpacing()}px`;
    }

    const fontOffset = context.measureText('').fontBoundingBoxAscent;
    const lineHeight = this.resolvedLineHeight();
    const size = this.computedSize();
    const lines = this.breakTextIntoLines(context, this.text(), size.width);

    context.restore();
    return {lines, lineHeight, fontOffset};
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.requestFontUpdate();
    this.applyStyle(context);
    this.applyText(context);
    context.font = this.canvasFont();
    context.textBaseline = 'bottom';
    if ('letterSpacing' in context) {
      context.letterSpacing = `${this.letterSpacing()}px`;
    }

    const {lines, lineHeight, fontOffset} = this.textLayout();
    const {width, height} = this.size();

    const textAlign = this.textAlign();
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      const lineWidth = context.measureText(text).width;
      let x: number;
      switch (textAlign) {
        case 'center':
          x = -lineWidth / 2;
          break;
        case 'end':
        case 'right':
          x = width / 2 - lineWidth;
          break;
        case 'start':
        case 'left':
        default:
          x = -width / 2;
          break;
      }
      const y = -height / 2 + fontOffset + i * lineHeight;
      const box = new BBox(x, y, lineWidth, lineHeight);
      this.drawText(context, text, box);
    }
  }

  protected drawText(
    context: CanvasRenderingContext2D,
    text: string,
    box: BBox,
  ) {
    const whiteSpace = this.resolvedWhiteSpace();
    let rendered = text;
    if (whiteSpace !== 'pre') {
      rendered = rendered.replace(/\s+/g, ' ');
    }

    if (this.lineWidth() <= 0) {
      context.fillText(rendered, box.x, box.y);
    } else if (this.strokeFirst()) {
      context.strokeText(rendered, box.x, box.y);
      context.fillText(rendered, box.x, box.y);
    } else {
      context.fillText(rendered, box.x, box.y);
      context.strokeText(rendered, box.x, box.y);
    }
  }

  protected override getCacheBBox(): BBox {
    const size = this.computedSize();
    const lineWidth = this.lineWidth();
    const miterLimitCoefficient = this.lineJoin() === 'miter' ? 0.5 * 10 : 0.5;

    return new BBox(-size.width / 2, -size.height / 2, size.width, size.height)
      .expand([0, this.fontSize() * 0.5])
      .expand(lineWidth * miterLimitCoefficient);
  }

  protected override updateLayout() {
    this.applyFont();
    this.applyFlex();
    this.text();
    this.yogaNode.markDirty();
  }
}

[
  'fill',
  'stroke',
  'lineWidth',
  'strokeFirst',
  'lineCap',
  'lineJoin',
  'lineDash',
  'lineDashOffset',
].forEach(prop => {
  (TxtLeaf.prototype as any)[`get${capitalize(prop)}`] = function (
    this: TxtLeaf,
  ) {
    return (
      (this.parentTxt() as any)?.[prop]() ??
      (this as any)[prop].context.getInitial()
    );
  };
});
