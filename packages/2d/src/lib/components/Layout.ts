import {
  BBox,
  DEFAULT,
  Direction,
  InterpolationFunction,
  Origin,
  PossibleSpacing,
  PossibleVector2,
  SerializedVector2,
  Signal,
  SignalValue,
  SimpleSignal,
  Spacing,
  SpacingSignal,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  Vector2Signal,
  boolLerp,
  deepLerp,
  modify,
  originToOffset,
  threadable,
  tween,
  unwrap,
} from '@canvas-commons/core';
import {
  Vector2LengthSignal,
  addInitializer,
  cloneable,
  computed,
  defaultStyle,
  initial,
  interpolation,
  nodeName,
  signal,
  vector2Signal,
  wrapper,
} from '../decorators';
import {spacingSignal} from '../decorators/spacingSignal';
import {
  LayoutPositionSignal,
  LayoutPositionSignalContext,
} from '../decorators/transformSignals';
import {
  DesiredLength,
  FlexBasis,
  FlexContent,
  FlexDirection,
  FlexItems,
  FlexWrap,
  LayoutMode,
  Length,
  LengthLimit,
  TextAlign,
  TextWrap,
  VerticalAlign,
  WordBreak,
} from '../partials';
import {buildCanvasFontString, resolveLineHeight} from '../text';
import {drawLine, drawPivot, is} from '../utils';
import {
  PositionType,
  createYogaNode,
  setYogaDimension,
  setYogaFlexBasis,
  setYogaGap,
  setYogaSpacing,
  toYogaAlignContent,
  toYogaAlignItems,
  toYogaFlexDirection,
  toYogaFlexWrap,
  toYogaJustifyContent,
  type YogaNode,
} from '../utils/yoga';
import {Node, NodeProps} from './Node';

export interface LayoutProps extends NodeProps {
  layout?: LayoutMode;
  /**
   * Whether this node participates in its parent's flex layout. When
   * `null` (the default), falls back to {@link layout}.
   */
  layoutSelf?: LayoutMode;
  /**
   * Whether this node lays out its own children with flex. When `null`
   * (the default), falls back to {@link layout}.
   */
  layoutChildren?: LayoutMode;

  width?: SignalValue<Length>;
  height?: SignalValue<Length>;
  maxWidth?: SignalValue<LengthLimit>;
  maxHeight?: SignalValue<LengthLimit>;
  minWidth?: SignalValue<LengthLimit>;
  minHeight?: SignalValue<LengthLimit>;
  ratio?: SignalValue<number>;

  marginTop?: SignalValue<number>;
  marginBottom?: SignalValue<number>;
  marginLeft?: SignalValue<number>;
  marginRight?: SignalValue<number>;
  margin?: SignalValue<PossibleSpacing>;

  paddingTop?: SignalValue<number>;
  paddingBottom?: SignalValue<number>;
  paddingLeft?: SignalValue<number>;
  paddingRight?: SignalValue<number>;
  padding?: SignalValue<PossibleSpacing>;

  direction?: SignalValue<FlexDirection>;
  basis?: SignalValue<FlexBasis>;
  grow?: SignalValue<number>;
  shrink?: SignalValue<number>;
  wrap?: SignalValue<FlexWrap>;

  justifyContent?: SignalValue<FlexContent>;
  alignContent?: SignalValue<FlexContent>;
  alignItems?: SignalValue<FlexItems>;
  alignSelf?: SignalValue<FlexItems>;
  rowGap?: SignalValue<Length>;
  columnGap?: SignalValue<Length>;
  gap?: SignalValue<PossibleVector2<Length>>;

  fontFamily?: SignalValue<string>;
  fontSize?: SignalValue<number>;
  fontStyle?: SignalValue<string>;
  fontWeight?: SignalValue<number>;
  lineHeight?: SignalValue<Length>;
  letterSpacing?: SignalValue<number>;
  textWrap?: SignalValue<TextWrap>;
  textDirection?: SignalValue<CanvasDirection>;
  textAlign?: SignalValue<TextAlign>;
  verticalAlign?: SignalValue<VerticalAlign>;
  wordBreak?: SignalValue<WordBreak>;

