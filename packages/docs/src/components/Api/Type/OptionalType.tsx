import React from 'react';

import Type from '@site/src/components/Api/Type';
import type {JSONOutput} from 'typedoc';

export default function OptionalType({type}: {type: JSONOutput.OptionalType}) {
  return (
    <>
      <Type type={type.elementType} />?
    </>
  );
}
