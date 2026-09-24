import {
  InterpolationFunction,
  PossibleVector2,
  Signal,
  SignalContext,
  SignalExtensions,
  SignalGenerator,
  SignalValue,
  SimpleVector2Signal,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  Vector2Signal,
  Vector2SignalContext,
  deepLerp,
} from '@canvas-commons/core';
import {Node} from '../components/Node';
import {makeSignalExtensions} from '../utils/makeSignalExtensions';
import {compound} from './compound';
import {addInitializer} from './initializers';
import {getPropertyMetaOrCreate, wrapper} from './signal';

/**
 * Utility class for handling coordinate space transformations.
 *
 * Provides shared logic for converting between different coordinate spaces:
 * - **Local**: The node's own coordinate system relative to its parent
 * - **Absolute**: The global coordinate system of the scene
 * - **View**: The coordinate system of the view/camera
 * - **Relative**: Coordinate system relative to another specific node
 *
 * @example
 * ```typescript
 * // Convert an absolute position to local coordinates
 * const localPos = TransformConverter.absoluteToLocalPosition(node, [100, 200]);
 *
 * // Convert a position in another node's local space to absolute coordinates
 * const absPos = TransformConverter.relativeToAbsolutePosition(other, [10, 0]);
 * ```
 */
class TransformConverter {
  private static wrapVectorSignalTransform(
    value: SignalValue<PossibleVector2>,
    transform: (val: Vector2) => Vector2,
  ): SignalValue<PossibleVector2> {
    if (typeof value === 'function') {
      return () => transform(new Vector2(value()));
    }
    return transform(new Vector2(value));
  }

  private static wrapScalarSignalTransform(
    value: SignalValue<number>,
    transform: (val: number) => number,
  ): SignalValue<number> {
    if (typeof value === 'function') {
      return () => transform(value());
    }
    return transform(value);
  }

  public static absoluteToLocalPosition(
    owner: Node,
    absoluteValue: SignalValue<PossibleVector2>,
  ): SignalValue<PossibleVector2> {
    return this.wrapVectorSignalTransform(absoluteValue, val =>
      val.transformAsPoint(owner.worldToParent()),
    );
  }

  public static absoluteToLocalScale(
    owner: Node,
    absoluteValue: SignalValue<PossibleVector2>,
  ): SignalValue<PossibleVector2> {
    return this.wrapVectorSignalTransform(absoluteValue, val => {
      const axes = owner.parentToWorld().rotate(0, 0, owner.rotation());
      return new Vector2(
        val.x / Vector2.magnitude(axes.m11, axes.m12),
        val.y / Vector2.magnitude(axes.m21, axes.m22),
      );
    });
  }

  public static absoluteToLocalRotation(
    owner: Node,
    absoluteValue: SignalValue<number>,
  ): SignalValue<number> {
    return this.wrapScalarSignalTransform(absoluteValue, val => {
      const parentAbsRotation = owner.parent()?.absoluteRotation() ?? 0;
      return val - parentAbsRotation;
    });
  }

  public static relativeToAbsolutePosition(
    targetNode: Node,
    relativeValue: SignalValue<PossibleVector2>,
  ): SignalValue<PossibleVector2> {
    return this.wrapVectorSignalTransform(relativeValue, val =>
      val.transformAsPoint(targetNode.localToWorld()),
    );
  }

  public static relativeToAbsoluteScale(
    targetNode: Node,
    relativeValue: SignalValue<PossibleVector2>,
  ): SignalValue<PossibleVector2> {
    return this.wrapVectorSignalTransform(relativeValue, val =>
      val.mul(targetNode.absoluteScale()),
    );
  }

  public static relativeToAbsoluteRotation(
    targetNode: Node,
    relativeValue: SignalValue<number>,
  ): SignalValue<number> {
    return this.wrapScalarSignalTransform(
      relativeValue,
      val => val + targetNode.absoluteRotation(),
    );
  }
}

interface SpaceMethod<TSetterValue, TValue extends TSetterValue, TOwner> {
  (): TValue;
  (value: SignalValue<TSetterValue>): TOwner;
  (
    value: SignalValue<TSetterValue>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<TValue>,
  ): SignalGenerator<TSetterValue, TValue>;
}

interface ComponentTransformMethod<TOwner> {
  (): number;
  (value: SignalValue<number>): TOwner;
  (
    value: SignalValue<number>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<number>,
  ): ThreadGenerator;
}

