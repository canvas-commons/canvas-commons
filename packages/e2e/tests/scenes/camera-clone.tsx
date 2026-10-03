import {Camera, Circle, Rect, makeScene2D} from '@canvas-commons/2d';
import {createRef} from '@canvas-commons/core';

const StageSize: [number, number] = [500, 360];

function Shapes() {
  return (
    <>
      <Rect size={50} fill="#ff0000" />
      <Circle position={[-90, 60]} size={40} fill="#00ff00" />
      <Rect position={[80, -50]} size={[30, 60]} fill="#0000ff" />
    </>
  );
}

export default makeScene2D(function* (view) {
  const original = createRef<Camera>();
  const cloneStage = createRef<Rect>();

  view.add(
    <>
      <Rect size={[1920, 1080]} fill="#000" />
      <Rect clip size={StageSize} x={-600}>
        <Camera ref={original} zoom={2}>
          <Shapes />
        </Camera>
      </Rect>
      <Rect clip size={StageSize} x={0}>
        <Camera zoom={2}>
          <Shapes />
        </Camera>
      </Rect>
      <Rect ref={cloneStage} clip size={StageSize} x={600} />
    </>,
  );

  cloneStage().add(original().clone());

  yield;
});
