import {makeScene2D, SVG} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';

// An inline SVG document; the node parses it into canvas-commons shapes, which
// the exporter then re-serializes through their own `toSVG`.
const DOCUMENT = `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="34" r="26" fill="#e13238"/>
  <rect x="50" y="20" width="44" height="44" rx="8" fill="#68abdf"/>
  <path d="M12 92 L50 58 L88 92 Z" fill="#e6a700"/>
</svg>`;

export default makeScene2D(function* (view) {
  view.fill('#141414');
  view.add(<SVG svg={DOCUMENT} size={400} />);
  yield* waitFor(0.5);
});
