import {withLoader} from './withLoader.js';

export function openOutputPath() {
  return withLoader(async () => {
    await fetch('/__open-output-path');
  });
}
