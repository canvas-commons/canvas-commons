import type {ExporterClass} from '@canvas-commons/core';
import {makePlugin} from '@canvas-commons/core';
import {WebCodecsExporterClient} from './WebCodecsExporterClient';

export default makePlugin({
  name: 'webcodecs-plugin',
  exporters(): ExporterClass[] {
    return [WebCodecsExporterClient];
  },
});
