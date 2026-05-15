import type {EnumMetaField} from '@canvas-commons/core';
import {useSubscribableValue} from '../../hooks/index.js';
import {Select} from '../controls/index.js';
import {MetaFieldGroup} from './MetaFieldGroup.js';

export interface EnumMetaFieldViewProps {
  field: EnumMetaField<any>;
}

export function EnumMetaFieldView({field}: EnumMetaFieldViewProps) {
  const value = useSubscribableValue(field.onChanged);
  return (
    <>
      <MetaFieldGroup field={field}>
        <Select
          options={field.options}
          value={value}
          onChange={newValue => field.set(newValue)}
        />
      </MetaFieldGroup>
    </>
  );
}
