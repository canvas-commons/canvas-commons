import {
  BBox,
  ColorSignal,
  PossibleColor,
  SerializedVector2,
  SignalValue,
  SimpleSignal,
  Vector2,
  clamp,
} from '@canvas-commons/core';
import {ArrowDrawer, defaultArrowDrawer} from '../curves/ArrowDrawer';
import {CurveDrawingInfo} from '../curves/CurveDrawingInfo';
import {CurvePoint} from '../curves/CurvePoint';
import {CurveProfile, profileToSVGPathData} from '../curves/CurveProfile';
import {getPointAtDistance} from '../curves/getPointAtDistance';
import {computed, initial, nodeName, signal} from '../decorators';
import {colorSignal} from '../decorators/colorSignal';
import {DesiredLength} from '../partials';
import {resolveCanvasStyle} from '../utils';
import {Shape, ShapeProps} from './Shape';

export interface CurveProps extends ShapeProps {
  /**
   * {@inheritDoc Curve.closed}
   */
  closed?: SignalValue<boolean>;
  /**
   * {@inheritDoc Curve.start}
   */
  start?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.startOffset}
   */
  startOffset?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.startArrow}
   */
  startArrow?: SignalValue<boolean | ArrowDrawer>;
  /**
   * {@inheritDoc Curve.end}
   */
  end?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.endOffset}
   */
  endOffset?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.endArrow}
   */
  endArrow?: SignalValue<boolean | ArrowDrawer>;
  /**
   * {@inheritDoc Curve.arrowSize}
   */
  arrowSize?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.tickLength}
   */
  tickLength?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.tickEvery}
   */
  tickEvery?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.tickOffset}
   */
  tickOffset?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.tickWidth}
   */
  tickWidth?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.tickColor}
   */
  tickColor?: SignalValue<PossibleColor>;
  /**
   * {@inheritDoc Curve.tickStart}
   */
  tickStart?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.tickEnd}
   */
  tickEnd?: SignalValue<number>;
}

@nodeName('Curve')
export abstract class Curve extends Shape {
  /**
   * Whether the curve should be closed.
   *
   * @remarks
   * Closed curves have their start and end points connected.
   */
  @initial(false)
  @signal()
  public declare readonly closed: SimpleSignal<boolean, this>;

  /**
   * A percentage from the start before which the curve should be clipped.
   *
   * @remarks
   * The portion of the curve that comes before the given percentage will be
   * made invisible.
   *
   * This property is usefully for animating the curve appearing on the screen.
   * The value of `0` means the very start of the curve (accounting for the
   * {@link startOffset}) while `1` means the very end (accounting for the
   * {@link endOffset}).
   */
  @initial(0)
  @signal()
  public declare readonly start: SimpleSignal<number, this>;

  /**
   * The offset in pixels from the start of the curve.
   *
   * @remarks
   * This property lets you specify where along the defined curve the actual
   * visible portion starts. For example, setting it to `20` will make the first
   * 20 pixels of the curve invisible.
   *
   * This property is useful for trimming the curve using a fixed distance.
   * If you want to animate the curve appearing on the screen, use {@link start}
   * instead.
   */
  @initial(0)
  @signal()
  public declare readonly startOffset: SimpleSignal<number, this>;

  /**
   * Whether and how to display an arrow at the start of the visible curve.
   *
   * @remarks
   * When set to `true`, the default arrow drawer is used. An {@link ArrowDrawer}
   * can be provided for custom arrow rendering. Use {@link arrowSize} to control
   * the size of the arrow.
   */
  @initial(false)
  @signal()
  public declare readonly startArrow: SimpleSignal<boolean | ArrowDrawer, this>;

  /**
   * A percentage from the start after which the curve should be clipped.
   *
   * @remarks
   * The portion of the curve that comes after the given percentage will be
   * made invisible.
   *
   * This property is usefully for animating the curve appearing on the screen.
   * The value of `0` means the very start of the curve (accounting for the
   * {@link startOffset}) while `1` means the very end (accounting for the
   * {@link endOffset}).
   */
  @initial(1)
  @signal()
  public declare readonly end: SimpleSignal<number, this>;

  /**
   * The offset in pixels from the end of the curve.
   *
   * @remarks
   * This property lets you specify where along the defined curve the actual
   * visible portion ends. For example, setting it to `20` will make the last
   * 20 pixels of the curve invisible.
   *
   * This property is useful for trimming the curve using a fixed distance.
   * If you want to animate the curve appearing on the screen, use {@link end}
   * instead.
   */
  @initial(0)
  @signal()
  public declare readonly endOffset: SimpleSignal<number, this>;

