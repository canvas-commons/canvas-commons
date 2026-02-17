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
  TextWrap,
} from '../partials';
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
  layoutSelf?: LayoutMode;
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
  textAlign?: SignalValue<CanvasTextAlign>;

  size?: SignalValue<PossibleVector2<Length>>;
  offsetX?: SignalValue<number>;
  offsetY?: SignalValue<number>;
  offset?: SignalValue<PossibleVector2>;
  /**
   * The position of the center of this node.
   *
   * @remarks
   * This shortcut property will set the node's position so that the center ends
   * up in the given place.
   * If present, overrides the {@link NodeProps.position} property.
   * When {@link offset} is not set, this will be the same as the
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
  public declare readonly layout: SimpleSignal<LayoutMode, this>;

  @initial(null)
  @interpolation(boolLerp)
  @signal()
  public declare readonly layoutSelf: SimpleSignal<LayoutMode, this>;

  @initial(null)
  @interpolation(boolLerp)
  @signal()
  public declare readonly layoutChildren: SimpleSignal<LayoutMode, this>;

  @initial(null)
  @signal()
  public declare readonly maxWidth: SimpleSignal<LengthLimit, this>;
  @initial(null)
  @signal()
  public declare readonly maxHeight: SimpleSignal<LengthLimit, this>;
  @initial(null)
  @signal()
  public declare readonly minWidth: SimpleSignal<LengthLimit, this>;
  @initial(null)
  @signal()
  public declare readonly minHeight: SimpleSignal<LengthLimit, this>;
  @initial(null)
  @signal()
  public declare readonly ratio: SimpleSignal<number | null, this>;

  @spacingSignal('margin')
  public declare readonly margin: SpacingSignal<this>;

  @spacingSignal('padding')
  public declare readonly padding: SpacingSignal<this>;

  @initial('row')
  @signal()
  public declare readonly direction: SimpleSignal<FlexDirection, this>;
  @initial(null)
  @signal()
  public declare readonly basis: SimpleSignal<FlexBasis, this>;
  @initial(0)
  @signal()
  public declare readonly grow: SimpleSignal<number, this>;
  @initial(1)
  @signal()
  public declare readonly shrink: SimpleSignal<number, this>;
  @initial('nowrap')
  @signal()
  public declare readonly wrap: SimpleSignal<FlexWrap, this>;

  @initial('start')
  @signal()
  public declare readonly justifyContent: SimpleSignal<FlexContent, this>;
  @initial('normal')
  @signal()
  public declare readonly alignContent: SimpleSignal<FlexContent, this>;
  @initial('stretch')
  @signal()
  public declare readonly alignItems: SimpleSignal<FlexItems, this>;
  @initial('auto')
  @signal()
  public declare readonly alignSelf: SimpleSignal<FlexItems, this>;
  @initial(0)
  @vector2Signal({x: 'columnGap', y: 'rowGap'})
  public declare readonly gap: Vector2LengthSignal<this>;
  public get columnGap(): Signal<Length, number, this> {
    return this.gap.x;
  }
  public get rowGap(): Signal<Length, number, this> {
    return this.gap.y;
  }

  @defaultStyle('Roboto')
  @signal()
  public declare readonly fontFamily: SimpleSignal<string, this>;
  @defaultStyle(48)
  @signal()
  public declare readonly fontSize: SimpleSignal<number, this>;
  @defaultStyle('normal')
  @signal()
  public declare readonly fontStyle: SimpleSignal<string, this>;
  @defaultStyle(500)
  @signal()
  public declare readonly fontWeight: SimpleSignal<number, this>;
  @defaultStyle('120%')
  @signal()
  public declare readonly lineHeight: SimpleSignal<Length, this>;
  @defaultStyle(0)
  @signal()
  public declare readonly letterSpacing: SimpleSignal<number, this>;

  @defaultStyle(false)
  @signal()
  public declare readonly textWrap: SimpleSignal<TextWrap, this>;
  @initial('ltr')
  @signal()
  public declare readonly textDirection: SimpleSignal<CanvasDirection, this>;
  @defaultStyle('start')
  @signal()
  public declare readonly textAlign: SimpleSignal<CanvasTextAlign, this>;

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
  public declare readonly size: Vector2LengthSignal<this>;
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
    lock && this.lockSize();
    yield* tween(time, value =>
      this.size.x(interpolationFunction(from, to, timingFunction(value))),
    );
    this.size.x(value);
    lock && this.releaseSize();
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
    lock && this.lockSize();
    yield* tween(time, value =>
      this.size.y(interpolationFunction(from, to, timingFunction(value))),
    );
    this.size.y(value);
    lock && this.releaseSize();
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
    this.lockSize();
    yield* tween(time, value =>
      this.size(interpolationFunction(from, to, timingFunction(value))),
    );
    this.releaseSize();
    this.size(value);
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
   * to the right/bottom as possible. Here are a few examples of offsets:
   * - `[-1, -1]` - top left corner
   * - `[1, -1]` - top right corner
   * - `[0, 1]` - bottom edge
   * - `[-1, 1]` - bottom left corner
   */
  @vector2Signal('offset')
  public declare readonly offset: Vector2Signal<this>;

  /**
   * The position of the center of this node.
   *
   * @remarks
   * When set, this shortcut property will modify the node's position so that
   * the center ends up in the given place.
   *
   * If the {@link offset} has not been changed, this will be the same as the
   * {@link position}.
   *
   * When retrieved, it will return the position of the center in the parent
   * space.
   */
  @originSignal(Origin.Middle)
  public declare readonly middle: LayoutPositionSignal<this>;

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
  public declare readonly top: LayoutPositionSignal<this>;
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
  public declare readonly bottom: LayoutPositionSignal<this>;
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
  public declare readonly left: LayoutPositionSignal<this>;
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
  public declare readonly right: LayoutPositionSignal<this>;
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
  public declare readonly topLeft: LayoutPositionSignal<this>;
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
  public declare readonly topRight: LayoutPositionSignal<this>;
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
  public declare readonly bottomLeft: LayoutPositionSignal<this>;
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
  public declare readonly bottomRight: LayoutPositionSignal<this>;

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
  public declare readonly clip: SimpleSignal<boolean, this>;

  public declare yogaNode: YogaNode;

  @initial(0)
  @signal()
  protected declare readonly sizeLockCounter: SimpleSignal<number, this>;

  public constructor(props: LayoutProps) {
    super(props);
  }

  public lockSize() {
    this.sizeLockCounter(this.sizeLockCounter() + 1);
  }

  public releaseSize() {
    this.sizeLockCounter(this.sizeLockCounter() - 1);
  }

  @computed()
  protected parentTransform(): Layout | null {
    return this.findAncestor(is(Layout));
  }

  @computed()
  public anchorPosition() {
    const size = this.computedSize();
    const offset = this.offset();

    return size.scale(0.5).mul(offset);
  }

  /**
   * Get the resolved layout mode of this node.
   *
   * @remarks
   * When the mode is `null`, its value will be inherited from the parent.
   *
   * Use {@link layout} to get the raw mode set for this node (without
   * inheritance).
   */
  @computed()
  public layoutSelfEnabled(): boolean {
    return (
      this.layoutSelf() ??
      this.layout() ??
      this.parentTransform()?.layoutChildrenEnabled() ??
      false
    );
  }

  @computed()
  public layoutChildrenEnabled(): boolean {
    return (
      this.layoutChildren() ??
      this.layout() ??
      this.parentTransform()?.layoutChildrenEnabled() ??
      false
    );
  }

  @computed()
  public isLayoutRoot(): boolean {
    return (
      !this.layoutSelfEnabled() ||
      !this.parentTransform()?.layoutChildrenEnabled()
    );
  }

  public override localToParent(): DOMMatrix {
    const matrix = super.localToParent();
    const offset = this.offset();
    if (!offset.exactlyEquals(Vector2.zero)) {
      const translate = this.size().mul(offset).scale(-0.5);
      matrix.translateSelf(translate.x, translate.y);
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

    const offset = this.offset();
    if (!offset.exactlyEquals(Vector2.zero)) {
      const translate = this.size().mul(offset).scale(-0.5);
      matrix.translateSelf(translate.x, translate.y);
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
    const layout = this.yogaNode.getComputedLayout();
    const width = layout.width;
    const height = layout.height;

    const parent = this.parentTransform();
    const parentLayout = parent?.yogaNode.getComputedLayout();
    const parentWidth = parentLayout?.width ?? 0;
    const parentHeight = parentLayout?.height ?? 0;

    return new Vector2(
      layout.left + width / 2 - parentWidth / 2 + (width / 2) * this.offset.x(),
      layout.top +
        height / 2 -
        parentHeight / 2 +
        (height / 2) * this.offset.y(),
    );
  }

  @computed()
  protected computedSize(): Vector2 {
    this.requestLayoutUpdate();
    const layout = this.yogaNode.getComputedLayout();
    return new Vector2(layout.width, layout.height);
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
      const size = this.desiredSize();
      const width = typeof size.x === 'number' ? size.x : undefined;
      const height = typeof size.y === 'number' ? size.y : undefined;
      this.yogaNode.calculateLayout(width, height);

      if (this.resolvePercentageDimensions()) {
        this.yogaNode.calculateLayout(width, height);
      }
    } else {
      parent?.requestLayoutUpdate();
    }
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
      if (!parent.layoutChildrenEnabled()) return;
      for (const child of parent.flexChildren()) {
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
    if (this.layoutChildrenEnabled()) {
      const children = this.flexChildren();
      for (const child of children) {
        child.updateLayout();
      }
    }
  }

  @computed()
  protected flexChildren(): Layout[] {
    const queue = [...this.children()];
    const result: Layout[] = [];
    while (queue.length) {
      const child = queue.shift();
      if (child instanceof Layout) {
        if (child.layoutSelfEnabled()) {
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
    return `${this.fontStyle()} ${this.fontWeight()} ${this.fontSize()}px ${this.fontFamily()}`;
  }

  @computed()
  public resolvedLineHeight(): number {
    const lineHeight = this.lineHeight();
    if (typeof lineHeight === 'number') {
      return lineHeight;
    }
    return (parseFloat(lineHeight) / 100) * this.fontSize();
  }

  @computed()
  public resolvedWhiteSpace(): string {
    const wrap = this.textWrap();
    if (typeof wrap === 'boolean') {
      return wrap ? 'normal' : 'nowrap';
    }
    return wrap;
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
    const offset = size.mul(this.offset()).scale(0.5).transformAsPoint(matrix);
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
    const offset = this.offset().mul(size);
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
    const oldOffset = this.offset().mul(size);
    const newOffset = offset.mul(size);
    this.offset(offset);
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

    if (this.sizeLockCounter() > 0) {
      node.setFlexGrow(0);
      node.setFlexShrink(0);
    } else {
      node.setFlexGrow(this.grow());
      node.setFlexShrink(this.shrink());
    }
  }

  @computed()
  protected applyFont() {
    // Font properties are read via signals and canvasFont().
    // This method exists as a computed dependency checkpoint.
    this.fontFamily();
    this.fontSize();
    this.fontStyle();
    this.fontWeight();
    this.lineHeight();
    this.letterSpacing();
    this.textWrap();
    this.textAlign();
  }

  public override dispose() {
    super.dispose();
    this.sizeLockCounter?.context.dispose();
    if (this.yogaNode) {
      this.yogaNode.free();
    }
    this.yogaNode = null!;
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
