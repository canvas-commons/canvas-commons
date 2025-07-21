import {makeProject} from '@canvas-commons/core';

import circle from './scenes/circle?scene';
import rect from './scenes/rect?scene';

export default makeProject({
  scenes: [circle, rect],
});
