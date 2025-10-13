import {makeProject} from '@canvas-commons/core';

import circle from './scenes/circle?scene';
import codeEditing from './scenes/code-editing?scene';
import codeHighlighting from './scenes/code-highlighting?scene';
import codeMorphing from './scenes/code-morphing?scene';
import codeTweening from './scenes/code-tweening?scene';
import latexTweening from './scenes/latex-tweening?scene';
import positionTweening from './scenes/position-tweening?scene';
import rect from './scenes/rect?scene';
import splineTweening from './scenes/spline-tweening?scene';
import textPositioning from './scenes/text-positioning?scene';

export default makeProject({
  scenes: [
    circle,
    rect,
    codeHighlighting,
    codeTweening,
    codeMorphing,
    codeEditing,
    latexTweening,
    positionTweening,
    textPositioning,
    splineTweening,
  ],
});
