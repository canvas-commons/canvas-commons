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
  useRandom,
} from '@canvas-commons/core';
import {computed, initial, nodeName, parser, signal} from '../decorators';
import {
  CanvasStyleSignal,
  canvasStyleSignal,
} from '../decorators/canvasStyleSignal';
import {PossibleCanvasStyle, RoughFillStyle} from '../partials';
import {
  PossibleShaderConfig,
  ShaderConfig,
  parseShader,
} from '../partials/ShaderConfig';
import {useScene2D} from '../scenes/useScene2D';
import {createRoughConfig, drawRoughPath, resolveCanvasStyle} from '../utils';
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

  /**
   * Enable rough.js rendering.
   */
  rough?: SignalValue<boolean>;
  /**
   * {@inheritDoc RoughConfig.roughness}
   */
  roughness?: SignalValue<number>;
  /**
   * {@inheritDoc RoughConfig.bowing}
   */
  bowing?: SignalValue<number>;
  /**
   * {@inheritDoc RoughConfig.fillStyle}
   */
  roughFillStyle?: SignalValue<RoughFillStyle>;
  /**
   * {@inheritDoc RoughConfig.fillWeight}
   */
  roughFillWeight?: SignalValue<number>;
  /**
   * {@inheritDoc RoughConfig.hachureAngle}
   */
  roughHachureAngle?: SignalValue<number>;
  /**
   * {@inheritDoc RoughConfig.hachureGap}
   */
  roughHachureGap?: SignalValue<number>;
  /**
   * {@inheritDoc RoughConfig.seed}
   */
  roughSeed?: SignalValue<number>;
  /**
   * {@inheritDoc RoughConfig.disableMultiStroke}
   */
  roughDisableMultiStroke?: SignalValue<boolean>;
  /**
   * {@inheritDoc RoughConfig.disableMultiStrokeFill}
   */
  roughDisableMultiStrokeFill?: SignalValue<boolean>;
}

@nodeName('Shape')
export abstract class Shape extends Layout {
  @canvasStyleSignal()
  declare public readonly fill: CanvasStyleSignal<this>;
  @canvasStyleSignal()
  declare public readonly stroke: CanvasStyleSignal<this>;
  @initial(false)
  @signal()
  declare public readonly strokeFirst: SimpleSignal<boolean, this>;
  @initial(0)
  @signal()
  declare public readonly lineWidth: SimpleSignal<number, this>;
  @initial('miter')
  @signal()
  declare public readonly lineJoin: SimpleSignal<CanvasLineJoin, this>;
  @initial('butt')
  @signal()
  declare public readonly lineCap: SimpleSignal<CanvasLineCap, this>;
  @initial([])
  @signal()
  declare public readonly lineDash: SimpleSignal<number[], this>;
  @initial(0)
  @signal()
  declare public readonly lineDashOffset: SimpleSignal<number, this>;
  @initial(true)
  @signal()
  declare public readonly antialiased: SimpleSignal<boolean, this>;

  // Rough.js signals
  /**
   * Enable rough.js rendering.
   */
  @initial(false)
  @signal()
  declare public readonly rough: SimpleSignal<boolean, this>;
  /**
   * {@inheritDoc RoughConfig.roughness}
   */
  @initial(1)
  @signal()
  declare public readonly roughness: SimpleSignal<number, this>;
  /**
   * {@inheritDoc RoughConfig.bowing}
   */
  @initial(1)
  @signal()
  declare public readonly bowing: SimpleSignal<number, this>;
  /**
   * {@inheritDoc RoughConfig.fillStyle}
   */
  @initial('hachure')
  @signal()
  declare public readonly roughFillStyle: SimpleSignal<RoughFillStyle, this>;
  /**
   * {@inheritDoc RoughConfig.fillWeight}
   */
  @signal()
  declare public readonly roughFillWeight: SimpleSignal<
    number | undefined,
    this
  >;
  /**
   * {@inheritDoc RoughConfig.hachureAngle}
   */
  @initial(-41)
  @signal()
  declare public readonly roughHachureAngle: SimpleSignal<number, this>;
  /**
   * {@inheritDoc RoughConfig.hachureGap}
   */
  @initial(4)
  @signal()
  declare public readonly roughHachureGap: SimpleSignal<number, this>;
  /**
   * {@inheritDoc RoughConfig.seed}
   */
  @signal()
  declare public readonly roughSeed: SimpleSignal<number | undefined, this>;
  /**
   * {@inheritDoc RoughConfig.disableMultiStroke}
   */
  @initial(false)
  @signal()
  declare public readonly roughDisableMultiStroke: SimpleSignal<boolean, this>;
  /**
   * {@inheritDoc RoughConfig.disableMultiStrokeFill}
   */
  @initial(false)
  @signal()
  declare public readonly roughDisableMultiStrokeFill: SimpleSignal<
    boolean,
    this
  >;

