import {decorate, threadable} from '../decorators/index.js';
import {ThreadGenerator} from '../threading/index.js';

decorate(noop, threadable());
/**
 * Do nothing.
 */
export function* noop(): ThreadGenerator {
  // do nothing
}
