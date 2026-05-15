import {FieldSurface, NumericField} from './Layout.js';

export interface NumberFieldProps {
  value: number;
}

export function NumberField({value}: NumberFieldProps) {
  return (
    <FieldSurface>
      <NumericField>{value}</NumericField>
    </FieldSurface>
  );
}
