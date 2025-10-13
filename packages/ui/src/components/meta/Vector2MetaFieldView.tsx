import {Vector2MetaField} from '@canvas-commons/core';
import {useSubscribableValue} from '../../hooks';
import {NumberInput} from '../controls';
import {MetaFieldGroup} from './MetaFieldGroup';

export interface Vector2MetaFieldViewProps {
  field: Vector2MetaField;
}

export function Vector2MetaFieldView({field}: Vector2MetaFieldViewProps) {
  const value = useSubscribableValue(field.onChanged);

  // Generate test IDs based on field name
  const fieldName = field.name.toLowerCase().replace(/\s+/g, '-');
  const xTestId = `${fieldName}-x`;
  const yTestId = `${fieldName}-y`;

  return (
    <MetaFieldGroup field={field}>
      <NumberInput
        data-testid={xTestId}
        value={value.x}
        onChange={x => field.set([x, value.y])}
      />
      <NumberInput
        data-testid={yTestId}
        value={value.y}
        onChange={y => field.set([value.x, y])}
      />
    </MetaFieldGroup>
  );
}
