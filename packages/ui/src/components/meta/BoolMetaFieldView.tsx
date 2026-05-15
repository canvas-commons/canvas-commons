import type {BoolMetaField} from '@canvas-commons/core';
import {useSubscribableValue} from '../../hooks/index.js';
import {Checkbox} from '../controls/index.js';
import {MetaFieldGroup} from './MetaFieldGroup.js';

export interface BoolMetaFieldViewProps {
  field: BoolMetaField;
}

export function BoolMetaFieldView({field}: BoolMetaFieldViewProps) {
  const value = useSubscribableValue(field.onChanged);

  return (
    <MetaFieldGroup field={field}>
      <Checkbox
        checked={value}
        onChange={() => {
          field.set(!value);
        }}
      />
    </MetaFieldGroup>
  );
}
