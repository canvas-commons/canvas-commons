import type {MetaField} from '@canvas-commons/core';
import {
  Color,
  EnumMetaField,
  RangeMetaField,
  Vector2,
} from '@canvas-commons/core';
import type {FunctionComponent} from 'preact';
import {useSubscribableValue} from '../../hooks/index.js';
import {Separator} from '../controls/index.js';
import {BoolMetaFieldView} from './BoolMetaFieldView.js';
import {ColorMetaFieldView} from './ColorMetaFieldView.js';
import {EnumMetaFieldView} from './EnumMetaFieldView.js';
import {NumberMetaFieldView} from './NumberMetaFieldView.js';
import {ObjectMetaFieldView} from './ObjectMetaFieldView.js';
import {RangeMetaFieldView} from './RangeMetaFieldView.js';
import {StringMetaFieldView} from './StringMetaFieldView.js';
import {UnknownMetaFieldView} from './UnknownMetaFieldView.js';
import {Vector2MetaFieldView} from './Vector2MetaFieldView.js';

interface MetaFieldViewProps {
  field: MetaField<any>;
}

type FiledView = FunctionComponent<{field: MetaField<any>}>;

const TYPE_MAP = new Map<unknown, FiledView>([
  [Boolean, BoolMetaFieldView],
  [Number, NumberMetaFieldView],
  [String, StringMetaFieldView],
  [EnumMetaField.symbol, EnumMetaFieldView],
  [Color.symbol, ColorMetaFieldView],
  [Vector2.symbol, Vector2MetaFieldView],
  [RangeMetaField.symbol, RangeMetaFieldView],
  [Object, ObjectMetaFieldView],
] as Array<[unknown, FiledView]>);

export function MetaFieldView({field}: MetaFieldViewProps) {
  const Field: FiledView = TYPE_MAP.get(field.type) ?? UnknownMetaFieldView;
  const disabled = useSubscribableValue(field.onDisabled);

  return disabled ? (
    <></>
  ) : (
    <>
      {field.spacing && <Separator />}
      <Field field={field} />
    </>
  );
}
