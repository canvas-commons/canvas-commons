import {
  DEFAULT,
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
  unwrap,
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
 * // Convert a view space scale to local coordinates
 * const localScale = TransformConverter.viewToLocalScale(node, [2, 2]);
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
      const parentAbsScale = owner.parent()?.absoluteScale() ?? Vector2.one;
      return val.div(parentAbsScale);
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
      val.add(targetNode.absolutePosition()),
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

  public static viewToLocalPosition(
    owner: Node,
    viewValue: SignalValue<PossibleVector2>,
  ): SignalValue<PossibleVector2> {
    return this.wrapVectorSignalTransform(viewValue, val => {
      const worldPos = val.transformAsPoint(owner.view().localToWorld());
      return worldPos.transformAsPoint(owner.worldToParent());
    });
  }

  public static viewToLocalScale(
    owner: Node,
    viewValue: SignalValue<PossibleVector2>,
  ): SignalValue<PossibleVector2> {
    return this.wrapVectorSignalTransform(viewValue, val => {
      const viewMatrix = owner.view().localToWorld();
      const [xMagnitude, yMagnitude] = this.getViewScaleMagnitudes(viewMatrix);
      return new Vector2(val.x / xMagnitude, val.y / yMagnitude);
    });
  }

  public static viewToLocalRotation(
    owner: Node,
    viewValue: SignalValue<number>,
  ): SignalValue<number> {
    return this.wrapScalarSignalTransform(
      viewValue,
      val => val - this.getViewRotation(owner),
    );
  }

  public static getViewRotation(owner: Node): number {
    const viewMatrix = owner.view().localToWorld();
    return Vector2.degrees(viewMatrix.m11, viewMatrix.m12);
  }

  public static calculateViewSpaceScale(
    owner: Node,
    localScale: Vector2,
  ): Vector2 {
    const viewMatrix = owner.view().localToWorld();
    return new Vector2(
      Vector2.magnitude(
        viewMatrix.m11 * localScale.x,
        viewMatrix.m12 * localScale.x,
      ),
      Vector2.magnitude(
        viewMatrix.m21 * localScale.y,
        viewMatrix.m22 * localScale.y,
      ),
    );
  }

  private static getViewScaleMagnitudes(
    viewMatrix: DOMMatrix,
  ): [number, number] {
    return [
      Vector2.magnitude(viewMatrix.m11, viewMatrix.m12),
      Vector2.magnitude(viewMatrix.m21, viewMatrix.m22),
    ];
  }

  public static absoluteToLocalLayoutPosition(
    owner: Node,
    absoluteValue: SignalValue<PossibleVector2>,
  ): SignalValue<PossibleVector2> {
    return this.wrapVectorSignalTransform(absoluteValue, val =>
      val.transformAsPoint(owner.worldToLocal()),
    );
  }
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

const GETTER_ARGS = 0;
const SETTER_ARGS = 1;

/**
 * Enhanced transform method interface that provides both vector and component access.
 *
 * This interface allows you to work with 2D transforms in multiple ways:
 * - Get/set the entire vector: `position()` or `position([x, y])`
 * - Animate the vector: `position([x, y], duration)`
 * - Access individual components: `position.x()` or `position.y()`
 * - Animate components: `position.x(value, duration)`
 *
 * @typeParam TOwner - The type of the object that owns this transform method
 */
interface EnhancedTransformMethod<TOwner> {
  /** Get the current transform value */
  (): Vector2;
  /** Set the transform value immediately */
  (value: SignalValue<PossibleVector2>): TOwner;
  /** Animate the transform to a new value */
  (
    value: SignalValue<PossibleVector2>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): SignalGenerator<PossibleVector2, Vector2>;
  /** Access to the X component of the transform */
  x: ComponentTransformMethod<TOwner>;
  /** Access to the Y component of the transform */
  y: ComponentTransformMethod<TOwner>;
}

// Node-based transform method interface (takes a node parameter)
interface NodeTransformMethod<TOwner extends Node> {
  (node: Node): CurriedRelativeTransformSignal<TOwner>;
}

// Transform-specific signal helpers with enhanced component-wise support
interface PositionSignalHelpers<TOwner extends Node> {
  abs: EnhancedTransformMethod<TOwner>;
  relativeTo: NodeTransformMethod<TOwner>;
  view: EnhancedTransformMethod<TOwner>;
  local: EnhancedTransformMethod<TOwner>;
}

interface ScaleSignalHelpers<TOwner extends Node> {
  abs: EnhancedTransformMethod<TOwner>;
  relativeTo: NodeScaleTransformMethod<TOwner>;
  view: EnhancedTransformMethod<TOwner>;
  local: EnhancedTransformMethod<TOwner>;
}

// Node-based scale transform method interface (similar to position but returns scale signal)
interface NodeScaleTransformMethod<TOwner extends Node> {
  (node: Node): CurriedRelativeScaleSignal<TOwner>;
}

// Rotation-specific transform method interface (scalar)
interface EnhancedRotationMethod<TOwner extends Node> {
  (): number;
  (value: SignalValue<number>): TOwner;
  (
    value: SignalValue<number>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<number>,
  ): SignalGenerator<number, number>;
}

// Node-based rotation transform method interface
interface NodeRotationMethod<TOwner extends Node> {
  (node: Node): CurriedRelativeRotationSignal<TOwner>;
}

interface RotationSignalHelpers<TOwner extends Node> {
  abs: EnhancedRotationMethod<TOwner>;
  relativeTo: NodeRotationMethod<TOwner>;
  view: EnhancedRotationMethod<TOwner>;
  local: EnhancedRotationMethod<TOwner>;
}

/**
 * Enhanced position signal that provides coordinate space transformation methods.
 *
 * @example
 * ```typescript
 * // Get/set position in different coordinate spaces
 * node.position([100, 200]);              // Set local position
 * node.position.abs([300, 400]);          // Set absolute position
 * node.position.relativeTo(other, [50, 0]); // Set position relative to another node
 * node.position.view([0, 0]);             // Set position in view space
 *
 * // Component access
 * node.position.x(150);                   // Set only X coordinate
 * node.position.abs.y(250);               // Set only absolute Y coordinate
 * ```
 */
export type PositionSignal<TOwner extends Node = Node> = Vector2Signal<TOwner> &
  PositionSignalHelpers<TOwner>;

/**
 * Enhanced scale signal that provides coordinate space transformation methods.
 *
 * @example
 * ```typescript
 * // Scale operations in different coordinate spaces
 * node.scale([2, 1.5]);                   // Set local scale
 * node.scale.abs([4, 3]);                 // Set absolute scale
 * node.scale.relativeTo(parent, [0.5, 0.5]); // Scale relative to parent
 * ```
 */
export type ScaleSignal<TOwner extends Node = Node> = Vector2Signal<TOwner> &
  ScaleSignalHelpers<TOwner>;

/**
 * Enhanced rotation signal that provides coordinate space transformation methods.
 *
 * @example
 * ```typescript
 * // Rotation operations in different coordinate spaces
 * node.rotation(45);                      // Set local rotation (degrees)
 * node.rotation.abs(90);                  // Set absolute rotation
 * node.rotation.relativeTo(other, 180);   // Set rotation relative to another node
 * ```
 */
export type RotationSignal<TOwner extends Node = Node> = Signal<
  number,
  number,
  TOwner
> &
  RotationSignalHelpers<TOwner>;

/**
 * Layout position signal for computed position properties like `top`, `left`, etc.
 *
 * These signals compute their values dynamically based on the node's size and origin,
 * and delegate setting operations to the main position signal.
 */
export type LayoutPositionSignal<TOwner extends Node = Node> =
  SimpleVector2Signal<TOwner> & PositionSignalHelpers<TOwner>;

// Shared helper functions for creating enhanced transform methods

/**
 * UNIFIED TRANSFORM SIGNAL ARCHITECTURE
 *
 * Every signal in the system is a coordinate space transformation:
 * - Forward transform: base space → target space
 * - Inverse transform: target space → base space
 * - Component access and tweening built on top
 */

// Type for component configuration
interface ComponentConfig<TTarget> {
  getComponent: (target: TTarget, component: 'x' | 'y') => number;
  setComponent: (
    target: TTarget,
    component: 'x' | 'y',
    value: number,
  ) => TTarget;
}

// Standard Vector2 component configuration
const VECTOR2_COMPONENT_CONFIG: ComponentConfig<Vector2> = {
  getComponent: (vec: Vector2, component: 'x' | 'y') => vec[component],
  setComponent: (vec: Vector2, component: 'x' | 'y', value: number) =>
    new Vector2(component === 'x' ? [value, vec.y] : [vec.x, value]),
};

/**
 * Creates a unified transform signal that handles coordinate space transformations.
 * This is the foundation for all signals (abs, view, local, relativeTo, origin signals).
 */
function createTransformSignal<TBase, TTarget, TOwner extends Node>(
  baseGetter: () => TBase,
  baseSetter: (value: SignalValue<TBase>) => TOwner,
  baseTweener: (
    value: SignalValue<TBase>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<TTarget>,
  ) => any,
  forwardTransform: (base: TBase) => TTarget,
  inverseTransform: (target: TTarget) => SignalValue<TBase>,
  componentConfig?: ComponentConfig<TTarget>,
) {
  // Main signal function with proper overloads
  function signal(): TTarget;
  function signal(value: SignalValue<TTarget>): TOwner;
  function signal(
    value: SignalValue<TTarget>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<TTarget>,
  ): any;
  function signal(
    value?: SignalValue<TTarget>,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<TTarget>,
  ): TTarget | TOwner | any {
    if (arguments.length === 0) {
      // Getter: apply forward transform
      return forwardTransform(baseGetter());
    }

    if (arguments.length === 1) {
      // Setter: apply inverse transform and store
      const baseValue = inverseTransform(unwrap(value!));
      return baseSetter(baseValue);
    }

    // Tweener: apply inverse transform and animate
    const baseValue = inverseTransform(unwrap(value!));
    return baseTweener(
      baseValue,
      duration!,
      timingFunction,
      interpolationFunction,
    );
  }

  // Add component accessors for Vector2-like targets
  if (componentConfig) {
    const {getComponent, setComponent} = componentConfig;

    (signal as any).x = function (
      value?: SignalValue<number>,
      duration?: number,
      timingFunction?: TimingFunction,
      interpolationFunction?: InterpolationFunction<TTarget>,
    ): number | TOwner | any {
      if (arguments.length === 0) {
        return getComponent(signal(), 'x');
      }

      const currentTarget = signal();
      const newTarget = setComponent(currentTarget, 'x', unwrap(value!));

      if (arguments.length === 1) {
        return signal(newTarget);
      }

      // Component tweening
      return signal(
        newTarget,
        duration!,
        timingFunction,
        interpolationFunction as InterpolationFunction<TTarget>,
      );
    };

    (signal as any).y = function (
      value?: SignalValue<number>,
      duration?: number,
      timingFunction?: TimingFunction,
      interpolationFunction?: InterpolationFunction<TTarget>,
    ): number | TOwner | any {
      if (arguments.length === 0) {
        return getComponent(signal(), 'y');
      }

      const currentTarget = signal();
      const newTarget = setComponent(currentTarget, 'y', unwrap(value!));

      if (arguments.length === 1) {
        return signal(newTarget);
      }

      // Component tweening
      return signal(
        newTarget,
        duration!,
        timingFunction,
        interpolationFunction as InterpolationFunction<TTarget>,
      );
    };
  }

  return signal;
}

/**
 * Create a curried relative transform signal.
 */
function createCurriedRelativeSignal<TOwner extends Node = Node>(
  baseContext: PositionSignalContext<TOwner>,
  targetNode: Node,
): CurriedRelativeTransformSignal<TOwner> {
  // Create the main function
  const curriedSignal = function (
    ...args: any[]
  ): Vector2 | TOwner | SignalGenerator<PossibleVector2, Vector2> {
    if (args.length === 0) {
      // Getter: compute relative position using internal method
      return baseContext['relativeToImpl'](targetNode);
    }

    // Setter/Tweener: delegate to internal method
    const [value, duration, timingFunction, interpolationFunction] = args;
    return baseContext['relativeToImpl'](
      targetNode,
      value,
      duration,
      timingFunction,
      interpolationFunction,
    );
  };

  // Add component accessors
  Object.defineProperty(curriedSignal, 'x', {
    get() {
      return function (...args: any[]): number | TOwner | ThreadGenerator {
        if (args.length === 0) {
          return (curriedSignal() as Vector2).x;
        }
        // Component setter/tweener - build new vector and set/animate it
        const current = curriedSignal() as Vector2;
        if (args.length === 1) {
          return curriedSignal(
            new Vector2([unwrap(args[0]), current.y]),
          ) as TOwner;
        }
        // Component tweener
        const [value, duration, timingFunction, interpolationFunction] = args;
        return curriedSignal(
          new Vector2([unwrap(value), current.y]),
          duration,
          timingFunction,
          interpolationFunction as any,
        ) as ThreadGenerator;
      };
    },
  });

  Object.defineProperty(curriedSignal, 'y', {
    get() {
      return function (...args: any[]): number | TOwner | ThreadGenerator {
        if (args.length === 0) {
          return (curriedSignal() as Vector2).y;
        }
        // Component setter/tweener - build new vector and set/animate it
        const current = curriedSignal() as Vector2;
        if (args.length === 1) {
          return curriedSignal(
            new Vector2([current.x, unwrap(args[0])]),
          ) as TOwner;
        }
        // Component tweener
        const [value, duration, timingFunction, interpolationFunction] = args;
        return curriedSignal(
          new Vector2([current.x, unwrap(value)]),
          duration,
          timingFunction,
          interpolationFunction as any,
        ) as ThreadGenerator;
      };
    },
  });

  return curriedSignal as CurriedRelativeTransformSignal<TOwner>;
}

// Properly typed curried signal interface for position
interface CurriedRelativeTransformSignal<TOwner extends Node> {
  (): Vector2;
  (value: SignalValue<PossibleVector2>): TOwner;
  (
    value: SignalValue<PossibleVector2>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): SignalGenerator<PossibleVector2, Vector2>;

  x: ComponentTransformMethod<TOwner>;
  y: ComponentTransformMethod<TOwner>;
}

/**
 * Create a curried relative transform signal for rotation.
 */
function createCurriedRelativeRotationSignal<TOwner extends Node = Node>(
  baseContext: RotationSignalContext<TOwner>,
  targetNode: Node,
): CurriedRelativeRotationSignal<TOwner> {
  // Create the main function
  const curriedSignal = function (
    ...args: any[]
  ): number | TOwner | SignalGenerator<number, number> {
    if (args.length === 0) {
      // Getter: compute relative rotation using internal method
      return baseContext['relativeToImpl'](targetNode);
    }

    // Setter/Tweener: delegate to internal method
    const [value, duration, timingFunction, interpolationFunction] = args;
    return baseContext['relativeToImpl'](
      targetNode,
      value,
      duration,
      timingFunction,
      interpolationFunction,
    );
  };

  return curriedSignal as CurriedRelativeRotationSignal<TOwner>;
}

/**
 * Create a curried relative transform signal for scale.
 */
function createCurriedRelativeScaleSignal<TOwner extends Node = Node>(
  baseContext: ScaleSignalContext<TOwner>,
  targetNode: Node,
): CurriedRelativeScaleSignal<TOwner> {
  // Create the main function
  const curriedSignal = function (
    ...args: any[]
  ): Vector2 | TOwner | SignalGenerator<PossibleVector2, Vector2> {
    if (args.length === 0) {
      // Getter: compute relative scale
      const absScale = (baseContext as any).owner.absoluteScale();
      const targetAbsScale = targetNode.absoluteScale();
      return absScale.div(targetAbsScale);
    }

    // Setter/Tweener: convert relative scale to local scale and set it
    const [value, duration, timingFunction, interpolationFunction] = args;
    const absoluteValue = TransformConverter.relativeToAbsoluteScale(
      targetNode,
      value,
    );
    const localValue = TransformConverter.absoluteToLocalScale(
      (baseContext as any).owner,
      absoluteValue,
    );
    return (baseContext as any).invoke(
      localValue,
      duration,
      timingFunction,
      interpolationFunction,
    ) as TOwner | SignalGenerator<PossibleVector2, Vector2>;
  };

  // Add component accessors
  Object.defineProperty(curriedSignal, 'x', {
    get() {
      return function (...args: any[]): number | TOwner | ThreadGenerator {
        if (args.length === 0) {
          return (curriedSignal() as Vector2).x;
        }
        // Component setter/tweener - build new vector and set/animate it
        const current = curriedSignal() as Vector2;
        if (args.length === 1) {
          return curriedSignal(
            new Vector2([unwrap(args[0]), current.y]),
          ) as TOwner;
        }
        // Component tweener
        const [value, duration, timingFunction, interpolationFunction] = args;
        return curriedSignal(
          new Vector2([unwrap(value), current.y]),
          duration,
          timingFunction,
          interpolationFunction as any,
        ) as ThreadGenerator;
      };
    },
  });

  Object.defineProperty(curriedSignal, 'y', {
    get() {
      return function (...args: any[]): number | TOwner | ThreadGenerator {
        if (args.length === 0) {
          return (curriedSignal() as Vector2).y;
        }
        // Component setter/tweener - build new vector and set/animate it
        const current = curriedSignal() as Vector2;
        if (args.length === 1) {
          return curriedSignal(
            new Vector2([current.x, unwrap(args[0])]),
          ) as TOwner;
        }
        // Component tweener
        const [value, duration, timingFunction, interpolationFunction] = args;
        return curriedSignal(
          new Vector2([current.x, unwrap(value)]),
          duration,
          timingFunction,
          interpolationFunction as any,
        ) as ThreadGenerator;
      };
    },
  });

  return curriedSignal as CurriedRelativeScaleSignal<TOwner>;
}

// Properly typed curried signal interface for rotation
interface CurriedRelativeRotationSignal<TOwner extends Node> {
  (): number;
  (value: SignalValue<number>): TOwner;
  (
    value: SignalValue<number>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<number>,
  ): SignalGenerator<number, number>;
}

// Properly typed curried signal interface for scale
interface CurriedRelativeScaleSignal<TOwner extends Node> {
  (): Vector2;
  (value: SignalValue<PossibleVector2>): TOwner;
  (
    value: SignalValue<PossibleVector2>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): SignalGenerator<PossibleVector2, Vector2>;

  x: ComponentTransformMethod<TOwner>;
  y: ComponentTransformMethod<TOwner>;
}

// Position-aware Vector2 signal context
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

    // Create enhanced transform methods using unified approach
    Object.defineProperty(this.invokable, 'abs', {
      value: createTransformSignal<PossibleVector2, Vector2, TOwner>(
        () => this.get(),
        value => this.invoke(value) as TOwner,
        (value, duration, timingFunction, interpolationFunction) =>
          this.invoke(value, duration, timingFunction, interpolationFunction),
        local =>
          new Vector2(local).transformAsPoint(this.owner.parentToWorld()),
        absolute =>
          TransformConverter.absoluteToLocalPosition(
            this.owner,
            unwrap(absolute!) as PossibleVector2,
          ),
        VECTOR2_COMPONENT_CONFIG,
      ),
      enumerable: false,
    });

    Object.defineProperty(this.invokable, 'view', {
      value: createTransformSignal<PossibleVector2, Vector2, TOwner>(
        () => this.get(),
        value => this.invoke(value) as TOwner,
        (value, duration, timingFunction, interpolationFunction) =>
          this.invoke(value, duration, timingFunction, interpolationFunction),
        local => {
          // Transform local position to world, then world to view space
          const worldPos = new Vector2(local).transformAsPoint(
            this.owner.parentToWorld(),
          );
          return worldPos.transformAsPoint(this.owner.view().worldToLocal());
        },
        view =>
          TransformConverter.viewToLocalPosition(
            this.owner,
            unwrap(view!) as PossibleVector2,
          ),
        VECTOR2_COMPONENT_CONFIG,
      ),
      enumerable: false,
    });

    Object.defineProperty(this.invokable, 'local', {
      value: createTransformSignal<PossibleVector2, Vector2, TOwner>(
        () => this.get(),
        value => this.invoke(value) as TOwner,
        (value, duration, timingFunction, interpolationFunction) =>
          this.invoke(value, duration, timingFunction, interpolationFunction),
        local => new Vector2(local),
        local => local,
        VECTOR2_COMPONENT_CONFIG,
      ),
      enumerable: false,
    });

    Object.defineProperty(this.invokable, 'relativeTo', {
      value: this.relativeTo.bind(this),
      enumerable: false,
    });
  }

  public override toSignal(): PositionSignal<TOwner> {
    return this.invokable as PositionSignal<TOwner>;
  }

  // Internal method for the actual relativeTo implementation
  private relativeToImpl(
    node: Node,
    value?: SignalValue<PossibleVector2>,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): Vector2 | TOwner | SignalGenerator<PossibleVector2, Vector2> {
    if (arguments.length === 1) {
      const absPosition = this.owner.absolutePosition();
      const targetAbsPosition = node.absolutePosition();
      return absPosition.sub(targetAbsPosition);
    }

    // Convert relative value to local value and set it
    const absoluteValue = TransformConverter.relativeToAbsolutePosition(
      node,
      value!,
    );
    const localValue = TransformConverter.absoluteToLocalPosition(
      this.owner,
      absoluteValue,
    );
    return this.invoke(
      localValue,
      duration,
      timingFunction,
      interpolationFunction,
    ) as TOwner | SignalGenerator<PossibleVector2, Vector2>;
  }

  public relativeTo(node: Node): CurriedRelativeTransformSignal<TOwner> {
    return createCurriedRelativeSignal(this, node);
  }
}

