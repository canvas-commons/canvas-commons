import {Vector2} from '@canvas-commons/core';
import {useFormattedNumber} from '../../hooks';
import {Field, FieldSet, FieldValue, NumericField} from './Layout';

export interface Vector2FieldProps {
  value: Vector2;
}

export function Vector2Field({value}: Vector2FieldProps) {
  const x = useFormattedNumber(value.x, 2);
  const y = useFormattedNumber(value.y, 2);
  return (
    <FieldSet
      header={
        <Field copy={JSON.stringify(value.serialize())}>
          <FieldValue alignRight>
            {x}, {y}
          </FieldValue>
        </Field>
      }
    >
      <NumericField label="x">{value.x}</NumericField>
      <NumericField label="y">{value.y}</NumericField>
    </FieldSet>
  );
}
