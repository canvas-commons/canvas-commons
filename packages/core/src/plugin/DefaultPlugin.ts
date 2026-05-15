import {ImageExporter} from '../app/index.js';
import {makePlugin} from './makePlugin.js';

/**
 * The default plugin included in every Canvas Commons project.
 *
 * @internal
 */
export default makePlugin({
  name: '@canvas-commons/core/default',
  exporters() {
    return [ImageExporter];
  },
});