// Scale-aware Vector2 signal context
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

    // Create enhanced transform methods using unified approach
    Object.defineProperty(this.invokable, 'abs', {
      value: createTransformSignal<PossibleVector2, Vector2, TOwner>(
        () => this.get(),
        value => this.invoke(value) as TOwner,
        (value, duration, timingFunction, interpolationFunction) =>
          this.invoke(value, duration, timingFunction, interpolationFunction),
        () => {
          const matrix = this.owner.localToWorld();
          return new Vector2(
            Vector2.magnitude(matrix.m11, matrix.m12),
            Vector2.magnitude(matrix.m21, matrix.m22),
          );
        },
        absolute =>
          TransformConverter.absoluteToLocalScale(
            this.owner,
            unwrap(absolute!) as PossibleVector2,
          ),
        VECTOR2_COMPONENT_CONFIG,
      ),
      enumerable: false,
    });

    Object.defineProperty(this.invokable, 'view', {
      value: createTransformSignal<PossibleVector2, Vector2, TOwner>(
        () => this.get(),
        value => this.invoke(value) as TOwner,
        (value, duration, timingFunction, interpolationFunction) =>
          this.invoke(value, duration, timingFunction, interpolationFunction),
        local =>
          TransformConverter.calculateViewSpaceScale(
            this.owner,
            new Vector2(local),
          ),
        view =>
          TransformConverter.viewToLocalScale(
            this.owner,
            unwrap(view!) as PossibleVector2,
          ),
        VECTOR2_COMPONENT_CONFIG,
      ),
      enumerable: false,
    });

    Object.defineProperty(this.invokable, 'local', {
      value: createTransformSignal<PossibleVector2, Vector2, TOwner>(
        () => this.get(),
        value => this.invoke(value) as TOwner,
        (value, duration, timingFunction, interpolationFunction) =>
          this.invoke(value, duration, timingFunction, interpolationFunction),
        local => new Vector2(local),
        local => local,
        VECTOR2_COMPONENT_CONFIG,
      ),
      enumerable: false,
    });

    Object.defineProperty(this.invokable, 'relativeTo', {
      value: this.relativeTo.bind(this),
      enumerable: false,
    });
  }

  public override toSignal(): ScaleSignal<TOwner> {
    return this.invokable as ScaleSignal<TOwner>;
  }

  public relativeTo(node: Node): CurriedRelativeScaleSignal<TOwner> {
    return createCurriedRelativeScaleSignal(this, node);
  }
}