  size?: SignalValue<PossibleVector2<Length>>;
  anchorX?: SignalValue<number>;
  anchorY?: SignalValue<number>;
  anchor?: SignalValue<PossibleVector2>;
  translateX?: SignalValue<number>;
  translateY?: SignalValue<number>;
  translate?: SignalValue<PossibleVector2>;
  /**
   * The position of the center of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the center ends
   * up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   * When {@link anchor} is not set, this will be the same as the
   * {@link NodeProps.position}.
   */
  middle?: SignalValue<PossibleVector2>;
  /**
   * The position of the top edge of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the top edge
   * ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  top?: SignalValue<PossibleVector2>;
  /**
   * The position of the bottom edge of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the bottom edge
   * ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  bottom?: SignalValue<PossibleVector2>;
  /**
   * The position of the left edge of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the left edge
   * ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  left?: SignalValue<PossibleVector2>;
  /**
   * The position of the right edge of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the right edge
   * ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  right?: SignalValue<PossibleVector2>;
  /**
   * The position of the top left corner of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the top left
   * corner ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  topLeft?: SignalValue<PossibleVector2>;
  /**
   * The position of the top right corner of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the top right
   * corner ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  topRight?: SignalValue<PossibleVector2>;
  /**
   * The position of the bottom left corner of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the bottom left
   * corner ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  bottomLeft?: SignalValue<PossibleVector2>;
  /**
   * The position of the bottom right corner of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the bottom
   * right corner ends up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   */
  bottomRight?: SignalValue<PossibleVector2>;
  clip?: SignalValue<boolean>;
}

@nodeName('Layout')
export class Layout extends Node {
  @initial(null)
  @interpolation(boolLerp)
  @signal()
  declare public readonly layout: SimpleSignal<LayoutMode, this>;

  /**
   * Whether this node participates in its parent's flex layout. Use
   * {@link layoutEnabled} to read the resolved mode.
   */
  @initial(null)
  @interpolation(boolLerp)
  @signal()
  declare public readonly layoutSelf: SimpleSignal<LayoutMode, this>;

  /**
   * Whether this node lays out its own children with flex. Use
   * {@link canLayoutChildren} to read the resolved mode.
   */
  @initial(null)
  @interpolation(boolLerp)
  @signal()
  declare public readonly layoutChildren: SimpleSignal<LayoutMode, this>;

  @initial(null)
  @signal()
  declare public readonly maxWidth: SimpleSignal<LengthLimit, this>;
  @initial(null)
  @signal()
  declare public readonly maxHeight: SimpleSignal<LengthLimit, this>;
  @initial(null)
  @signal()
  declare public readonly minWidth: SimpleSignal<LengthLimit, this>;
  @initial(null)
  @signal()
  declare public readonly minHeight: SimpleSignal<LengthLimit, this>;
  @initial(null)
  @signal()
  declare public readonly ratio: SimpleSignal<number | null, this>;

  @spacingSignal('margin')
  declare public readonly margin: SpacingSignal<this>;

  @spacingSignal('padding')
  declare public readonly padding: SpacingSignal<this>;

  @initial('row')
  @signal()
  declare public readonly direction: SimpleSignal<FlexDirection, this>;
  @initial(null)
  @signal()
  declare public readonly basis: SimpleSignal<FlexBasis, this>;
  @initial(0)
  @signal()
  declare public readonly grow: SimpleSignal<number, this>;
  @initial(1)
  @signal()
  declare public readonly shrink: SimpleSignal<number, this>;
  @initial('nowrap')
  @signal()
  declare public readonly wrap: SimpleSignal<FlexWrap, this>;

  @initial('start')
  @signal()
  declare public readonly justifyContent: SimpleSignal<FlexContent, this>;
  @initial('normal')
  @signal()
  declare public readonly alignContent: SimpleSignal<FlexContent, this>;
  @initial('stretch')
  @signal()
  declare public readonly alignItems: SimpleSignal<FlexItems, this>;
  @initial('auto')
  @signal()
  declare public readonly alignSelf: SimpleSignal<FlexItems, this>;
  @initial(0)
  @vector2Signal({x: 'columnGap', y: 'rowGap'})
  declare public readonly gap: Vector2LengthSignal<this>;
  public get columnGap(): Signal<Length, number, this> {
    return this.gap.x;
  }
  public get rowGap(): Signal<Length, number, this> {
    return this.gap.y;
  }

  @defaultStyle('Roboto')
  @signal()
  declare public readonly fontFamily: SimpleSignal<string, this>;
  @defaultStyle(48)
  @signal()
  declare public readonly fontSize: SimpleSignal<number, this>;
  @defaultStyle('normal')
  @signal()
  declare public readonly fontStyle: SimpleSignal<string, this>;
  @defaultStyle(500)
  @signal()
  declare public readonly fontWeight: SimpleSignal<number, this>;
  @defaultStyle('120%')
  @signal()
  declare public readonly lineHeight: SimpleSignal<Length, this>;
  @defaultStyle(0)
  @signal()
  declare public readonly letterSpacing: SimpleSignal<number, this>;