interface EnhancedTransformMethod<TOwner> extends SpaceMethod<
  PossibleVector2,
  Vector2,
  TOwner
> {
  x: ComponentTransformMethod<TOwner>;
  y: ComponentTransformMethod<TOwner>;
}

type EnhancedRotationMethod<TOwner> = SpaceMethod<number, number, TOwner>;

interface TransformSpaces<TMethod> {
  abs: TMethod;
  view: TMethod;
  local: TMethod;
  relativeTo: (node: Node) => TMethod;
}

type ComponentSpaces<TOwner> = TransformSpaces<
  ComponentTransformMethod<TOwner>
>;

const AXES = ['x', 'y'] as const;
type Axis = (typeof AXES)[number];

/**
 * One component of a {@link PositionSignal}, like `node.x`.
 */
export type PositionComponentSignal<TOwner extends Node = Node> = Signal<
  number,
  number,
  TOwner
> &
  ComponentSpaces<TOwner>;

/**
 * A position signal that can be read, set, and tweened in other coordinate
 * spaces.
 *
 * @example
 * ```typescript
 * node.position.abs([300, 400]);
 * node.position.relativeTo(other)([50, 0], 1);
 *
 * // Components and spaces can be accessed in either order.
 * node.position.view.y(250);
 * node.position.y.view(250);
 * ```
 */
export type PositionSignal<TOwner extends Node = Node> = Vector2Signal<TOwner> &
  TransformSpaces<EnhancedTransformMethod<TOwner>> &
  Record<Axis, PositionComponentSignal<TOwner>>;

/**
 * A scale signal that can be read, set, and tweened in other coordinate
 * spaces, the same as {@link PositionSignal}.
 */
export type ScaleSignal<TOwner extends Node = Node> = Vector2Signal<TOwner> &
  TransformSpaces<EnhancedTransformMethod<TOwner>> &
  Record<Axis, ComponentSpaces<TOwner>>;

/**
 * A rotation signal, in degrees, that can be read, set, and tweened in other
 * coordinate spaces.
 */
export type RotationSignal<TOwner extends Node = Node> = Signal<
  number,
  number,
  TOwner
> &
  TransformSpaces<EnhancedRotationMethod<TOwner>>;

/**
 * A computed point of a layout node, like `top` or `left`. Setting it moves
 * the node.
 *
 * @example
 * ```typescript
 * yield* node.left.abs(other.right.abs(), 1);
 * yield* node.right.x.view(view.width() / 2, 1);
 * ```
 */
export type LayoutPositionSignal<TOwner extends Node = Node> =
  SimpleVector2Signal<TOwner> &
    TransformSpaces<EnhancedTransformMethod<TOwner>> &
    Record<Axis, ComponentTransformMethod<TOwner> & ComponentSpaces<TOwner>>;

function createSpaceMethod<TSetterValue, TValue extends TSetterValue, TOwner>(
  signal: Signal<TSetterValue, TValue, TOwner>,
  toSpace: (local: TValue) => TValue,
  toLocal: (value: SignalValue<TSetterValue>) => SignalValue<TSetterValue>,
): SpaceMethod<TSetterValue, TValue, TOwner> {
  function method(): TValue;
  function method(value: SignalValue<TSetterValue>): TOwner;
  function method(
    value: SignalValue<TSetterValue>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<TValue>,
  ): SignalGenerator<TSetterValue, TValue>;
  function method(
    value?: SignalValue<TSetterValue>,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<TValue>,
  ): TValue | TOwner | SignalGenerator<TSetterValue, TValue> {
    if (value === undefined) {
      return toSpace(signal());
    }
    if (duration === undefined) {
      return signal(toLocal(value));
    }
    return signal(
      toLocal(value),
      duration,
      timingFunction,
      interpolationFunction,
    );
  }

  return method;
}

