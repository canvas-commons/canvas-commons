import type {VariableOptions, VariableType} from '../scenes/editableVariables';
import {SignalContext, SimpleSignal} from '../signals';
import {deepLerp} from '../tweening';
import {useScene} from './useScene';
import {useThread} from './useThread';

/**
 * Register a primitive editable variable and get a signal backed by the
 * persisted value.
 *
 * @remarks
 * Creates a signal whose initial value comes from the editor's persisted
 * metadata. The variable will appear in the editor's timeline as a pill that
 * can be selected and edited through the inspector.
 *
 * For complex types use the type-specific factories instead:
 * - `Vector2.createEditableVariable` for vector2 variables
 * - `BBox.createEditableVariable` for bbox variables
 * - `Color.createEditableVariable` for color variables
 *
 * @example
 * ```ts
 * const radius = createEditableVariable('radius', 42);
 * yield* circle().radius(radius(), 1);
 * ```
 *
 * @param name - A unique name for this variable within the scene.
 * @param defaultValue - The default value if no persisted value exists.
 * @param options - Optional configuration including presets and hidden flag.
 *
 * @returns A signal containing the current (possibly persisted) value.
 */
export function createEditableVariable<T extends string | number | boolean>(
  name: string,
  defaultValue: T,
  options?: VariableOptions<T>,
): SimpleSignal<T> {
  const scene = useScene();
  const thread = useThread();
  const type = typeof defaultValue as VariableType;
  const currentValue = scene.variables.register(
    name,
    type,
    defaultValue,
    thread.time(),
    options,
  );
  const signal = new SignalContext<T, T>(currentValue, deepLerp).toSignal();
  scene.variables.setSignalRef(name, signal as SimpleSignal<unknown>);
  return signal;
}