  @defaultStyle(true)
  @signal()
  declare public readonly textWrap: SimpleSignal<TextWrap, this>;
  @initial('ltr')
  @signal()
  declare public readonly textDirection: SimpleSignal<CanvasDirection, this>;
  @defaultStyle('start')
  @signal()
  declare public readonly textAlign: SimpleSignal<TextAlign, this>;
  @defaultStyle('top')
  @signal()
  declare public readonly verticalAlign: SimpleSignal<VerticalAlign, this>;
  @defaultStyle('normal')
  @signal()
  declare public readonly wordBreak: SimpleSignal<WordBreak, this>;

  protected getX(): number {
    if (this.isLayoutRoot()) {
      return this.x.context.getter();
    }

    return this.computedPosition().x;
  }
  protected setX(value: SignalValue<number>) {
    this.x.context.setter(value);
  }

  protected getY(): number {
    if (this.isLayoutRoot()) {
      return this.y.context.getter();
    }

    return this.computedPosition().y;
  }
  protected setY(value: SignalValue<number>) {
    this.y.context.setter(value);
  }

  /**
   * Represents the size of this node.
   *
   * @remarks
   * A size is a two-dimensional vector, where `x` represents the `width`, and `y`
   * represents the `height`.
   *
   * The value of both x and y is of type {@link partials.Length} which is
   * either:
   * - `number` - the desired length in pixels
   * - `${number}%` - a string with the desired length in percents, for example
   *                  `'50%'`
   * - `null` - an automatic length
   *
   * When retrieving the size, all units are converted to pixels, using the
   * current state of the layout. For example, retrieving the width set to
   * `'50%'`, while the parent has a width of `200px` will result in the number
   * `100` being returned.
   *
   * When the node is not part of the layout, setting its size using percents
   * refers to the size of the entire scene.
   *
   * @example
   * Initializing the size:
   * ```tsx
   * // with a possible vector:
   * <Node size={['50%', 200]} />
   * // with individual components:
   * <Node width={'50%'} height={200} />
   * ```
   *
   * Accessing the size:
   * ```tsx
   * // retrieving the vector:
   * const size = node.size();
   * // retrieving an individual component:
   * const width = node.size.x();
   * ```
   *
   * Setting the size:
   * ```tsx
   * // with a possible vector:
   * node.size(['50%', 200]);
   * node.size(() => ['50%', 200]);
   * // with individual components:
   * node.size.x('50%');
   * node.size.x(() => '50%');
   * ```
   */
  @initial({x: null, y: null})
  @vector2Signal({x: 'width', y: 'height'})
  declare public readonly size: Vector2LengthSignal<this>;
  public get width(): Signal<Length, number, this> {
    return this.size.x;
  }
  public get height(): Signal<Length, number, this> {
    return this.size.y;
  }

  protected getWidth(): number {
    return this.computedSize().width;
  }
  protected setWidth(value: SignalValue<Length>) {
    this.width.context.setter(value);
  }

  @threadable()
  protected *tweenWidth(
    value: SignalValue<Length>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<Length>,
  ): ThreadGenerator {
    const width = this.desiredSize().x;
    const lock = typeof width !== 'number' || typeof value !== 'number';
    let from: number;
    if (lock) {
      from = this.size.x();
    } else {
      from = width;
    }

    let to: number;
    if (lock) {
      this.size.x(value);
      to = this.size.x();
    } else {
      to = value;
    }

    this.size.x(from);
    lock && this.lockLayout();
    yield* tween(time, value =>
      this.size.x(interpolationFunction(from, to, timingFunction(value))),
    );
    this.size.x(value);
    lock && this.releaseLayout();
  }

  protected getHeight(): number {
    return this.computedSize().height;
  }
  protected setHeight(value: SignalValue<Length>) {
    this.height.context.setter(value);
  }

  @threadable()
  protected *tweenHeight(
    value: SignalValue<Length>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<Length>,
  ): ThreadGenerator {
    const height = this.desiredSize().y;
    const lock = typeof height !== 'number' || typeof value !== 'number';

    let from: number;
    if (lock) {
      from = this.size.y();
    } else {
      from = height;
    }

    let to: number;
    if (lock) {
      this.size.y(value);
      to = this.size.y();
    } else {
      to = value;
    }

    this.size.y(from);
    lock && this.lockLayout();
    yield* tween(time, value =>
      this.size.y(interpolationFunction(from, to, timingFunction(value))),
    );
    this.size.y(value);
    lock && this.releaseLayout();
  }

