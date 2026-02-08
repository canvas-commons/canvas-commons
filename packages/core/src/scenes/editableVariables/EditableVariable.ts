/**
 * The supported types for editable variables.
 */
export type VariableType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'vector2'
  | 'bbox'
  | 'color';

/**
 * A labeled preset value.
 */
export interface LabeledPreset<T> {
  label: string;
  value: T;
}

/**
 * A preset value, either bare or with a label.
 */
export type Preset<T> = T | LabeledPreset<T>;

/**
 * Options for editable variable registration.
 */
export interface VariableOptions<T = unknown> {
  presets?: Preset<T>[];
  hidden?: boolean;
}

/**
 * Represents an editable variable at runtime.
 */
export interface EditableVariable<T = unknown> {
  /**
   * The unique name of the variable.
   */
  name: string;
  /**
   * The type of the variable, used for rendering the appropriate editor
   * controls.
   */
  type: VariableType;
  /**
   * The current value of the variable.
   */
  value: T;
  /**
   * The default value of the variable as specified in code.
   */
  defaultValue: T;
  /**
   * The frame-time when the variable was registered.
   */
  initialTime: number;
  /**
   * Stack trace at the moment of registration.
   */
  stack?: string;
  /**
   * Presets defined in code for quick selection in the editor.
   */
  presets?: Preset<T>[];
  /**
   * Whether this variable should be hidden from the timeline UI.
   */
  hidden?: boolean;
}
