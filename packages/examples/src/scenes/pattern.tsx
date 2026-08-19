import {makeScene2D, Pattern, Rect} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';

// A 40px checker tile drawn to an offscreen canvas, reused as a tiled Pattern
// fill. The canvas is ready synchronously, so the render stays deterministic and
// the exporter has to emit a <pattern> def.
function checkerTile(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 40;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#1a1a1a';
    context.fillRect(0, 0, 40, 40);
    context.fillStyle = '#e6a700';
    context.fillRect(0, 0, 20, 20);
    context.fillRect(20, 20, 20, 20);
  }
  return canvas;
}

export default makeScene2D(function* (view) {
  view.fill('#141414');

  view.add(
    <Rect
      width={400}
      height={400}
      fill={new Pattern({image: checkerTile(), repetition: 'repeat'})}
      stroke={'#e6a700'}
      lineWidth={6}
    />,
  );

  yield* waitFor(0.1);
});