  /**
   * Get the desired size of this node.
   *
   * @remarks
   * This method can be used to control the size using external factors.
   * By default, the returned size is the same as the one declared by the user.
   */
  @computed()
  protected desiredSize(): SerializedVector2<DesiredLength> {
    return {
      x: this.width.context.getter(),
      y: this.height.context.getter(),
    };
  }

  @threadable()
  protected *tweenSize(
    value: SignalValue<SerializedVector2<Length>>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<Vector2>,
  ): ThreadGenerator {
    const size = this.desiredSize();
    let from: Vector2;
    if (typeof size.x !== 'number' || typeof size.y !== 'number') {
      from = this.size();
    } else {
      from = new Vector2(<Vector2>size);
    }

    let to: Vector2;
    if (
      typeof value === 'object' &&
      typeof value.x === 'number' &&
      typeof value.y === 'number'
    ) {
      to = new Vector2(<Vector2>value);
    } else {
      this.size(value);
      to = this.size();
    }

    this.size(from);
    this.lockLayout();
    yield* tween(time, value =>
      this.size(interpolationFunction(from, to, timingFunction(value))),
    );
    this.releaseLayout();
    this.size(value);
  }

  @threadable()
  protected *tweenPadding(
    value: SignalValue<PossibleSpacing>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<Spacing>,
  ): ThreadGenerator {
    const from = this.padding();
    this.lockLayout();
    yield* tween(time, t => {
      const target = this.padding.context.parse(unwrap(value));
      this.padding(interpolationFunction(from, target, timingFunction(t)));
    });
    this.releaseLayout();
  }

  @threadable()
  protected *tweenMargin(
    value: SignalValue<PossibleSpacing>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<Spacing>,
  ): ThreadGenerator {
    const from = this.margin();
    this.lockLayout();
    yield* tween(time, t => {
      const target = this.margin.context.parse(unwrap(value));
      this.margin(interpolationFunction(from, target, timingFunction(t)));
    });
    this.releaseLayout();
  }

  @threadable()
  protected *tweenGap(
    value: SignalValue<PossibleVector2<Length>>,
    time: number,
    timingFunction: TimingFunction,
    interpolationFunction: InterpolationFunction<Vector2>,
  ): ThreadGenerator {
    const from = this.gap();
    this.lockLayout();
    yield* tween(time, t => {
      const target = this.gap.context.parse(unwrap(value));
      this.gap(
        interpolationFunction(from, target as Vector2, timingFunction(t)),
      );
    });
    this.releaseLayout();
  }

  /**
   * Represents the offset of this node's origin.
   *
   * @remarks
   * By default, the origin of a node is located at its center. The origin
   * serves as the pivot point when rotating and scaling a node, but it doesn't
   * affect the placement of its children.
   *
   * The value is relative to the size of this node. A value of `1` means as far
   * to the right/bottom as possible. Here are a few examples of anchors:
   * - `[-1, -1]` - top left corner
   * - `[1, -1]` - top right corner
   * - `[0, 1]` - bottom edge
   * - `[-1, 1]` - bottom left corner
   */
  @vector2Signal('anchor')
  declare public readonly anchor: Vector2Signal<this>;

  /**
   * A visual offset applied to this node's rendering, analogous to CSS
   * `transform: translate()`. Does not affect layout.
   */
  @initial(Vector2.zero)
  @vector2Signal('translate')
  declare public readonly translate: Vector2Signal<this>;

  /**
   * The position of the center of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the center ends up in the given place.
   *
   * If the {@link anchor} has not been changed, this will be the same as the
   * {@link position}.
   *
   * When retrieved, it will return the position of the center in the parent
   * space.
   */
  @originSignal(Origin.Middle)
  declare public readonly middle: LayoutPositionSignal<this>;

