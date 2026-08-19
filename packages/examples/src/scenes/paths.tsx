import {Line, Path, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';

// Two Curve traits the SVG path tracer has to get right:
//  - a multi-subpath `Path`: the gap between subpaths must not be bridged by a
//    stray line — each subpath has to begin with its own move;
//  - a `closed` stroked polygon: its subpath has to be closed so the join where
//    the outline meets itself matches the canvas.
export default makeScene2D(function* (view) {
  view.fill('#141414');

  view.add(
    <Path
      x={-280}
      lineWidth={10}
      stroke={'#e6a700'}
      lineJoin={'round'}
      data={
        'M-160 -140 L0 -140 L0 -20 ' +
        'M-160 20 L0 20 L0 140 ' +
        'M-200 -150 L-200 150'
      }
    />,
  );

  view.add(
    <Line
      x={280}
      lineWidth={10}
      stroke={'#68abdf'}
      lineJoin={'round'}
      lineCap={'round'}
      lineDash={[30, 30]}
      lineDashOffset={15}
      closed
      points={[
        [0, -150],
        [150, 90],
        [-150, 90],
      ]}
    />,
  );

  yield* waitFor(0.1);
});
