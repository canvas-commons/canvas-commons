import type {VariableType} from './EditableVariable';

/**
 * Represents an editable variable stored in a meta file.
 */
export interface SerializedVariable {
  /**
   * {@inheritDoc EditableVariable.name}
   */
  name: string;
  /**
   * {@inheritDoc EditableVariable."type"}
   */
  type: VariableType;
  /**
   * {@inheritDoc EditableVariable.value}
   */
  value: unknown;
  /**
   * {@inheritDoc EditableVariable.initialTime}
   */
  initialTime: number;
}
