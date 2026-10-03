import {Rect, Spline, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  view.add(<Rect size={[1920, 1080]} fill="#000000" />);
  view.add(
    <Spline
      x={-300}
      y={-200}
      points={[
        [0, 0],
        [0, 0],
        [0, 0],
        [200, 0],
      ]}
      lineWidth={8}
      stroke="#ffffff"
    />,
  );
  view.add(
    <Spline
      x={-300}
      y={200}
      points={[
        [0, 0],
        [0, 0],
        [200, 0],
      ]}
      lineWidth={8}
      stroke="#ffffff"
    />,
  );
  yield* waitFor(0.1);
});
