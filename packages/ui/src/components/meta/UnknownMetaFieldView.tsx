import {MetaField} from '@canvas-commons/core';
import {useSubscribableValue} from '../../hooks/index.js';
import {Group, Label} from '../controls/index.js';
import {AutoField} from '../fields/index.js';

export interface UnknownMetaFieldViewProps {
  field: MetaField<any>;
}

export function UnknownMetaFieldView({field}: UnknownMetaFieldViewProps) {
  const value = useSubscribableValue(field.onChanged);

  return (
    <Group>
      <Label>{field.name}</Label>
      <AutoField value={value} />
    </Group>
  );
}