function createComponentMethod<TOwner>(
  method: SpaceMethod<PossibleVector2, Vector2, TOwner>,
  axis: Axis,
): ComponentTransformMethod<TOwner> {
  const withComponent = (
    value: SignalValue<number>,
  ): SignalValue<PossibleVector2> => {
    const current = method();
    const build = (component: number) =>
      axis === 'x'
        ? new Vector2(component, current.y)
        : new Vector2(current.x, component);
    return typeof value === 'function' ? () => build(value()) : build(value);
  };

  function component(): number;
  function component(value: SignalValue<number>): TOwner;
  function component(
    value: SignalValue<number>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<number>,
  ): ThreadGenerator;
  function component(
    value?: SignalValue<number>,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<number>,
  ): number | TOwner | ThreadGenerator {
    if (value === undefined) {
      return method()[axis];
    }
    if (duration === undefined) {
      return method(withComponent(value));
    }
    return method(
      withComponent(value),
      duration,
      timingFunction,
      interpolationFunction &&
        ((from, to, progress) =>
          new Vector2(
            interpolationFunction(from.x, to.x, progress),
            interpolationFunction(from.y, to.y, progress),
          )),
    );
  }

  return component;
}

function createVectorSpaceMethod<TOwner>(
  signal: Signal<PossibleVector2, Vector2, TOwner>,
  toSpace: (local: Vector2) => Vector2,
  toLocal: (
    value: SignalValue<PossibleVector2>,
  ) => SignalValue<PossibleVector2>,
): EnhancedTransformMethod<TOwner> {
  const method = createSpaceMethod(signal, toSpace, toLocal);
  return Object.assign(method, {
    x: createComponentMethod(method, 'x'),
    y: createComponentMethod(method, 'y'),
  });
}

function componentSpaces<TOwner>(
  spaces: TransformSpaces<EnhancedTransformMethod<TOwner>>,
  axis: Axis,
): ComponentSpaces<TOwner> {
  return {
    abs: spaces.abs[axis],
    view: spaces.view[axis],
    local: spaces.local[axis],
    relativeTo: node => spaces.relativeTo(node)[axis],
  };
}

function attachSpaces<TMethod>(
  target: object,
  spaces: TransformSpaces<TMethod>,
): void {
  for (const [name, value] of Object.entries(spaces)) {
    Object.defineProperty(target, name, {value, enumerable: false});
  }
}

/** `signal` must hold a point in the parent space of `owner`. */
function createPositionSpaces<TOwner extends Node>(
  signal: Signal<PossibleVector2, Vector2, TOwner>,
  owner: TOwner,
): TransformSpaces<EnhancedTransformMethod<TOwner>> {
  const toAbsolute = (local: Vector2) =>
    local.transformAsPoint(owner.parentToWorld());
  const relativeTo = (node: () => Node) =>
    createVectorSpaceMethod(
      signal,
      local => toAbsolute(local).transformAsPoint(node().worldToLocal()),
      relative =>
        TransformConverter.absoluteToLocalPosition(
          owner,
          TransformConverter.relativeToAbsolutePosition(node(), relative),
        ),
    );

  return {
    abs: createVectorSpaceMethod(signal, toAbsolute, absolute =>
      TransformConverter.absoluteToLocalPosition(owner, absolute),
    ),
    view: relativeTo(() => owner.view()),
    local: createVectorSpaceMethod(
      signal,
      local => local,
      local => local,
    ),
    relativeTo: node => relativeTo(() => node),
  };
}

function createScaleSpaces<TOwner extends Node>(
  signal: Signal<PossibleVector2, Vector2, TOwner>,
  owner: TOwner,
): TransformSpaces<EnhancedTransformMethod<TOwner>> {
  const relativeTo = (node: () => Node) =>
    createVectorSpaceMethod(
      signal,
      () => owner.absoluteScale().div(node().absoluteScale()),
      relative =>
        TransformConverter.absoluteToLocalScale(
          owner,
          TransformConverter.relativeToAbsoluteScale(node(), relative),
        ),
    );

  return {
    abs: createVectorSpaceMethod(
      signal,
      () => {
        const matrix = owner.localToWorld();
        return new Vector2(
          Vector2.magnitude(matrix.m11, matrix.m12),
          Vector2.magnitude(matrix.m21, matrix.m22),
        );
      },
      absolute => TransformConverter.absoluteToLocalScale(owner, absolute),
    ),
    view: relativeTo(() => owner.view()),
    local: createVectorSpaceMethod(
      signal,
      local => local,
      local => local,
    ),
    relativeTo: node => relativeTo(() => node),
  };
}

