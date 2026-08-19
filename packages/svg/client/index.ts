import type {ExporterClass} from '@canvas-commons/core';
import {makePlugin} from '@canvas-commons/core';

import {SVGExporter} from './SVGExporter';

export {serializeScene} from './serializeSvg';
export {SVGExporter} from './SVGExporter';

export default makePlugin({
  name: 'svg-plugin',
  exporters(): ExporterClass[] {
    return [SVGExporter];
  },
});
