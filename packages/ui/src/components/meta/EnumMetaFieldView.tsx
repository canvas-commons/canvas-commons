import type {EnumMetaField} from '@canvas-commons/core';
import {useSubscribableValue} from '../../hooks';
import {Select} from '../controls';
import {MetaFieldGroup} from './MetaFieldGroup';

export interface EnumMetaFieldViewProps {
  field: EnumMetaField<any>;
}

export function EnumMetaFieldView({field}: EnumMetaFieldViewProps) {
  const value = useSubscribableValue(field.onChanged);

  // Generate test ID based on field name
  const testId = field.name.toLowerCase().replace(/\s+/g, '-');

  return (
    <>
      <MetaFieldGroup field={field}>
        <Select
          data-testid={testId}
          options={field.options}
          value={value}
          onChange={newValue => field.set(newValue)}
        />
      </MetaFieldGroup>
    </>
  );
}