  /**
   * The position of the top edge of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the top edge ends up in the given place.
   *
   * When retrieved, it will return the position of the top edge in the parent
   * space.
   */
  @originSignal(Origin.Top)
  declare public readonly top: LayoutPositionSignal<this>;
  /**
   * The position of the bottom edge of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the bottom edge ends up in the given place.
   *
   * When retrieved, it will return the position of the bottom edge in the
   * parent space.
   */
  @originSignal(Origin.Bottom)
  declare public readonly bottom: LayoutPositionSignal<this>;
  /**
   * The position of the left edge of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the left edge ends up in the given place.
   *
   * When retrieved, it will return the position of the left edge in the parent
   * space.
   */
  @originSignal(Origin.Left)
  declare public readonly left: LayoutPositionSignal<this>;
  /**
   * The position of the right edge of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the right edge ends up in the given place.
   *
   * When retrieved, it will return the position of the right edge in the parent
   * space.
   */
  @originSignal(Origin.Right)
  declare public readonly right: LayoutPositionSignal<this>;
  /**
   * The position of the top left corner of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the top left corner ends up in the given place.
   *
   * When retrieved, it will return the position of the top left corner in the
   * parent space.
   */
  @originSignal(Origin.TopLeft)
  declare public readonly topLeft: LayoutPositionSignal<this>;
  /**
   * The position of the top right corner of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the top right corner ends up in the given place.
   *
   * When retrieved, it will return the position of the top right corner in the
   * parent space.
   */
  @originSignal(Origin.TopRight)
  declare public readonly topRight: LayoutPositionSignal<this>;
  /**
   * The position of the bottom left corner of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the bottom left corner ends up in the given place.
   *
   * When retrieved, it will return the position of the bottom left corner in
   * the parent space.
   */
  @originSignal(Origin.BottomLeft)
  declare public readonly bottomLeft: LayoutPositionSignal<this>;
  /**
   * The position of the bottom right corner of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the bottom right corner ends up in the given place.
   *
   * When retrieved, it will return the position of the bottom right corner in
   * the parent space.
   */
  @originSignal(Origin.BottomRight)
  declare public readonly bottomRight: LayoutPositionSignal<this>;

  /**
   * Get the cardinal point corresponding to the given origin.
   *
   * @param origin - The origin or direction of the point.
   */
  public cardinalPoint(origin: Origin | Direction): LayoutPositionSignal<this> {
    switch (origin) {
      case Origin.TopLeft:
        return this.topLeft;
      case Origin.TopRight:
        return this.topRight;
      case Origin.BottomLeft:
        return this.bottomLeft;
      case Origin.BottomRight:
        return this.bottomRight;
      case Origin.Top:
      case Direction.Top:
        return this.top;
      case Origin.Bottom:
      case Direction.Bottom:
        return this.bottom;
      case Origin.Left:
      case Direction.Left:
        return this.left;
      case Origin.Right:
      case Direction.Right:
        return this.right;
      default:
        return this.middle;
    }
  }

  @initial(false)
  @signal()
  declare public readonly clip: SimpleSignal<boolean, this>;

  declare public yogaNode: YogaNode;

  @initial(0)
  @signal()
  declare protected readonly layoutLockCounter: SimpleSignal<number, this>;

  public constructor(props: LayoutProps) {
    super(props);
  }

  /**
   * Increment the layout lock counter. While positive, this node's
   * `flexGrow` / `flexShrink` are forced to `0`, holding its slot in the
   * parent's flex layout. Pair every call with {@link releaseLayout}.
   */
  public lockLayout() {
    this.layoutLockCounter(this.layoutLockCounter() + 1);
  }

  /**
   * Decrement the layout lock counter.
   */
  public releaseLayout() {
    this.layoutLockCounter(this.layoutLockCounter() - 1);
  }

  @computed()
  protected parentTransform(): Layout | null {
    return this.findAncestor(is(Layout));
  }

  @computed()
  public anchorPosition() {
    const size = this.computedSize();
    const offset = this.anchor();

    return size.scale(0.5).mul(offset);
  }

  /**
   * Whether this node participates in its parent's flex layout. Resolves
   * {@link layoutSelf}, then {@link layout}, then the parent's
   * {@link canLayoutChildren}.
   */
  @computed()
  public layoutEnabled(): boolean {
    return (
      this.layoutSelf() ??
      this.layout() ??
      this.parentTransform()?.canLayoutChildren() ??
      false
    );
  }

  /**
   * Whether this node lays out its own children with flex. Resolves
   * {@link layoutChildren}, then {@link layout}, then the parent's
   * {@link canLayoutChildren}.
   *
   * @remarks
   * Overridden by `Txt` (and similar leaves) that must not host yoga children.
   */
  @computed()
  public canLayoutChildren(): boolean {
    return (
      this.layoutChildren() ??
      this.layout() ??
      this.parentTransform()?.canLayoutChildren() ??
      false
    );
  }

  @computed()
  public isLayoutRoot(): boolean {
    // A parent that doesn't host yoga children (e.g. Txt) leaves this node
    // detached from any yoga tree, so it must lay itself out as a root.
    return (
      !this.layoutEnabled() || !this.parentTransform()?.canLayoutChildren()
    );
  }

