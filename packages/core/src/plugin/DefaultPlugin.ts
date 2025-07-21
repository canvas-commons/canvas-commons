import {ImageExporter} from '../app';
import {makePlugin} from './makePlugin';

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