function createRotationSpaces<TOwner extends Node>(
  signal: Signal<number, number, TOwner>,
  owner: TOwner,
): TransformSpaces<EnhancedRotationMethod<TOwner>> {
  const relativeTo = (node: () => Node) =>
    createSpaceMethod(
      signal,
      () => owner.absoluteRotation() - node().absoluteRotation(),
      relative =>
        TransformConverter.absoluteToLocalRotation(
          owner,
          TransformConverter.relativeToAbsoluteRotation(node(), relative),
        ),
    );

  return {
    abs: createSpaceMethod(
      signal,
      () => {
        const matrix = owner.localToWorld();
        return Vector2.degrees(matrix.m11, matrix.m12);
      },
      absolute => TransformConverter.absoluteToLocalRotation(owner, absolute),
    ),
    view: relativeTo(() => owner.view()),
    local: createSpaceMethod(
      signal,
      local => local,
      local => local,
    ),
    relativeTo: node => relativeTo(() => node),
  };
}

function attachVectorSpaces<TOwner>(
  signal: Vector2Signal<TOwner>,
  spaces: TransformSpaces<EnhancedTransformMethod<TOwner>>,
): void {
  attachSpaces(signal, spaces);
  for (const axis of AXES) {
    attachSpaces(signal[axis], componentSpaces(spaces, axis));
  }
}

export class PositionSignalContext<
  TOwner extends Node = Node,
> extends Vector2SignalContext<TOwner> {
  public constructor(
    entries: ('x' | 'y' | [keyof Vector2, Signal<number, number, TOwner>])[],
    parser: (value: PossibleVector2) => Vector2,
    initial: SignalValue<PossibleVector2>,
    interpolation: InterpolationFunction<Vector2>,
    owner: TOwner,
    extensions: Partial<SignalExtensions<PossibleVector2, Vector2>> = {},
  ) {
    super(entries, parser, initial, interpolation, owner, extensions);
    const signal = super.toSignal();
    attachVectorSpaces(signal, createPositionSpaces(signal, owner));
  }

  public override toSignal(): PositionSignal<TOwner> {
    return this.invokable;
  }
}

export class ScaleSignalContext<
  TOwner extends Node = Node,
> extends Vector2SignalContext<TOwner> {
  public constructor(
    entries: ('x' | 'y' | [keyof Vector2, Signal<number, number, TOwner>])[],
    parser: (value: PossibleVector2) => Vector2,
    initial: SignalValue<PossibleVector2>,
    interpolation: InterpolationFunction<Vector2>,
    owner: TOwner,
    extensions: Partial<SignalExtensions<PossibleVector2, Vector2>> = {},
  ) {
    super(entries, parser, initial, interpolation, owner, extensions);
    const signal = super.toSignal();
    attachVectorSpaces(signal, createScaleSpaces(signal, owner));
  }

  public override toSignal(): ScaleSignal<TOwner> {
    return this.invokable;
  }
}

export class RotationSignalContext<
  TOwner extends Node = Node,
> extends SignalContext<number, number, TOwner> {
  public constructor(
    initial: SignalValue<number> | undefined,
    interpolation: InterpolationFunction<number>,
    owner: TOwner,
    parser: (value: number) => number = value => value,
    extensions: Partial<SignalExtensions<number, number>> = {},
  ) {
    super(initial, interpolation, owner, parser, extensions);
    const signal = super.toSignal();
    attachSpaces(signal, createRotationSpaces(signal, owner));
  }

  public override toSignal(): RotationSignal<TOwner> {
    return this.invokable;
  }
}

/**
 * Context for computed position signals like `top` and `left`.
 *
 * @remarks
 * The getter extension must return a point in the parent space of the owner.
 */
export class LayoutPositionSignalContext<
  TOwner extends Node = Node,
> extends SignalContext<PossibleVector2, Vector2, TOwner> {
  public constructor(
    initial: SignalValue<PossibleVector2> | undefined,
    interpolation: InterpolationFunction<Vector2>,
    owner: TOwner,
    parser: (value: PossibleVector2) => Vector2 = value => new Vector2(value),
    extensions: Partial<SignalExtensions<PossibleVector2, Vector2>> = {},
  ) {
    super(initial, interpolation, owner, parser, extensions);

    const signal = super.toSignal();
    const spaces = createPositionSpaces(signal, owner);
    attachSpaces(signal, spaces);
    for (const axis of AXES) {
      const component = createComponentMethod(spaces.local, axis);
      attachSpaces(component, componentSpaces(spaces, axis));
      Object.defineProperty(signal, axis, {
        value: component,
        enumerable: false,
      });
    }
  }

  public override toSignal(): LayoutPositionSignal<TOwner> {
    return this.invokable;
  }
}

