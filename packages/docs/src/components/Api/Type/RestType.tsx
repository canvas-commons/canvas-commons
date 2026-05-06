import React from 'react';

import Type from '@site/src/components/Api/Type';
import type {JSONOutput} from 'typedoc';

export default function RestType({type}: {type: JSONOutput.RestType}) {
  return (
    <>
      ...
      <Type type={type.elementType} />
    </>
  );
}
