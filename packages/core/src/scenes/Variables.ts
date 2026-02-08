import type {SubscribableValueEvent} from '../events';
import type {SimpleSignal} from '../signals';
import type {
  EditableVariable,
  VariableOptions,
  VariableType,
} from './editableVariables';

/**
 * Unified interface for scene variables.
 *
 * @remarks
 * Combines simple key-value variables with typed, editable variables that
 * appear in the editor UI and persist to `.meta` files. Two implementations
 * exist: {@link EditableVariables} (editor) and {@link ReadOnlyVariables}
 * (player/presenter/renderer).
 */
export interface Variables {
  /**
   * Get a simple variable signal, creating one if it does not yet exist.
   *
   * @param name - The name of the variable.
   * @param initial - The initial value of the variable. Used if the variable
   *   was not configured from the outside.
   */
  get<T>(name: string, initial: T): () => T;

  /**
   * Update all signals with new external variable values.
   *
   * @remarks
   * Called by `Player.setVariables` to push external overrides into the
   * scene. Updates both simple signals created via {@link get} and signal refs
   * registered via {@link setSignalRef}.
   */
  updateSignals(variables: Record<string, unknown>): void;

  /**
   * Update the value of an editable variable.
   *
   * @param name - The name of the variable.
   * @param value - The new value.
   */
  set(name: string, value: unknown): void;

  /**
   * Triggered when editable variables change.
   *
   * @eventProperty
   */
  get onChanged(): SubscribableValueEvent<EditableVariable[]>;

  /**
   * Register an editable variable.
   *
   * @param name - The unique name of the variable.
   * @param type - The type of the variable.
   * @param defaultValue - The default value of the variable.
   * @param initialTime - The frame-time when the variable was created.
   * @param options - Optional configuration including presets and hidden flag.
   *
   * @returns The current value of the variable (external override, persisted,
   *   or default).
   *
   * @internal
   */
  register<T>(
    name: string,
    type: VariableType,
    defaultValue: T,
    initialTime: number,
    options?: VariableOptions<T>,
  ): T;

  /**
   * Get the signal reference for a registered variable.
   *
   * @param name - The name of the variable.
   *
   * @returns The signal, or undefined if no signal has been registered.
   */
  getSignalRef(name: string): SimpleSignal<unknown> | undefined;

  /**
   * Store a signal reference for a registered variable.
   *
   * @param name - The name of the variable.
   * @param signal - The signal backing this variable.
   * @param transform - An optional transform matrix function for gizmo display.
   * @param offset - An optional function computing a display offset from the
   *   current value. Applied only for drawing and hit-testing, not drag deltas.
   */
  setSignalRef(
    name: string,
    signal: SimpleSignal<unknown>,
    transform?: () => DOMMatrix,
    offset?: (value: unknown) => {x: number; y: number},
  ): void;

  /**
   * Get the transform matrix function for a registered variable.
   *
   * @param name - The name of the variable.
   *
   * @returns The transform function, or undefined if none was provided.
   */
  getTransform(name: string): (() => DOMMatrix) | undefined;

  /**
   * Get the display offset function for a registered variable.
   *
   * @param name - The name of the variable.
   *
   * @returns The offset function, or undefined if none was provided.
   */
  getOffset(
    name: string,
  ): ((value: unknown) => {x: number; y: number}) | undefined;
}