  /**
   * @experimental
   */
  @initial([])
  @parser(parseShader)
  @signal()
  declare public readonly fillShaders: Signal<
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
    if (props.roughSeed === undefined) {
      this.roughSeed(useRandom().nextInt(0, Number.MAX_SAFE_INTEGER));
    }
  }

  protected applyText(context: CanvasRenderingContext2D) {
    context.direction = this.textDirection();
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
    if (this.rough()) {
      this.drawShapeRough(context);
    } else {
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
            this.renderFromSource(context, result, 0, 0);
          }
        }

        if (!this.strokeFirst()) {
          context.translate(
            this.absolutePosition().x,
            this.absolutePosition().y,
          );
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

  protected drawShapeRough(context: CanvasRenderingContext2D) {
    const pathData = this.getPathData();
    if (!pathData) {
      return;
    }

    context.save();

    if (!this.antialiased()) {
      context.filter =
        'url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxmaWx0ZXIgaWQ9ImZpbHRlciIgeD0iMCIgeT0iMCIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzPSJzUkdCIj48ZmVDb21wb25lbnRUcmFuc2Zlcj48ZmVGdW5jUiB0eXBlPSJpZGVudGl0eSIvPjxmZUZ1bmNHIHR5cGU9ImlkZW50aXR5Ii8+PGZlRnVuY0IgdHlwZT0iaWRlbnRpdHkiLz48ZmVGdW5jQSB0eXBlPSJkaXNjcmV0ZSIgdGFibGVWYWx1ZXM9IjAgMSIvPjwvZmVDb21wb25lbnRUcmFuc2Zlcj48L2ZpbHRlcj48L3N2Zz4=#filter)';
    }

    const seed = this.roughSeed();
    if (seed === undefined) {
      context.restore();
      return;
    }

    const roughConfig = createRoughConfig(
      this.roughness(),
      this.bowing(),
      this.roughFillStyle(),
      this.roughFillWeight(),
      this.roughHachureAngle(),
      this.roughHachureGap(),
      seed,
      this.roughDisableMultiStroke(),
      this.roughDisableMultiStrokeFill(),
    );

    drawRoughPath(
      context,
      pathData,
      roughConfig,
      this.fill(),
      this.stroke(),
      this.lineWidth(),
    );

    context.restore();
  }

  protected override getCacheBBox(): BBox {
    return super.getCacheBBox().expand(this.lineWidth() / 2);
  }

  @computed()
  protected getPath(): Path2D {
    return new Path2D();
  }

  /**
   * Get the SVG path data string for this shape.
   *
   * @remarks
   * This method returns an SVG path data string that represents the shape's
   * geometry. The default implementation returns an empty string. Subclasses
   * should override this method to provide their actual path data.
   *
   * The path data can be used to create Path2D objects, passed to Rough.js,
   * or used for SVG export.
   *
   * @returns An SVG path data string (e.g., "M 0 0 L 100 100 Z")
   */
  @computed()
  protected getPathData(): string {
    return '';
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
