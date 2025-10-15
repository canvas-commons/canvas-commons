import {
  BBox,
  Signal,
  SignalValue,
  SimpleSignal,
  UNIFORM_DESTINATION_MATRIX,
  UNIFORM_FRAME,
  UNIFORM_SOURCE_MATRIX,
  UNIFORM_TIME,
  createSignal,
  easeOutExpo,
  linear,
  map,
  threadable,
  unwrap,
} from '@canvas-commons/core';
import {computed, initial, nodeName, parser, signal} from '../decorators';
import {
  CanvasStyleSignal,
  canvasStyleSignal,
} from '../decorators/canvasStyleSignal';
import {PossibleCanvasStyle} from '../partials';
import {
  PossibleShaderConfig,
  ShaderConfig,
  parseShader,
} from '../partials/ShaderConfig';
import {useScene2D} from '../scenes/useScene2D';
import {resolveCanvasStyle} from '../utils';
import {Layout, LayoutProps} from './Layout';

export interface ShapeProps extends LayoutProps {
  fill?: SignalValue<PossibleCanvasStyle>;
  stroke?: SignalValue<PossibleCanvasStyle>;
  strokeFirst?: SignalValue<boolean>;
  lineWidth?: SignalValue<number>;
  lineJoin?: SignalValue<CanvasLineJoin>;
  lineCap?: SignalValue<CanvasLineCap>;
  lineDash?: SignalValue<number[]>;
  lineDashOffset?: SignalValue<number>;
  antialiased?: SignalValue<boolean>;
  fillShaders?: PossibleShaderConfig;
}

@nodeName('Shape')
export abstract class Shape extends Layout {
  @canvasStyleSignal()
  public declare readonly fill: CanvasStyleSignal<this>;
  @canvasStyleSignal()
  public declare readonly stroke: CanvasStyleSignal<this>;
  @initial(false)
  @signal()
  public declare readonly strokeFirst: SimpleSignal<boolean, this>;
  @initial(0)
  @signal()
  public declare readonly lineWidth: SimpleSignal<number, this>;
  @initial('miter')
  @signal()
  public declare readonly lineJoin: SimpleSignal<CanvasLineJoin, this>;
  @initial('butt')
  @signal()
  public declare readonly lineCap: SimpleSignal<CanvasLineCap, this>;
  @initial([])
  @signal()
  public declare readonly lineDash: SimpleSignal<number[], this>;
  @initial(0)
  @signal()
  public declare readonly lineDashOffset: SimpleSignal<number, this>;
  @initial(true)
  @signal()
  public declare readonly antialiased: SimpleSignal<boolean, this>;

  /**
   * @experimental
   */
  @initial([])
  @parser(parseShader)
  @signal()
  public declare readonly fillShaders: Signal<
    PossibleShaderConfig,
    ShaderConfig[],
    this
  >;

  protected readonly rippleStrength = createSignal<number, this>(0);

  @computed()
  protected rippleSize() {
    return easeOutExpo(this.rippleStrength(), 0, 50);
  }

  public constructor(props: ShapeProps) {
    super(props);
  }

  protected applyText(context: CanvasRenderingContext2D) {
    context.direction = this.textDirection();
    this.element.dir = this.textDirection();
  }

  protected applyStyle(context: CanvasRenderingContext2D) {
    context.fillStyle = resolveCanvasStyle(this.fill(), context);
    context.strokeStyle = resolveCanvasStyle(this.stroke(), context);
    context.lineWidth = this.lineWidth();
    context.lineJoin = this.lineJoin();
    context.lineCap = this.lineCap();
    context.setLineDash(this.lineDash());
    context.lineDashOffset = this.lineDashOffset();
    if (!this.antialiased()) {
      // from https://stackoverflow.com/a/68372384
      context.filter =
        'url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxmaWx0ZXIgaWQ9ImZpbHRlciIgeD0iMCIgeT0iMCIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzPSJzUkdCIj48ZmVDb21wb25lbnRUcmFuc2Zlcj48ZmVGdW5jUiB0eXBlPSJpZGVudGl0eSIvPjxmZUZ1bmNHIHR5cGU9ImlkZW50aXR5Ii8+PGZlRnVuY0IgdHlwZT0iaWRlbnRpdHkiLz48ZmVGdW5jQSB0eXBlPSJkaXNjcmV0ZSIgdGFibGVWYWx1ZXM9IjAgMSIvPjwvZmVDb21wb25lbnRUcmFuc2Zlcj48L2ZpbHRlcj48L3N2Zz4=#filter)';
    }
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawShape(context);
    if (this.clip()) {
      context.clip(this.getPath());
    }
    this.drawChildren(context);
  }

