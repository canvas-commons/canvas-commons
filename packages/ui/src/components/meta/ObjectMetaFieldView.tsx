import type {MetaField, ObjectMetaField} from '@canvas-commons/core';
import {useSubscribableValue} from '../../hooks/index.js';
import {MetaFieldView} from './MetaFieldView.js';

export interface ObjectMetaFieldViewProps {
  field: ObjectMetaField<any>;
}

export function ObjectMetaFieldView({field}: ObjectMetaFieldViewProps) {
  const fields: MetaField<any>[] = useSubscribableValue(field.onFieldsChanged);

  return (
    <>
      {fields.map(subfield => (
        <MetaFieldView field={subfield} />
      ))}
    </>
  );
}
