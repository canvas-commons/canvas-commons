import type {NumberMetaField} from '@canvas-commons/core';
import {useSubscribableValue} from '../../hooks';
import {NumberInput, NumberInputSelect} from '../controls';
import {MetaFieldGroup} from './MetaFieldGroup';

export interface NumberMetaFieldViewProps {
  field: NumberMetaField;
}

export function NumberMetaFieldView({field}: NumberMetaFieldViewProps) {
  const value = useSubscribableValue(field.onChanged);
  const presets = field.getPresets();
  const precision = field.getPrecision();
  const step = field.getStep();

  // Generate test ID based on field name
  const testId = field.name.toLowerCase().replace(/\s+/g, '-');

  return (
    <MetaFieldGroup field={field}>
      {presets.length ? (
        <NumberInputSelect
          data-testid={testId}
          value={value}
          min={field.getMin()}
          max={field.getMax()}
          onChange={value => {
            field.set(value);
          }}
          options={presets}
        />
      ) : (
        <NumberInput
          data-testid={testId}
          value={value}
          decimalPlaces={precision}
          step={step}
          min={field.getMin()}
          max={field.getMax()}
          onChange={value => field.set(value)}
        />
      )}
    </MetaFieldGroup>
  );
}
