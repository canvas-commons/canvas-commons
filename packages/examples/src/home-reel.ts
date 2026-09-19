import {makeProject} from '@canvas-commons/core';

import circle from './scenes/home-circle?scene';
import git from './scenes/home-git?scene';
import layout from './scenes/home-layout?scene';
import rough from './scenes/home-rough?scene';
import spaces from './scenes/home-spaces?scene';
import timsort from './scenes/home-timsort?scene';
import typeSetting from './scenes/home-type?scene';

// The Code and LaTeX scenes need the fiddle's highlighter and MathJax setup,
// so they stay in the playground and out of this sequence.
export default makeProject({
  scenes: [circle, git, timsort, rough, layout, spaces, typeSetting],
});
