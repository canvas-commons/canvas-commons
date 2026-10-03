import {Camera, Node, Rect, Spline, makeScene2D} from '@canvas-commons/2d';
import {all, createRef} from '@canvas-commons/core';

const StageSize: [number, number] = [600, 400];
const CurvePoints: [number, number][] = [
  [-150, 0],
  [0, -80],
  [200, 30],
];
const MarkerPosition: [number, number] = [200, 30];
const ParentPosition: [number, number] = [30, -20];

export default makeScene2D(function* (view) {
  const followCamera = createRef<Camera>();
  const centerCamera = createRef<Camera>();
  const curve = createRef<Spline>();
  const centerMarker = createRef<Rect>();

  view.add(
    <>
      <Rect size={[1920, 1080]} fill="#000" />
      <Rect clip size={StageSize} x={-400}>
        <Camera ref={followCamera}>
          <Node position={ParentPosition} rotation={20} scale={1.3}>
            <Spline
              ref={curve}
              points={CurvePoints}
              stroke="#fff"
              lineWidth={4}
            />
            <Rect position={MarkerPosition} size={20} fill="#ff00ff" />
          </Node>
        </Camera>
      </Rect>
      <Rect clip size={StageSize} x={400}>
        <Camera ref={centerCamera}>
          <Node position={ParentPosition} rotation={20} scale={1.3}>
            <Spline points={CurvePoints} stroke="#fff" lineWidth={4} />
            <Rect
              ref={centerMarker}
              position={MarkerPosition}
              size={20}
              fill="#ff00ff"
            />
          </Node>
        </Camera>
      </Rect>
    </>,
  );

  yield* all(
    followCamera().followCurve(curve(), 2),
    centerCamera().centerOn(centerMarker(), 2),
  );
});