  /**
   * Whether and how to display an arrow at the end of the visible curve.
   *
   * @remarks
   * When set to `true`, the default arrow drawer is used. An {@link ArrowDrawer}
   * can be provided for custom arrow rendering. Use {@link arrowSize} to control
   * the size of the arrow.
   */
  @initial(false)
  @signal()
  public declare readonly endArrow: SimpleSignal<boolean | ArrowDrawer, this>;

  /**
   * Controls the size of the end and start arrows.
   *
   * @remarks
   * To make the arrows visible make sure to enable {@link startArrow} and/or
   * {@link endArrow}.
   */
  @initial(24)
  @signal()
  public declare readonly arrowSize: SimpleSignal<number, this>;

  /**
   * The total length of each tick mark perpendicular to the curve.
   *
   * @remarks
   * When set to `0`, no ticks are drawn. The tick extends equally in both
   * directions from the curve.
   */
  @initial(0)
  @signal()
  public declare readonly tickLength: SimpleSignal<number, this>;

  /**
   * The distance between consecutive tick marks along the curve.
   */
  @initial(100)
  @signal()
  public declare readonly tickEvery: SimpleSignal<number, this>;

  /**
   * The offset of the first tick mark from the start of the curve.
   */
  @initial(0)
  @signal()
  public declare readonly tickOffset: SimpleSignal<number, this>;

  /**
   * The stroke width of each tick mark.
   *
   * @remarks
   * Defaults to the curve's {@link Shape.lineWidth | lineWidth}.
   */
  @initial(null)
  @signal()
  public declare readonly tickWidth: SimpleSignal<number, this>;

  /**
   * The color of the tick marks.
   *
   * @remarks
   * Defaults to the curve's {@link Shape.stroke | stroke} color.
   */
  @initial(null)
  @colorSignal()
  public declare readonly tickColor: ColorSignal<this>;

  /**
   * A percentage along the curve before which no ticks are drawn.
   *
   * @remarks
   * Works together with {@link start} to determine the effective tick range.
   * The effective start is the larger of `start` and `tickStart`.
   */
  @initial(0)
  @signal()
  public declare readonly tickStart: SimpleSignal<number, this>;

  /**
   * A percentage along the curve after which no ticks are drawn.
   *
   * @remarks
   * Works together with {@link end} to determine the effective tick range.
   * The effective end is the smaller of `end` and `tickEnd`.
   */
  @initial(1)
  @signal()
  public declare readonly tickEnd: SimpleSignal<number, this>;

  protected getDefaultTickWidth() {
    return this.lineWidth();
  }

  protected getDefaultTickColor() {
    return this.stroke();
  }

  protected canHaveSubpath = false;

  protected override desiredSize(): SerializedVector2<DesiredLength> {
    return this.childrenBBox().size;
  }

  public constructor(props: CurveProps) {
    super(props);
  }

  protected abstract childrenBBox(): BBox;

  public abstract profile(): CurveProfile;

  /**
   * Convert a percentage along the curve to a distance.
   *
   * @remarks
   * The returned distance is given in relation to the full curve, not
   * accounting for {@link startOffset} and {@link endOffset}.
   *
   * @param value - The percentage along the curve.
   */
  public percentageToDistance(value: number): number {
    return clamp(
      0,
      this.baseArcLength(),
      this.startOffset() + this.offsetArcLength() * value,
    );
  }

  /**
   * Convert a distance along the curve to a percentage.
   *
   * @remarks
   * The distance should be given in relation to the full curve, not
   * accounting for {@link startOffset} and {@link endOffset}.
   *
   * @param value - The distance along the curve.
   */
  public distanceToPercentage(value: number): number {
    return (value - this.startOffset()) / this.offsetArcLength();
  }

  /**
   * The base arc length of this curve.
   *
   * @remarks
   * This is the entire length of this curve, not accounting for
   * {@link startOffset | the offsets}.
   */
  public baseArcLength() {
    return this.profile().arcLength;
  }

  /**
   * The offset arc length of this curve.
   *
   * @remarks
   * This is the length of the curve that accounts for
   * {@link startOffset | the offsets}.
   */
  public offsetArcLength() {
    const startOffset = this.startOffset();
    const endOffset = this.endOffset();
    const baseLength = this.baseArcLength();
    return clamp(0, baseLength, baseLength - startOffset - endOffset);
  }

  /**
   * The visible arc length of this curve.
   *
   * @remarks
   * This arc length accounts for both the offset and the {@link start} and
   * {@link end} properties.
   */
  @computed()
  public arcLength() {
    return this.offsetArcLength() * Math.abs(this.start() - this.end());
  }

  /**
   * The percentage of the curve that's currently visible.
   *
   * @remarks
   * The returned value is the ratio between the visible length (as defined by
   * {@link start} and {@link end}) and the offset length of the curve.
   */
  public completion(): number {
    return Math.abs(this.start() - this.end());
  }

  protected processSubpath(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _path: Path2D,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startPoint: Vector2 | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endPoint: Vector2 | null,
  ) {
    // do nothing
  }

