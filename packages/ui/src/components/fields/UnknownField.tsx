import {Field, FieldSurface, FieldValue} from './Layout.js';

export interface UnknownFieldProps {
  value: any;
}

export function UnknownField({value}: UnknownFieldProps) {
  const isUnset = value === null || value === '';
  return (
    <FieldSurface disabled={isUnset}>
      <Field copy={isUnset ? undefined : value?.toString()}>
        <FieldValue>{value?.toString() || 'unset'}</FieldValue>
      </Field>
    </FieldSurface>
  );
}