  protected drawShape(context: CanvasRenderingContext2D) {
    const path = this.getPath();
    const hasStroke = this.lineWidth() > 0 && this.stroke() !== null;
    const hasFill = this.fill() !== null;

    const fillShaders = this.fillShaders();

    context.save();
    this.applyStyle(context);
    this.drawRipple(context);

    if (fillShaders.length > 0 && hasFill) {
      if (this.strokeFirst()) {
        hasStroke && context.stroke(path);
      }

      const fillCanvas = this.renderFillToCanvas();
      if (fillCanvas) {
        const result = this.shapeShaderCanvas(
          context.canvas,
          fillCanvas,
          fillShaders,
        );
        if (result) {
          context.save();
          this.renderFromSource(context, result, 0, 0);
          context.restore();
        }
      }

      if (!this.strokeFirst()) {
        hasStroke && context.stroke(path);
      }
    } else {
      if (this.strokeFirst()) {
        hasStroke && context.stroke(path);
        hasFill && context.fill(path);
      } else {
        hasFill && context.fill(path);
        hasStroke && context.stroke(path);
      }
    }
    context.restore();
  }

  private renderFillToCanvas(): HTMLCanvasElement | null {
    const fill = this.fill();
    if (fill === null) return null;

    const bbox = this.cacheBBox();
    if (bbox.width === 0 || bbox.height === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(bbox.width);
    canvas.height = Math.ceil(bbox.height);

    const context = canvas.getContext('2d');
    context?.translate(-bbox.x, -bbox.y);
    this.applyStyle(context!);

    const path = this.getPath();
    context?.fill(path);

    return canvas;
  }

  private shapeShaderCanvas(
    destination: TexImageSource,
    source: TexImageSource,
    shaders: ShaderConfig[],
  ) {
    if (shaders.length === 0) return null;

    const scene = useScene2D();
    const size = scene.getRealSize();
    const parentCacheRect = this.parentWorldSpaceCacheBBox();
    const cameraToWorld = new DOMMatrix()
      .scaleSelf(
        size.width / parentCacheRect.width,
        size.height / -parentCacheRect.height,
      )
      .translateSelf(
        parentCacheRect.x / -size.width,
        parentCacheRect.y / size.height - 1,
      );

    const cacheRect = this.worldSpaceCacheBBox();
    const cameraToCache = new DOMMatrix()
      .scaleSelf(size.width / cacheRect.width, size.height / -cacheRect.height)
      .translateSelf(cacheRect.x / -size.width, cacheRect.y / size.height - 1)
      .invertSelf();

    const gl = scene.shaders.getGL();
    scene.shaders.copyTextures(destination, source);
    scene.shaders.clear();

    for (const shader of shaders) {
      const program = scene.shaders.getProgram(shader.fragment);
      if (!program) continue;

      if (shader.uniforms) {
        for (const [name, uniform] of Object.entries(shader.uniforms)) {
          const location = gl.getUniformLocation(program, name);
          if (location === null) continue;

          const value = unwrap(uniform);
          if (typeof value === 'number') gl.uniform1f(location, value);
          else if ('toUniform' in value) value.toUniform(gl, location);
          else if (value.length === 1) gl.uniform1f(location, value[0]);
          else if (value.length === 2) {
            gl.uniform2f(location, value[0], value[1]);
          } else if (value.length === 3) {
            gl.uniform3f(location, value[0], value[1], value[2]);
          } else if (value.length === 4) {
            gl.uniform4f(location, value[0], value[1], value[2], value[3]);
          }
        }
      }

      gl.uniform1f(
        gl.getUniformLocation(program, UNIFORM_TIME),
        this.view2D.globalTime(),
      );
      gl.uniform1i(
        gl.getUniformLocation(program, UNIFORM_FRAME),
        scene.playback.frame,
      );
      gl.uniformMatrix4fv(
        gl.getUniformLocation(program, UNIFORM_SOURCE_MATRIX),
        false,
        cameraToCache.toFloat32Array(),
      );
      gl.uniformMatrix4fv(
        gl.getUniformLocation(program, UNIFORM_DESTINATION_MATRIX),
        false,
        cameraToWorld.toFloat32Array(),
      );

      shader.setup?.(gl, program);
      scene.shaders.render();
      shader.teardown?.(gl, program);
    }

    return gl.canvas;
  }

  protected override getCacheBBox(): BBox {
    return super.getCacheBBox().expand(this.lineWidth() / 2);
  }

  @computed()
  protected getPath(): Path2D {
    return new Path2D();
  }

  protected getRipplePath(): Path2D {
    return new Path2D();
  }

  protected drawRipple(context: CanvasRenderingContext2D) {
    const rippleStrength = this.rippleStrength();
    if (rippleStrength > 0) {
      const ripplePath = this.getRipplePath();
      context.save();
      context.globalAlpha *= map(0.54, 0, rippleStrength);
      context.fill(ripplePath);
      context.restore();
    }
  }

  @threadable()
  public *ripple(duration = 1) {
    this.rippleStrength(0);
    yield* this.rippleStrength(1, duration, linear);
    this.rippleStrength(0);
  }
}
