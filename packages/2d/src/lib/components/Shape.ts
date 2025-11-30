import {
  BBox,
  Direction,
  SignalValue,
  SimpleSignal,
  TimingFunction,
  all,
  createSignal,
  easeInOutCubic,
  easeOutExpo,
  linear,
  map,
  threadable,
  useRandom,
} from '@canvas-commons/core';
import {computed, initial, nodeName, signal} from '../decorators';
import {
  CanvasStyleSignal,
  canvasStyleSignal,
} from '../decorators/canvasStyleSignal';
import {PossibleCanvasStyle, RoughFillStyle} from '../partials';
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

  // Rough.js signals
  /**
   * Enable rough.js rendering.
   */
  @initial(false)
  @signal()
  public declare readonly rough: SimpleSignal<boolean, this>;
  /**
   * {@inheritDoc RoughConfig.roughness}
   */
  @initial(1)
  @signal()
  public declare readonly roughness: SimpleSignal<number, this>;
  /**
   * {@inheritDoc RoughConfig.bowing}
   */
  @initial(1)
  @signal()
  public declare readonly bowing: SimpleSignal<number, this>;
  /**
   * {@inheritDoc RoughConfig.fillStyle}
   */
  @initial('hachure')
  @signal()
  public declare readonly roughFillStyle: SimpleSignal<RoughFillStyle, this>;
  /**
   * {@inheritDoc RoughConfig.fillWeight}
   */
  @signal()
  public declare readonly roughFillWeight: SimpleSignal<
    number | undefined,
    this
  >;
  /**
   * {@inheritDoc RoughConfig.hachureAngle}
   */
  @initial(-41)
  @signal()
  public declare readonly roughHachureAngle: SimpleSignal<number, this>;
  /**
   * {@inheritDoc RoughConfig.hachureGap}
   */
  @initial(4)
  @signal()
  public declare readonly roughHachureGap: SimpleSignal<number, this>;
  /**
   * {@inheritDoc RoughConfig.seed}
   */
  @signal()
  public declare readonly roughSeed: SimpleSignal<number | undefined, this>;
  /**
   * {@inheritDoc RoughConfig.disableMultiStroke}
   */
  @initial(false)
  @signal()
  public declare readonly roughDisableMultiStroke: SimpleSignal<boolean, this>;
  /**
   * {@inheritDoc RoughConfig.disableMultiStrokeFill}
   */
  @initial(false)
  @signal()
  public declare readonly roughDisableMultiStrokeFill: SimpleSignal<
    boolean,
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
    if (this.rough()) {
      this.drawShapeRough(context);
    } else {
      const path = this.getPath();
      const hasStroke = this.lineWidth() > 0 && this.stroke() !== null;
      const hasFill = this.fill() !== null;
      context.save();
      this.applyStyle(context);
      this.drawRipple(context);
      if (this.strokeFirst()) {
        hasStroke && context.stroke(path);
        hasFill && context.fill(path);
      } else {
        hasFill && context.fill(path);
        hasStroke && context.stroke(path);
      }
      context.restore();
    }
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

  /**
   * Animate the node fading in (opacity from 0 to 1).
   *
   * @param duration - The duration of the animation.
   * @param timingFunction - The timing function to use.
   */
  @threadable()
  public *fadeIn(duration = 0.6, timingFunction: TimingFunction = linear) {
    this.opacity(0);
    yield* this.opacity(1, duration, timingFunction);
  }

  /**
   * Animate the node fading out (opacity from 1 to 0).
   *
   * @param duration - The duration of the animation.
   * @param timingFunction - The timing function to use.
   */
  @threadable()
  public *fadeOut(duration = 0.6, timingFunction: TimingFunction = linear) {
    this.opacity(1);
    yield* this.opacity(0, duration, timingFunction);
  }

  /**
   * Animate the node pushing in from a direction.
   *
   * @param duration - The duration of the animation.
   * @param direction - The direction to push in from.
   * @param distance - The distance to push from (default: 100).
   * @param timingFunction - The timing function to use.
   */
  @threadable()
  public *pushIn(
    duration = 0.6,
    direction: Direction = Direction.Left,
    distance = 100,
    timingFunction: TimingFunction = easeInOutCubic,
  ) {
    const startPos = this.position();
    let offsetX = 0;
    let offsetY = 0;

    switch (direction) {
      case Direction.Left:
        offsetX = -distance;
        break;
      case Direction.Right:
        offsetX = distance;
        break;
      case Direction.Top:
        offsetY = -distance;
        break;
      case Direction.Bottom:
        offsetY = distance;
        break;
    }

    this.position([startPos.x + offsetX, startPos.y + offsetY]);
    this.opacity(0);
    yield* all(
      this.position(startPos, duration, timingFunction),
      this.opacity(1, duration, timingFunction),
    );
  }

  /**
   * Animate the node pushing out to a direction.
   *
   * @param duration - The duration of the animation.
   * @param direction - The direction to push out to.
   * @param distance - The distance to push to (default: 100).
   * @param timingFunction - The timing function to use.
   */
  @threadable()
  public *pushOut(
    duration = 0.6,
    direction: Direction = Direction.Right,
    distance = 100,
    timingFunction: TimingFunction = easeInOutCubic,
  ) {
    const startPos = this.position();
    let offsetX = 0;
    let offsetY = 0;

    switch (direction) {
      case Direction.Left:
        offsetX = -distance;
        break;
      case Direction.Right:
        offsetX = distance;
        break;
      case Direction.Top:
        offsetY = -distance;
        break;
      case Direction.Bottom:
        offsetY = distance;
        break;
    }

    this.opacity(1);
    yield* all(
      this.position([startPos.x + offsetX, startPos.y + offsetY], duration, timingFunction),
      this.opacity(0, duration, timingFunction),
    );
    this.position(startPos);
  }

  /**
   * Animate the node scaling and fading in simultaneously.
   * The node starts at a smaller scale and zero opacity, then animates to full size and opacity.
   *
   * @param duration - The duration of the animation.
   * @param initialScale - The initial scale factor (default: 0.8).
   * @param timingFunction - The timing function to use.
   */
  @threadable()
  public *popIn(
    duration = 0.6,
    initialScale = 0.8,
    timingFunction: TimingFunction = easeInOutCubic,
  ) {
    const targetScale = this.scale();
    this.scale(targetScale.mul(initialScale));
    this.opacity(0);
    yield* all(
      this.scale(targetScale, duration, timingFunction),
      this.opacity(1, duration, timingFunction),
    );
  }

  /**
   * Animate the node scaling and fading out simultaneously.
   * The node shrinks and fades to zero opacity.
   *
   * @param duration - The duration of the animation.
   * @param targetScale - The target scale factor (default: 0.8).
   * @param timingFunction - The timing function to use.
   */
  @threadable()
  public *popOut(
    duration = 0.6,
    targetScale = 0.8,
    timingFunction: TimingFunction = easeInOutCubic,
  ) {
    const originalScale = this.scale();
    this.opacity(1);
    yield* all(
      this.scale(originalScale.mul(targetScale), duration, timingFunction),
      this.opacity(0, duration, timingFunction),
    );
    this.scale(originalScale);
  }

  /**
   * Animate the node expanding from a direction (like a curtain opening).
   * E.g., Direction.Left means the node expands from left to right.
   *
   * @param duration - The duration of the animation.
   * @param direction - The direction to expand from.
   * @param timingFunction - The timing function to use.
   */
  @threadable()
  public *squashIn(
    duration = 0.6,
    direction: Direction = Direction.Left,
    timingFunction: TimingFunction = easeInOutCubic,
  ) {
    const originalScale = this.scale();
    const originalPos = this.position();
    const size = this.computedSize();

    if (direction === Direction.Left) {
      // Expand from left to right
      const offsetX = -size.width / 2;
      this.scale([0, originalScale.y]);
      this.position([originalPos.x + offsetX, originalPos.y]);
      yield* all(
        this.scale(originalScale, duration, timingFunction),
        this.position(originalPos, duration, timingFunction),
      );
    } else if (direction === Direction.Right) {
      // Expand from right to left
      const offsetX = size.width / 2;
      this.scale([0, originalScale.y]);
      this.position([originalPos.x + offsetX, originalPos.y]);
      yield* all(
        this.scale(originalScale, duration, timingFunction),
        this.position(originalPos, duration, timingFunction),
      );
    } else if (direction === Direction.Top) {
      // Expand from top to bottom
      const offsetY = -size.height / 2;
      this.scale([originalScale.x, 0]);
      this.position([originalPos.x, originalPos.y + offsetY]);
      yield* all(
        this.scale(originalScale, duration, timingFunction),
        this.position(originalPos, duration, timingFunction),
      );
    } else {
      // Direction.Bottom: Expand from bottom to top
      const offsetY = size.height / 2;
      this.scale([originalScale.x, 0]);
      this.position([originalPos.x, originalPos.y + offsetY]);
      yield* all(
        this.scale(originalScale, duration, timingFunction),
        this.position(originalPos, duration, timingFunction),
      );
    }
  }

  /**
   * Animate the node collapsing towards a direction (like a curtain closing).
   * E.g., Direction.Right means the node collapses from left to right (left side disappears first).
   *
   * @param duration - The duration of the animation.
   * @param direction - The direction to collapse towards.
   * @param timingFunction - The timing function to use.
   */
  @threadable()
  public *squashOut(
    duration = 0.6,
    direction: Direction = Direction.Right,
    timingFunction: TimingFunction = easeInOutCubic,
  ) {
    const originalScale = this.scale();
    const originalPos = this.position();
    const size = this.computedSize();

    if (direction === Direction.Left) {
      // Collapse towards left
      const offsetX = -size.width / 2;
      yield* all(
        this.scale([0, originalScale.y], duration, timingFunction),
        this.position([originalPos.x + offsetX, originalPos.y], duration, timingFunction),
      );
    } else if (direction === Direction.Right) {
      // Collapse towards right
      const offsetX = size.width / 2;
      yield* all(
        this.scale([0, originalScale.y], duration, timingFunction),
        this.position([originalPos.x + offsetX, originalPos.y], duration, timingFunction),
      );
    } else if (direction === Direction.Top) {
      // Collapse towards top
      const offsetY = -size.height / 2;
      yield* all(
        this.scale([originalScale.x, 0], duration, timingFunction),
        this.position([originalPos.x, originalPos.y + offsetY], duration, timingFunction),
      );
    } else {
      // Direction.Bottom: Collapse towards bottom
      const offsetY = size.height / 2;
      yield* all(
        this.scale([originalScale.x, 0], duration, timingFunction),
        this.position([originalPos.x, originalPos.y + offsetY], duration, timingFunction),
      );
    }
    this.scale(originalScale);
    this.position(originalPos);
  }

  /**
   * Animate the node expanding in from one direction, then collapsing out towards another direction.
   * E.g., squashInOut with inDirection=Left and outDirection=Right means:
   * expand from left to right, then collapse from left to right (disappear towards right).
   *
   * @param duration - The total duration of the animation (half for in, half for out).
   * @param inDirection - The direction to expand from.
   * @param outDirection - The direction to collapse towards.
   * @param timingFunction - The timing function to use.
   */
  @threadable()
  public *squashInOut(
    duration = 1.2,
    inDirection: Direction = Direction.Left,
    outDirection: Direction = Direction.Right,
    timingFunction: TimingFunction = easeInOutCubic,
  ) {
    const halfDuration = duration / 2;
    yield* this.squashIn(halfDuration, inDirection, timingFunction);
    yield* this.squashOut(halfDuration, outDirection, timingFunction);
  }
}