  public override localToParent(): DOMMatrix {
    const matrix = super.localToParent();

    const translate = this.translate();
    if (!translate.exactlyEquals(Vector2.zero)) {
      matrix.translateSelf(translate.x, translate.y);
    }

    const offset = this.anchor();
    if (!offset.exactlyEquals(Vector2.zero)) {
      const anchorTranslate = this.size().mul(offset).scale(-0.5);
      matrix.translateSelf(anchorTranslate.x, anchorTranslate.y);
    }

    return matrix;
  }

  /**
   * A simplified version of {@link localToParent} matrix used for transforming
   * direction vectors.
   *
   * @internal
   */
  @computed()
  protected scalingRotationMatrix(): DOMMatrix {
    const matrix = new DOMMatrix();

    matrix.rotateSelf(0, 0, this.rotation());
    matrix.scaleSelf(this.scale.x(), this.scale.y());

    const translate = this.translate();
    if (!translate.exactlyEquals(Vector2.zero)) {
      matrix.translateSelf(translate.x, translate.y);
    }

    const offset = this.anchor();
    if (!offset.exactlyEquals(Vector2.zero)) {
      const anchorTranslate = this.size().mul(offset).scale(-0.5);
      matrix.translateSelf(anchorTranslate.x, anchorTranslate.y);
    }

    return matrix;
  }

  protected getComputedLayout(): BBox {
    const layout = this.yogaNode.getComputedLayout();
    return new BBox(layout.left, layout.top, layout.width, layout.height);
  }

  @computed()
  public computedPosition(): Vector2 {
    this.requestLayoutUpdate();
    const box = this.getComputedLayout();

    const position = new Vector2(
      box.x + box.width / 2 + (box.width / 2) * this.anchor.x(),
      box.y + box.height / 2 + (box.height / 2) * this.anchor.y(),
    );

    const parent = this.parentTransform();
    if (parent) {
      const parentBox = parent.getComputedLayout();
      const parentLayout = parent.yogaNode.getComputedLayout();
      position.x -= parentBox.x - parentLayout.left + parentBox.width / 2;
      position.y -= parentBox.y - parentLayout.top + parentBox.height / 2;
    }

    return position;
  }

  @computed()
  protected computedSize(): Vector2 {
    this.requestLayoutUpdate();
    return this.getComputedLayout().size;
  }

  /**
   * Find the closest layout root and apply any new layout changes.
   */
  @computed()
  protected requestLayoutUpdate() {
    const parent = this.parentTransform();
    if (this.isLayoutRoot()) {
      parent?.requestFontUpdate();
      this.updateLayout();
      const {width, height} = this.resolveLayoutConstraint();
      this.calculateRootLayout(width, height);
    } else {
      parent?.requestLayoutUpdate();
    }
  }

  /**
   * Run yoga layout for this root, resolving percent-sized children of
   * auto-sized containers with a second pass when needed.
   */
  protected calculateRootLayout(
    width: number | undefined,
    height: number | undefined,
  ) {
    this.yogaNode.calculateLayout(width, height);
    if (this.resolvePercentageDimensions()) {
      this.yogaNode.calculateLayout(width, height);
    }
  }

  /**
   * Resolve the `calculateLayout` constraint for this layout root.
   *
   * @remarks
   * Definite dimensions pass straight through. Percent dimensions resolve to
   * the parent's computed size — yoga then applies the node's own percent
   * against that available space, so the percent is applied exactly once
   * (a Rect with `width='50%'` under View2D gets half the view width), and
   * stacked percent roots compose recursively through `computedSize`.
   */
  private resolveLayoutConstraint(): {
    width: number | undefined;
    height: number | undefined;
  } {
    const size = this.desiredSize();
    return {
      width: this.resolveDimensionConstraint(size.x, 'width'),
      height: this.resolveDimensionConstraint(size.y, 'height'),
    };
  }

  private resolveDimensionConstraint(
    value: DesiredLength,
    axis: 'width' | 'height',
  ): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string' || !value.endsWith('%')) return undefined;

