import type {EditableVariable} from '@canvas-commons/core/lib/scenes/editableVariables';
import {Input, NumberInput} from '../controls';
import styles from '../controls/Controls.module.scss';

interface EditablePropertyFieldProps {
  property: EditableVariable;
  onChange: (value: unknown) => void;
  onPreview?: (value: unknown) => void;
  onPreviewEnd?: () => void;
}

export function EditablePropertyField({
  property,
  onChange,
  onPreview,
  onPreviewEnd,
}: EditablePropertyFieldProps) {
  switch (property.type) {
    case 'number':
      return (
        <NumberInput
          value={property.value as number}
          onChange={onChange}
          decimalPlaces={2}
          step={1}
        />
      );
    case 'string':
      return (
        <Input
          value={property.value as string}
          onChangeCapture={e => onChange((e.target as HTMLInputElement).value)}
        />
      );
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={property.value as boolean}
          onChange={e => onChange((e.target as HTMLInputElement).checked)}
        />
      );
    case 'vector2': {
      const value = property.value as {x: number; y: number};
      return (
        <div className={styles.fieldColumn}>
          <NumberInput
            value={value?.x ?? 0}
            onChange={x => onChange({...value, x})}
            decimalPlaces={2}
            step={1}
            label="X"
          />
          <NumberInput
            value={value?.y ?? 0}
            onChange={y => onChange({...value, y})}
            decimalPlaces={2}
            step={1}
            label="Y"
          />
        </div>
      );
    }
    case 'bbox': {
      const value = property.value as {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      return (
        <div className={styles.fieldColumn}>
          <NumberInput
            value={value?.x ?? 0}
            onChange={x => onChange({...value, x})}
            decimalPlaces={2}
            step={1}
            label="X"
          />
          <NumberInput
            value={value?.y ?? 0}
            onChange={y => onChange({...value, y})}
            decimalPlaces={2}
            step={1}
            label="Y"
          />
          <NumberInput
            value={value?.width ?? 0}
            onChange={width => onChange({...value, width})}
            decimalPlaces={2}
            step={1}
            label="W"
          />
          <NumberInput
            value={value?.height ?? 0}
            onChange={height => onChange({...value, height})}
            decimalPlaces={2}
            step={1}
            label="H"
          />
        </div>
      );
    }
    case 'color':
      return (
        <Input
          type="color"
          value={property.value as string}
          onInput={
            onPreview
              ? (e: Event) => onPreview((e.target as HTMLInputElement).value)
              : undefined
          }
          onChangeCapture={e => {
            onChange((e.target as HTMLInputElement).value);
            onPreviewEnd?.();
          }}
        />
      );
    default:
      return (
        <span style={{opacity: 0.5, padding: '0 8px'}}>
          {JSON.stringify(property.value)}
        </span>
      );
  }
}