// Rotation-aware signal context
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

    Object.defineProperty(this.invokable, 'abs', {
      value: this.abs.bind(this),
      enumerable: false,
    });

    Object.defineProperty(this.invokable, 'relativeTo', {
      value: this.relativeTo.bind(this),
      enumerable: false,
    });

    Object.defineProperty(this.invokable, 'view', {
      value: this.view.bind(this),
      enumerable: false,
    });

    Object.defineProperty(this.invokable, 'local', {
      value: this.local.bind(this),
      enumerable: false,
    });
  }

  public override toSignal(): RotationSignal<TOwner> {
    return this.invokable as RotationSignal<TOwner>;
  }

  public abs(): number;
  public abs(value: SignalValue<number>): TOwner;
  public abs(
    value: SignalValue<number>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<number>,
  ): SignalGenerator<number, number>;
  public abs(
    value?: SignalValue<number>,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<number>,
  ): number | TOwner | SignalGenerator<number, number> {
    if (arguments.length === 0) {
      // Get absolute rotation by extracting it from localToWorld matrix
      const matrix = this.owner.localToWorld();
      return Vector2.degrees(matrix.m11, matrix.m12);
    }

    // Convert absolute rotation to local rotation and set it
    const localValue = TransformConverter.absoluteToLocalRotation(
      this.owner,
      value!,
    );
    return this.invoke(
      localValue,
      duration,
      timingFunction,
      interpolationFunction,
    ) as TOwner | SignalGenerator<number, number>;
  }

  // Internal method for the actual relativeTo implementation
  private relativeToImpl(
    node: Node,
    value?: SignalValue<number>,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<number>,
  ): number | TOwner | SignalGenerator<number, number> {
    if (arguments.length === 1) {
      const absRotation = this.owner.absoluteRotation();
      const targetAbsRotation = node.absoluteRotation();
      return absRotation - targetAbsRotation;
    }

    // Convert relative rotation to local rotation and set it
    const absoluteValue = TransformConverter.relativeToAbsoluteRotation(
      node,
      value!,
    );
    const localValue = TransformConverter.absoluteToLocalRotation(
      this.owner,
      absoluteValue,
    );
    return this.invoke(
      localValue,
      duration,
      timingFunction,
      interpolationFunction,
    ) as TOwner | SignalGenerator<number, number>;
  }

  public relativeTo(node: Node): CurriedRelativeRotationSignal<TOwner> {
    return createCurriedRelativeRotationSignal(this, node);
  }

  public view(): number;
  public view(value: SignalValue<number>): TOwner;
  public view(
    value: SignalValue<number>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<number>,
  ): SignalGenerator<number, number>;
  public view(
    value?: SignalValue<number>,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<number>,
  ): number | TOwner | SignalGenerator<number, number> {
    if (arguments.length === 0) {
      // For rotation in view space, we need to get the rotation relative to view
      const currentRotation = this.get();
      const viewRotation = TransformConverter.getViewRotation(this.owner);
      return currentRotation + viewRotation;
    }

    // Convert view space rotation to local rotation and set it
    const localValue = TransformConverter.viewToLocalRotation(
      this.owner,
      value!,
    );
    return this.invoke(
      localValue,
      duration,
      timingFunction,
      interpolationFunction,
    ) as TOwner | SignalGenerator<number, number>;
  }

  public local(): number;
  public local(value: SignalValue<number>): TOwner;
  public local(
    value: SignalValue<number>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<number>,
  ): SignalGenerator<number, number>;
  public local(
    value?: SignalValue<number>,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<number>,
  ): number | TOwner | SignalGenerator<number, number> {
    if (arguments.length === 0) {
      return this.get();
    }

    // Local value is just the raw value
    return this.invoke(
      value!,
      duration,
      timingFunction,
      interpolationFunction,
    ) as TOwner | SignalGenerator<number, number>;
  }
}