  @computed()
  protected curveDrawingInfo(): CurveDrawingInfo {
    const path = new Path2D();
    let subpath = new Path2D();
    const profile = this.profile();

    let start = this.percentageToDistance(this.start());
    let end = this.percentageToDistance(this.end());
    if (start > end) {
      [start, end] = [end, start];
    }

    const distance = end - start;
    const arrowSize = Math.min(distance / 2, this.arrowSize());

    const startArrowValue = this.startArrow();
    const endArrowValue = this.endArrow();

    if (this.hasArrow(startArrowValue)) {
      start += this.arrowOffset(startArrowValue, arrowSize);
    }

    if (this.hasArrow(endArrowValue)) {
      end -= this.arrowOffset(endArrowValue, arrowSize);
    }

    let length = 0;
    let startPoint = null;
    let startTangent = null;
    let endPoint = null;
    let endTangent = null;
    for (const segment of profile.segments) {
      const previousLength = length;
      length += segment.arcLength;
      if (length < start) {
        continue;
      }

      const relativeStart = (start - previousLength) / segment.arcLength;
      const relativeEnd = (end - previousLength) / segment.arcLength;

      const clampedStart = clamp(0, 1, relativeStart);
      const clampedEnd = clamp(0, 1, relativeEnd);

      if (
        this.canHaveSubpath &&
        endPoint &&
        !segment.getPoint(0).position.equals(endPoint)
      ) {
        path.addPath(subpath);
        this.processSubpath(subpath, startPoint, endPoint);
        subpath = new Path2D();
        startPoint = null;
      }

      const [startCurvePoint, endCurvePoint] = segment.draw(
        subpath,
        clampedStart,
        clampedEnd,
        startPoint === null,
      );

      if (startPoint === null) {
        startPoint = startCurvePoint.position;
        startTangent = startCurvePoint.normal.flipped.perpendicular;
      }

      endPoint = endCurvePoint.position;
      endTangent = endCurvePoint.normal.flipped.perpendicular;
      if (length > end) {
        break;
      }
    }

    if (
      this.closed() &&
      this.start.isInitial() &&
      this.end.isInitial() &&
      this.startOffset.isInitial() &&
      this.endOffset.isInitial()
    ) {
      subpath.closePath();
    }
    this.processSubpath(subpath, startPoint, endPoint);
    path.addPath(subpath);

    return {
      startPoint: startPoint ?? Vector2.zero,
      startTangent: startTangent ?? Vector2.right,
      endPoint: endPoint ?? Vector2.zero,
      endTangent: endTangent ?? Vector2.right,
      arrowSize,
      path,
      startOffset: start,
    };
  }

  protected getPointAtDistance(value: number): CurvePoint {
    return getPointAtDistance(this.profile(), value + this.startOffset());
  }

  public getPointAtPercentage(value: number): CurvePoint {
    return getPointAtDistance(this.profile(), this.percentageToDistance(value));
  }

  /**
   * The positions of all tick marks along the curve.
   *
   * @remarks
   * Each entry contains the position, tangent, and normal at the tick's
   * location on the curve. This can be used to place labels or other elements
   * at tick positions.
   */
  @computed()
  public tickPositions(): CurvePoint[] {
    const tickLength = this.tickLength();
    if (tickLength <= 0) return [];

    const tickEvery = this.tickEvery();
    if (tickEvery <= 0) return [];

    const tickOffset = this.tickOffset();
    const startOffset = this.startOffset();
    const offsetLen = this.offsetArcLength();
    const startDist = this.percentageToDistance(
      Math.max(this.start(), this.tickStart()),
    );
    const endDist = this.percentageToDistance(
      Math.min(this.end(), this.tickEnd()),
    );
    const minDist = Math.min(startDist, endDist);
    const maxDist = Math.max(startDist, endDist);
    const result: CurvePoint[] = [];

    for (let d = tickOffset; d < offsetLen; d += tickEvery) {
      const absoluteDist = d + startOffset;
      if (absoluteDist < minDist || absoluteDist > maxDist) continue;
      result.push(this.getPointAtDistance(d));
    }

    return result;
  }

  protected override getComputedLayout(): BBox {
    return this.offsetComputedLayout(super.getComputedLayout());
  }

  protected offsetComputedLayout(box: BBox): BBox {
    box.position = box.position.sub(this.childrenBBox().center);
    return box;
  }

  protected override getPath(): Path2D {
    return this.curveDrawingInfo().path;
  }

  @computed()
  protected override getPathData(): string {
    return profileToSVGPathData(this.profile());
  }