    const parent = this.parentTransform();
    if (!parent) return undefined;
    const parentSize = parent.computedSize();
    const available = axis === 'width' ? parentSize.x : parentSize.y;
    return isFinite(available) && available > 0 ? available : undefined;
  }

  private resolvePercentageDimensions(): boolean {
    let resolved = false;
    this.walkFlexTree((child, parent) => {
      const size = child.desiredSize();
      const parentLayout = parent.yogaNode.getComputedLayout();

      if (typeof size.x === 'string' && size.x.endsWith('%')) {
        const parentDesired = parent.desiredSize();
        if (parentDesired.x === null) {
          const percent = parseFloat(size.x);
          child.yogaNode.setWidth((parentLayout.width * percent) / 100);
          resolved = true;
        }
      }

      if (typeof size.y === 'string' && size.y.endsWith('%')) {
        const parentDesired = parent.desiredSize();
        if (parentDesired.y === null) {
          const percent = parseFloat(size.y);
          child.yogaNode.setHeight((parentLayout.height * percent) / 100);
          resolved = true;
        }
      }
    });
    return resolved;
  }

  private walkFlexTree(visitor: (child: Layout, parent: Layout) => void): void {
    const walk = (parent: Layout) => {
      if (!parent.canLayoutChildren()) return;
      for (const child of parent.applyLayout()) {
        visitor(child, parent);
        walk(child);
      }
    };
    walk(this);
  }

  /**
   * Apply any new layout changes to this node and its children.
   */
  @computed()
  protected updateLayout() {
    this.applyFont();
    this.applyFlex();
    if (this.canLayoutChildren()) {
      const children = this.applyLayout();
      for (const child of children) {
        child.updateLayout();
      }
    }
  }

  @computed()
  protected applyLayout(): Layout[] {
    const queue = [...this.children()];
    const result: Layout[] = [];
    while (queue.length) {
      const child = queue.shift();
      if (child instanceof Layout) {
        if (child.layoutEnabled()) {
          result.push(child);
        }
      } else if (child) {
        queue.unshift(...child.children());
      }
    }

    for (let i = this.yogaNode.getChildCount() - 1; i >= 0; i--) {
      this.yogaNode.removeChild(this.yogaNode.getChild(i));
    }
    for (let i = 0; i < result.length; i++) {
      this.yogaNode.insertChild(result[i].yogaNode, i);
    }

    return result;
  }

  /**
   * Apply any new font changes to this node and all of its ancestors.
   */
  @computed()
  protected requestFontUpdate() {
    this.parentTransform()?.requestFontUpdate();
    this.applyFont();
  }

  @computed()
  public canvasFont(): string {
    return buildCanvasFontString(
      this.fontStyle(),
      this.fontWeight(),
      this.fontSize(),
      this.fontFamily(),
    );
  }

  @computed()
  public resolvedLineHeight(): number {
    return resolveLineHeight(this.lineHeight(), this.fontSize());
  }

  protected override getCacheBBox(): BBox {
    return BBox.fromSizeCentered(this.computedSize());
  }

  protected override draw(context: CanvasRenderingContext2D) {
    if (this.clip()) {
      const size = this.computedSize();
      if (size.width === 0 || size.height === 0) {
        return;
      }

      context.beginPath();
      context.rect(size.width / -2, size.height / -2, size.width, size.height);
      context.closePath();
      context.clip();
    }

    this.drawChildren(context);
  }

  public override drawOverlay(
    context: CanvasRenderingContext2D,
    matrix: DOMMatrix,
  ) {
    const size = this.computedSize();
    const offset = size.mul(this.anchor()).scale(0.5).transformAsPoint(matrix);
    const box = BBox.fromSizeCentered(size);
    const layout = box.transformCorners(matrix);
    const padding = box
      .addSpacing(this.padding().scale(-1))
      .transformCorners(matrix);
    const margin = box.addSpacing(this.margin()).transformCorners(matrix);

    context.beginPath();
    drawLine(context, margin);
    drawLine(context, layout);
    context.closePath();
    context.fillStyle = 'rgba(255,193,125,0.6)';
    context.fill('evenodd');

    context.beginPath();
    drawLine(context, layout);
    drawLine(context, padding);
    context.closePath();
    context.fillStyle = 'rgba(180,255,147,0.6)';
    context.fill('evenodd');

    context.beginPath();
    drawLine(context, layout);
    context.closePath();
    context.lineWidth = 1;
    context.strokeStyle = 'white';
    context.stroke();

    context.beginPath();
    drawPivot(context, offset);
    context.stroke();
  }

  public getOriginDelta(origin: Origin) {
    const size = this.computedSize().scale(0.5);
    const offset = this.anchor().mul(size);
    if (origin === Origin.Middle) {
      return offset.flipped;
    }

    const newOffset = originToOffset(origin).mul(size);
    return newOffset.sub(offset);
  }

  /**
   * Update the offset of this node and adjust the position to keep it in the
   * same place.
   *
   * @param offset - The new offset.
   */
  public moveOffset(offset: Vector2) {
    const size = this.computedSize().scale(0.5);
    const oldOffset = this.anchor().mul(size);
    const newOffset = offset.mul(size);
    this.anchor(offset);
    this.position(this.position().add(newOffset).sub(oldOffset));
  }

  @computed()
  protected applyFlex() {
    const node = this.yogaNode;

    node.setPositionType(
      this.isLayoutRoot() ? PositionType.Absolute : PositionType.Relative,
    );

    const size = this.desiredSize();
    setYogaDimension(node, 'setWidth', size.x);
    setYogaDimension(node, 'setHeight', size.y);
    setYogaDimension(node, 'setMaxWidth', this.maxWidth());
    setYogaDimension(node, 'setMinWidth', this.minWidth());
    setYogaDimension(node, 'setMaxHeight', this.maxHeight());
    setYogaDimension(node, 'setMinHeight', this.minHeight());

    const ratio = this.ratio();
    node.setAspectRatio(ratio ?? undefined);

    setYogaSpacing(
      node,
      'Margin',
      this.margin.top(),
      this.margin.right(),
      this.margin.bottom(),
      this.margin.left(),
    );
    setYogaSpacing(
      node,
      'Padding',
      this.padding.top(),
      this.padding.right(),
      this.padding.bottom(),
      this.padding.left(),
    );

    node.setFlexDirection(toYogaFlexDirection(this.direction()));
    setYogaFlexBasis(node, this.basis());
    node.setFlexWrap(toYogaFlexWrap(this.wrap()));

    const direction = this.direction();
    const wrap = this.wrap();
    node.setJustifyContent(
      toYogaJustifyContent(this.justifyContent(), direction),
    );
    node.setAlignContent(toYogaAlignContent(this.alignContent(), wrap));
    node.setAlignItems(toYogaAlignItems(this.alignItems(), wrap));
    node.setAlignSelf(toYogaAlignItems(this.alignSelf(), wrap));

    setYogaGap(node, this.gap.x(), this.gap.y());

    if (this.layoutLockCounter() > 0) {
      node.setFlexGrow(0);
      node.setFlexShrink(0);
    } else {
      node.setFlexGrow(this.grow());
      node.setFlexShrink(this.shrink());
    }
  }

  @computed()
  protected applyFont() {
    // Dependency checkpoint: touching every font signal invalidates downstream
    // measurement caches when any font property changes.
    this.fontFamily();
    this.fontSize();
    this.fontStyle();
    this.fontWeight();
    this.lineHeight();
    this.letterSpacing();
    this.textWrap();
    this.textAlign();
    this.wordBreak();
  }

  public override dispose() {
    if (this.isDisposed) {
      return;
    }
    super.dispose();
    this.layoutLockCounter?.context.dispose();
    if (this.yogaNode) {
      this.yogaNode.free();
    }
  }

  public override hit(position: Vector2): Node | null {
    const local = position.transformAsPoint(this.localToParent().inverse());
    if (this.cacheBBox().includes(local)) {
      return super.hit(position) ?? this;
    }

    return null;
  }
}

