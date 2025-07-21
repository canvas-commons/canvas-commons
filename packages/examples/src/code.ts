import {makeProject} from '@canvas-commons/core';
import scene from './scenes/code?scene';

import {Code, LezerHighlighter} from '@canvas-commons/2d';
import {parser} from '@lezer/javascript';

Code.defaultHighlighter = new LezerHighlighter(parser);

export default makeProject({
  scenes: [scene],
});
