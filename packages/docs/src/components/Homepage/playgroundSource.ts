import circle from '!!raw-loader!@canvas-commons/examples/src/scenes/home-circle';
import edit from '!!raw-loader!@canvas-commons/examples/src/scenes/home-edit';
import execute from '!!raw-loader!@canvas-commons/examples/src/scenes/home-execute';
import git from '!!raw-loader!@canvas-commons/examples/src/scenes/home-git';
import latex from '!!raw-loader!@canvas-commons/examples/src/scenes/home-latex';
import layout from '!!raw-loader!@canvas-commons/examples/src/scenes/home-layout';
import rough from '!!raw-loader!@canvas-commons/examples/src/scenes/home-rough';
import spaces from '!!raw-loader!@canvas-commons/examples/src/scenes/home-spaces';
import timsort from '!!raw-loader!@canvas-commons/examples/src/scenes/home-timsort';
import typeScene from '!!raw-loader!@canvas-commons/examples/src/scenes/home-type';

/**
 * The homepage playground tabs, taken from the scenes the reel also compiles.
 * `parseFiddle` splits them on the `// snippet <Name>` marker.
 */
const SNIPPETS: [string, string][] = [
  ['Circle', circle],
  ['Execute', execute],
  ['Edit', edit],
  ['Git', git],
  ['TimSort', timsort],
  ['Rough', rough],
  ['Layout', layout],
  ['Spaces', spaces],
  ['Type', typeScene],
  ['Latex', latex],
];

export const playgroundSource = SNIPPETS.map(
  ([name, source]) => `// snippet ${name}\n${source.trimEnd()}`,
).join('\n\n');