function originSignal(origin: Origin): PropertyDecorator {
  return (target, key) => {
    signal<PossibleVector2>()(target, key);
    cloneable(false)(target, key);
    wrapper(Vector2)(target, key);

    addInitializer(target, (instance: Layout) => {
      const parser = (value: PossibleVector2) => new Vector2(value);

      const signalContext = new LayoutPositionSignalContext(
        undefined,
        deepLerp,
        instance,
        parser,
        {
          getter: function (this: Layout) {
            return this.computedSize()
              .getOriginOffset(origin)
              .transformAsPoint(this.localToParent());
          }.bind(instance),
        },
      );

      signalContext.setCustomSetter(
        function (
          this: Layout,
          value: SignalValue<PossibleVector2> | typeof DEFAULT,
        ) {
          if (value === DEFAULT) {
            return this;
          }
          this.position(
            modify(value, unwrapped =>
              this.getOriginDelta(origin)
                .transform(this.scalingRotationMatrix())
                .flipped.add(unwrapped),
            ),
          );
          return this;
        }.bind(instance),
      );

      Object.defineProperty(instance, key, {
        value: signalContext.toSignal(),
        writable: false,
        enumerable: true,
        configurable: false,
      });
    });
  };
}

addInitializer<Layout>(Layout.prototype, instance => {
  instance.yogaNode = createYogaNode();
});
