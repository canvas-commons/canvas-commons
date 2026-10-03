import {Line, Rect, makeScene2D} from '@canvas-commons/2d';
import {createRef, range} from '@canvas-commons/core';

function uniform(count: number): [number, number][] {
  return range(count).map((i): [number, number] => [
    -400 + (800 * i) / (count - 1),
    0,
  ]);
}

function zigzag(count: number): [number, number][] {
  return range(count).map((i): [number, number] => [
    -400 + (800 * i) / (count - 1),
    i % 2 === 0 ? -80 : 80,
  ]);
}

export function lineGrowScene(targetCount: number) {
  return makeScene2D(function* (view) {
    view.add(<Rect size={[1920, 1080]} fill="#000000" />);
    const line = createRef<Line>();
    view.add(
      <Line
        ref={line}
        y={-200}
        points={uniform(10)}
        stroke="#ffffff"
        lineWidth={6}
      />,
    );
    view.add(
      <Line
        y={200}
        points={zigzag(targetCount)}
        stroke="#ffffff"
        lineWidth={6}
      />,
    );
    yield* line().points(zigzag(targetCount), 1);
  });
}
