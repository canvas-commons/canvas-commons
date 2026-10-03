import {makeProject} from '@canvas-commons/core';
import scene from '../scenes/perf-code?scene';

export default makeProject({scenes: [scene], variables: {lines: 400}});