  protected override getCacheBBox(): BBox {
    const box = this.childrenBBox();
    const arrowSize =
      this.hasArrow(this.startArrow()) || this.hasArrow(this.endArrow())
        ? this.arrowSize()
        : 0;
    const lineWidth = this.lineWidth();
    const tickExtent = this.tickLength() / 2;

    const coefficient = this.lineWidthCoefficient();

    return box.expand(
      Math.max(0, arrowSize, lineWidth * coefficient, tickExtent),
    );
  }

  protected lineWidthCoefficient(): number {
    return this.lineCap() === 'square' ? 0.5 * 1.4143 : 0.5;
  }

  /**
   * Check if the path requires a profile.
   *
   * @remarks
   * The profile is only required if certain features are used. Otherwise, the
   * profile generation can be skipped, and the curve can be drawn directly
   * using the 2D context.
   */
  protected requiresProfile(): boolean {
    return (
      !this.start.isInitial() ||
      !this.startOffset.isInitial() ||
      !this.startArrow.isInitial() ||
      !this.end.isInitial() ||
      !this.endOffset.isInitial() ||
      !this.endArrow.isInitial() ||
      this.tickLength() > 0
    );
  }

  protected override drawShape(context: CanvasRenderingContext2D) {
    super.drawShape(context);
    const startArrowValue = this.startArrow();
    const endArrowValue = this.endArrow();
    if (this.hasArrow(startArrowValue) || this.hasArrow(endArrowValue)) {
      this.drawArrows(context, startArrowValue, endArrowValue);
    }
    if (this.tickLength() > 0) {
      this.drawTicks(context);
    }
  }

  private hasArrow(value: boolean | ArrowDrawer): value is true | ArrowDrawer {
    return value !== false;
  }

  private getArrowDrawer(value: true | ArrowDrawer): ArrowDrawer {
    return value === true ? defaultArrowDrawer : value;
  }

  private arrowOffset(
    arrowValue: true | ArrowDrawer,
    arrowSize: number,
  ): number {
    const drawer = this.getArrowDrawer(arrowValue);
    return drawer.offset ? drawer.offset(arrowSize) : arrowSize / 2;
  }

  private drawArrows(
    context: CanvasRenderingContext2D,
    startArrowValue: boolean | ArrowDrawer,
    endArrowValue: boolean | ArrowDrawer,
  ) {
    const {startPoint, startTangent, endPoint, endTangent, arrowSize} =
      this.curveDrawingInfo();
    if (arrowSize < 0.001) {
      return;
    }

    const stroke = resolveCanvasStyle(this.stroke(), context);
    const lineWidth = this.lineWidth();

    context.save();
    context.beginPath();
    context.fillStyle = stroke;
    if (this.hasArrow(endArrowValue)) {
      this.getArrowDrawer(endArrowValue).draw({
        context,
        center: endPoint,
        tangent: endTangent.flipped,
        arrowSize,
        stroke,
        lineWidth,
      });
    }
    if (this.hasArrow(startArrowValue)) {
      this.getArrowDrawer(startArrowValue).draw({
        context,
        center: startPoint,
        tangent: startTangent,
        arrowSize,
        stroke,
        lineWidth,
      });
    }
    context.closePath();
    context.fill();
    context.restore();
  }

  private drawTicks(context: CanvasRenderingContext2D) {
    const tickLength = this.tickLength();
    const tickEvery = this.tickEvery();
    if (tickLength <= 0 || tickEvery <= 0) return;

    const tickOffset = this.tickOffset();
    const startOffset = this.startOffset();
    const offsetLen = this.offsetArcLength();
    const startDist = this.percentageToDistance(
      Math.max(this.start(), this.tickStart()),
    );
    const endDist = this.percentageToDistance(
      Math.min(this.end(), this.tickEnd()),
    );
    const minDist = Math.min(startDist, endDist);
    const maxDist = Math.max(startDist, endDist);
    const halfTick = tickLength / 2;

    context.save();
    context.strokeStyle = resolveCanvasStyle(this.tickColor(), context);
    context.lineWidth = this.tickWidth();
    context.lineCap = 'butt';

    for (let d = tickOffset; d < offsetLen; d += tickEvery) {
      const absoluteDist = d + startOffset;
      if (absoluteDist < minDist || absoluteDist > maxDist) continue;

      const endScale = clamp(0, 1, (maxDist - absoluteDist) / halfTick);
      const startScale = clamp(0, 1, (absoluteDist - minDist) / halfTick);
      const scale = Math.min(endScale, startScale);

      const point = this.getPointAtDistance(d);
      const normal = point.normal;
      const scaledHalf = halfTick * scale;

      context.beginPath();
      context.moveTo(
        point.position.x + normal.x * scaledHalf,
        point.position.y + normal.y * scaledHalf,
      );
      context.lineTo(
        point.position.x - normal.x * scaledHalf,
        point.position.y - normal.y * scaledHalf,
      );
      context.stroke();
    }

    context.restore();
  }
}
