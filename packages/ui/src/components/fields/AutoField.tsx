import {Color, Spacing, Vector2, isType} from '@canvas-commons/core';
import {FunctionComponent} from 'preact';
import {ArrayField} from './ArrayField.js';
import {ColorField} from './ColorField.js';
import {NumberField} from './NumberField.js';
import {SpacingField} from './SpacingField.js';
import {UnknownField} from './UnknownField.js';
import {Vector2Field} from './Vector2Field.js';

export interface AutoFieldProps {
  value: any;
}

const TYPE_MAP: Record<symbol, FunctionComponent<{value: any}>> = {
  [Vector2.symbol]: Vector2Field,
  [Color.symbol]: ColorField,
  [Spacing.symbol]: SpacingField,
};

export function AutoField({value}: AutoFieldProps) {
  let Field: FunctionComponent<{value: any}> = UnknownField;
  if (isType(value)) {
    Field = TYPE_MAP[value.toSymbol()] ?? UnknownField;
  } else if (typeof value === 'number') {
    Field = NumberField;
  } else if (Array.isArray(value)) {
    Field = ArrayField;
  }

  return <Field value={value} />;
}