// Custom setter function type for layout positions
type LayoutPositionSetter<TOwner> = (
  value: SignalValue<PossibleVector2> | typeof DEFAULT,
) => TOwner;

// Layout position signal context (for computed position signals like top, left, etc.)
export class LayoutPositionSignalContext<
  TOwner extends Node = Node,
> extends SignalContext<PossibleVector2, Vector2, TOwner> {
  private readonly hasCustomDelegate: boolean;

  public constructor(
    initial: SignalValue<PossibleVector2> | undefined,
    interpolation: InterpolationFunction<Vector2>,
    owner: TOwner,
    parser: (value: PossibleVector2) => Vector2 = value => new Vector2(value),
    extensions: Partial<SignalExtensions<PossibleVector2, Vector2>> = {},
  ) {
    super(initial, interpolation, owner, parser, extensions);

    // Track if we have custom delegation behavior
    this.hasCustomDelegate = Boolean(extensions.getter || extensions.setter);

    // Create enhanced transform methods with component access using shared helpers
    const absMethod = this.abs.bind(this);

    // Add component methods to abs
    (absMethod as any).x = function (
      value?: SignalValue<number>,
      duration?: number,
      timingFunction?: TimingFunction,
      interpolationFunction?: InterpolationFunction<number>,
    ): number | TOwner | ThreadGenerator {
      if (arguments.length === 0) {
        return absMethod().x;
      }
      // Get the current absolute position once and preserve the y component
      const currentAbsPos = absMethod();
      const newAbsPos = new Vector2([unwrap(value!), currentAbsPos.y]);
      if (arguments.length === 1) {
        return absMethod(newAbsPos);
      }
      return absMethod(
        newAbsPos,
        duration!,
        timingFunction,
        interpolationFunction as any,
      ) as ThreadGenerator;
    };

    (absMethod as any).y = function (
      value?: SignalValue<number>,
      duration?: number,
      timingFunction?: TimingFunction,
      interpolationFunction?: InterpolationFunction<number>,
    ): number | TOwner | ThreadGenerator {
      if (arguments.length === 0) {
        return absMethod().y;
      }
      // Get the current absolute position once and preserve the x component
      const currentAbsPos = absMethod();
      const newAbsPos = new Vector2([currentAbsPos.x, unwrap(value!)]);
      if (arguments.length === 1) {
        return absMethod(newAbsPos);
      }
      return absMethod(
        newAbsPos,
        duration!,
        timingFunction,
        interpolationFunction as any,
      ) as ThreadGenerator;
    };

    Object.defineProperty(this.invokable, 'abs', {
      value: absMethod,
      enumerable: false,
    });

    Object.defineProperty(this.invokable, 'relativeTo', {
      value: this.relativeTo.bind(this),
      enumerable: false,
    });

    const viewMethod = this.view.bind(this);

    // Add component methods to view
    (viewMethod as any).x = function (
      this: LayoutPositionSignalContext<TOwner>,
      value?: SignalValue<number>,
      duration?: number,
      timingFunction?: TimingFunction,
      interpolationFunction?: InterpolationFunction<number>,
    ): number | TOwner | ThreadGenerator {
      if (arguments.length === 0) {
        return viewMethod().x;
      }

      // For view space component setting, we need to be more precise about preserving the other component
      // Get the current LOCAL position and current VIEW position
      const currentLocal = this.get();
      const currentView = currentLocal
        .transformAsPoint(this.owner.localToWorld())
        .transformAsPoint(this.owner.view().worldToLocal());

      // Create target view position with only the x component changed
      const targetView = new Vector2([unwrap(value!), currentView.y]);

      // Transform to local and set
      const targetLocal = new Vector2(
        unwrap(TransformConverter.viewToLocalPosition(this.owner, targetView)),
      );

      if (arguments.length === 1) {
        return this.invoke(targetLocal) as TOwner;
      }
      return this.invoke(
        targetLocal,
        duration!,
        timingFunction,
        interpolationFunction as any,
      ) as ThreadGenerator;
    }.bind(this);

    (viewMethod as any).y = function (
      this: LayoutPositionSignalContext<TOwner>,
      value?: SignalValue<number>,
      duration?: number,
      timingFunction?: TimingFunction,
      interpolationFunction?: InterpolationFunction<number>,
    ): number | TOwner | ThreadGenerator {
      if (arguments.length === 0) {
        return viewMethod().y;
      }

      // Get the current LOCAL position and current VIEW position
      const currentLocal = this.get();
      const currentView = currentLocal
        .transformAsPoint(this.owner.localToWorld())
        .transformAsPoint(this.owner.view().worldToLocal());

      // Create target view position with only the y component changed
      const targetView = new Vector2([currentView.x, unwrap(value!)]);

      // Transform to local and set
      const targetLocal = new Vector2(
        unwrap(TransformConverter.viewToLocalPosition(this.owner, targetView)),
      );

      if (arguments.length === 1) {
        return this.invoke(targetLocal) as TOwner;
      }
      return this.invoke(
        targetLocal,
        duration!,
        timingFunction,
        interpolationFunction as any,
      ) as ThreadGenerator;
    }.bind(this);

    Object.defineProperty(this.invokable, 'view', {
      value: viewMethod,
      enumerable: false,
    });

    const localMethod = this.local.bind(this);

    // Add component methods to local
    (localMethod as any).x = function (
      value?: SignalValue<number>,
      duration?: number,
      timingFunction?: TimingFunction,
      interpolationFunction?: InterpolationFunction<number>,
    ): number | TOwner | ThreadGenerator {
      if (arguments.length === 0) {
        return localMethod().x;
      }
      // Get the current local position once and preserve the y component
      const currentLocalPos = localMethod();
      const newLocalPos = new Vector2([unwrap(value!), currentLocalPos.y]);
      if (arguments.length === 1) {
        return localMethod(newLocalPos);
      }
      return localMethod(
        newLocalPos,
        duration!,
        timingFunction,
        interpolationFunction as any,
      ) as ThreadGenerator;
    };

    (localMethod as any).y = function (
      value?: SignalValue<number>,
      duration?: number,
      timingFunction?: TimingFunction,
      interpolationFunction?: InterpolationFunction<number>,
    ): number | TOwner | ThreadGenerator {
      if (arguments.length === 0) {
        return localMethod().y;
      }
      // Get the current local position once and preserve the x component
      const currentLocalPos = localMethod();
      const newLocalPos = new Vector2([currentLocalPos.x, unwrap(value!)]);
      if (arguments.length === 1) {
        return localMethod(newLocalPos);
      }
      return localMethod(
        newLocalPos,
        duration!,
        timingFunction,
        interpolationFunction as any,
      ) as ThreadGenerator;
    };

    Object.defineProperty(this.invokable, 'local', {
      value: localMethod,
      enumerable: false,
    });
  }

  /**
   * Override get to use custom getter if available.
   * This enables computed layout positions (e.g., top, left) to calculate their values dynamically.
   */
  public override get(): Vector2 {
    if (this.extensions.getter) {
      return this.extensions.getter();
    }
    return super.get();
  }

  /**
   * Set a custom setter function for layout position delegation.
   * This allows layout signals to delegate setting behavior to position updates.
   */
  public setCustomSetter(setterFunc: LayoutPositionSetter<TOwner>): void {
    this.extensions.setter = setterFunc;
  }

  /**
   * Override invoke to handle layout-specific delegation patterns.
   * Uses custom setter for simple value assignments when available.
   */
  public override invoke(
    value?: SignalValue<PossibleVector2> | typeof DEFAULT,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): Vector2 | TOwner | SignalGenerator<PossibleVector2, Vector2> {
    // Getter: no arguments
    if (arguments.length === GETTER_ARGS) {
      return this.get();
    }

    // Setter: single argument with custom delegate
    if (
      arguments.length === SETTER_ARGS &&
      this.hasCustomDelegate &&
      this.extensions.setter
    ) {
      const result = this.extensions.setter(value!);
      return result !== undefined ? result : this.owner;
    }

    // Animation or fallback to default behavior
    return super.invoke(value, duration, timingFunction, interpolationFunction);
  }

  public override toSignal(): LayoutPositionSignal<TOwner> {
    return this.invokable as LayoutPositionSignal<TOwner>;
  }

  public abs(): Vector2;
  public abs(value: SignalValue<PossibleVector2>): TOwner;
  public abs(
    value: SignalValue<PossibleVector2>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): SignalGenerator<PossibleVector2, Vector2>;
  public abs(
    value?: SignalValue<PossibleVector2>,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): Vector2 | TOwner | SignalGenerator<PossibleVector2, Vector2> {
    if (arguments.length === 0) {
      // For layout position signals, get the current computed value
      const currentValue = this.get();
      return currentValue.transformAsPoint(this.owner.localToWorld());
    }

    // Convert absolute value to local value for this layout position and set it
    const localValue = TransformConverter.absoluteToLocalLayoutPosition(
      this.owner,
      value!,
    );
    return this.invoke(
      localValue,
      duration,
      timingFunction,
      interpolationFunction,
    ) as TOwner | SignalGenerator<PossibleVector2, Vector2>;
  }

  public relativeTo(node: Node): Vector2;
  public relativeTo(node: Node, value: SignalValue<PossibleVector2>): TOwner;
  public relativeTo(
    node: Node,
    value: SignalValue<PossibleVector2>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): SignalGenerator<PossibleVector2, Vector2>;
  public relativeTo(
    node: Node,
    value?: SignalValue<PossibleVector2>,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): Vector2 | TOwner | SignalGenerator<PossibleVector2, Vector2> {
    if (arguments.length === 1) {
      // For layout positions, calculate relative position using absolute coordinates
      const currentValue = this.get();
      const absPosition = currentValue.transformAsPoint(
        this.owner.localToWorld(),
      );
      const targetAbsPosition = node.absolutePosition();
      return absPosition.sub(targetAbsPosition);
    }

    // Convert relative value to local value and set it
    const absoluteValue = TransformConverter.relativeToAbsolutePosition(
      node,
      value!,
    );
    const localValue = TransformConverter.absoluteToLocalLayoutPosition(
      this.owner,
      absoluteValue,
    );
    return this.invoke(
      localValue,
      duration,
      timingFunction,
      interpolationFunction,
    ) as TOwner | SignalGenerator<PossibleVector2, Vector2>;
  }

  public view(): Vector2;
  public view(value: SignalValue<PossibleVector2>): TOwner;
  public view(
    value: SignalValue<PossibleVector2>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): SignalGenerator<PossibleVector2, Vector2>;
  public view(
    value?: SignalValue<PossibleVector2>,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): Vector2 | TOwner | SignalGenerator<PossibleVector2, Vector2> {
    if (arguments.length === 0) {
      const currentValue = this.get();
      return currentValue.transformAsPoint(this.owner.view().localToWorld());
    }

    // Convert view space value to local value and set it
    const localValue = TransformConverter.viewToLocalPosition(
      this.owner,
      value!,
    );
    return this.invoke(
      localValue,
      duration,
      timingFunction,
      interpolationFunction,
    ) as TOwner | SignalGenerator<PossibleVector2, Vector2>;
  }

  public local(): Vector2;
  public local(value: SignalValue<PossibleVector2>): TOwner;
  public local(
    value: SignalValue<PossibleVector2>,
    duration: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): SignalGenerator<PossibleVector2, Vector2>;
  public local(
    value?: SignalValue<PossibleVector2>,
    duration?: number,
    timingFunction?: TimingFunction,
    interpolationFunction?: InterpolationFunction<Vector2>,
  ): Vector2 | TOwner | SignalGenerator<PossibleVector2, Vector2> {
    if (arguments.length === 0) {
      return this.get();
    }

    // Local value is just the raw value
    return this.invoke(
      value!,
      duration,
      timingFunction,
      interpolationFunction,
    ) as TOwner | SignalGenerator<PossibleVector2, Vector2>;
  }
}

/**
 * Creates an enhanced position signal with coordinate space transformation methods.
 *
 * This decorator creates a position signal that supports operations in multiple coordinate spaces:
 * - **Local**: Relative to the node's parent
 * - **Absolute**: In the global scene coordinates
 * - **View**: In the camera/view coordinate system
 * - **Relative**: Relative to another specific node
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
 *   \@positionSignal('offset')
 *   declare readonly offset: PositionSignal<this>; // Uses offsetX/offsetY
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
 * node.scale.relativeTo(parent, [0.5, 0.5]); // Scale relative to parent
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
 * node.rotation.relativeTo(other, 180);  // 180 degrees relative to other node
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