/**
 * Creates an enhanced position signal with coordinate space transformation methods.
 *
 * This decorator creates a position signal that supports operations in multiple coordinate spaces:
 * - **Local**: Relative to the node's parent
 * - **Absolute**: In the global scene coordinates
 * - **View**: In the camera/view coordinate system
 * - **Relative**: In the local space of another node
 *
 * @param prefix - Optional prefix for the underlying X/Y property names.
 *                Can be a string (e.g., 'scale' creates 'scaleX'/'scaleY') or
 *                an object mapping \{x: 'propX', y: 'propY'\}
 *
 * @example
 * ```typescript
 * class MyNode extends Node {
 *   \@positionSignal()
 *   declare readonly position: PositionSignal<this>;
 *
 *   \@positionSignal('anchor')
 *   declare readonly anchor: PositionSignal<this>; // Uses anchorX/anchorY
 * }
 * ```
 */
export function positionSignal(
  prefix?: string | Record<string, string>,
): PropertyDecorator {
  return (target, key) => {
    compound(
      typeof prefix === 'object'
        ? prefix
        : {
            x: prefix ? `${prefix}X` : 'x',
            y: prefix ? `${prefix}Y` : 'y',
          },
      PositionSignalContext,
    )(target, key);
    wrapper(Vector2)(target, key);
  };
}

/**
 * Creates an enhanced scale signal with coordinate space transformation methods.
 *
 * Scale signals support operations in multiple coordinate spaces:
 * - **Local**: Scale relative to the node's parent
 * - **Absolute**: Scale in global scene coordinates
 * - **View**: Scale in camera/view coordinate system
 * - **Relative**: Scale relative to another node's scale
 *
 * @param prefix - Optional prefix for the underlying X/Y property names
 *
 * @example
 * ```typescript
 * class MyNode extends Node {
 *   \@scaleSignal('scale')
 *   declare readonly scale: ScaleSignal<this>;
 * }
 *
 * // Usage:
 * node.scale([2, 1.5]);                  // Local scale
 * node.scale.abs([4, 3]);                // Absolute scale
 * node.scale.relativeTo(parent)([0.5, 0.5]); // Scale relative to parent
 * ```
 */
export function scaleSignal(
  prefix?: string | Record<string, string>,
): PropertyDecorator {
  return (target, key) => {
    compound(
      typeof prefix === 'object'
        ? prefix
        : {
            x: prefix ? `${prefix}X` : 'x',
            y: prefix ? `${prefix}Y` : 'y',
          },
      ScaleSignalContext,
    )(target, key);
    wrapper(Vector2)(target, key);
  };
}

/**
 * Creates an enhanced rotation signal with coordinate space transformation methods.
 *
 * Rotation signals work with degrees and support operations in multiple coordinate spaces:
 * - **Local**: Rotation relative to the node's parent
 * - **Absolute**: Rotation in global scene coordinates
 * - **View**: Rotation in camera/view coordinate system
 * - **Relative**: Rotation relative to another node's rotation
 *
 * @example
 * ```typescript
 * class MyNode extends Node {
 *   \@rotationSignal()
 *   declare readonly rotation: RotationSignal<this>;
 * }
 *
 * // Usage:
 * node.rotation(45);                     // Local rotation (45 degrees)
 * node.rotation.abs(90);                 // Absolute rotation (90 degrees)
 * node.rotation.relativeTo(other)(180);  // 180 degrees relative to other node
 * ```
 */
export function rotationSignal(): PropertyDecorator {
  return (target, key) => {
    const meta = getPropertyMetaOrCreate<number>(target, key);
    addInitializer(target, (instance: Node) => {
      const initial = meta.default;
      const parser = meta.parser?.bind(instance) ?? ((value: number) => value);
      const signalContext = new RotationSignalContext(
        initial,
        meta.interpolationFunction ?? deepLerp,
        instance,
        parser,
        makeSignalExtensions(meta, instance, key as string),
      );

      // Use Object.defineProperty to avoid casting
      Object.defineProperty(instance, key, {
        value: signalContext.toSignal(),
        writable: false,
        enumerable: true,
        configurable: false,
      });
    });
  };
}
