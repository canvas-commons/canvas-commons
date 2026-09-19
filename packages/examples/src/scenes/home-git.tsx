import {
  Circle,
  CircleProps,
  Line,
  initial,
  makeScene2D,
  signal,
} from '@canvas-commons/2d';
import {
  SimpleSignal,
  all,
  createRef,
  createRefArray,
  easeOutBack,
  sequence,
  useScene,
  waitFor,
} from '@canvas-commons/core';

class Commit extends Circle {
  @initial(0)
  @signal()
  declare public readonly pulse: SimpleSignal<number, this>;

  public constructor(props: CircleProps) {
    super({size: 36, ...props});
    this.add(
      <Circle
        size={this.size}
        stroke={this.fill}
        lineWidth={3}
        opacity={() => 1 - this.pulse()}
        scale={() => 1 + this.pulse() * 1.4}
      />,
    );
  }
}

export default makeScene2D(function* (view) {
  const v = useScene().variables;
  const main = v.get('--cc-blue', '#89b4fa');
  const branch = v.get('--cc-mauve', '#cba6f7');
  const dots = createRefArray<Commit>();
  const trunk = createRef<Line>();
  const fork = createRef<Line>();

  view.add(
    <>
      <Line
        ref={trunk}
        stroke={main}
        lineWidth={4}
        end={0}
        points={[
          [-360, 60],
          [200, 60],
        ]}
      />
      <Line
        ref={fork}
        stroke={branch}
        lineWidth={4}
        end={0}
        points={[
          [-120, 60],
          [40, -60],
          [240, -60],
        ]}
      />
      {[-360, -120, 200].map(x => (
        <Commit ref={dots} x={x} y={60} fill={main} scale={0} />
      ))}
      <Commit ref={dots} x={40} y={-60} fill={branch} scale={0} />
      <Commit ref={dots} x={240} y={-60} fill={branch} scale={0} />
    </>,
  );

  yield* trunk().end(1, 0.8);
  yield* sequence(0.12, ...dots.map(d => d.scale(1, 0.4, easeOutBack)));
  yield* fork().end(1, 0.8);
  yield* all(...dots.map(d => d.pulse(1, 1)));
  yield* waitFor(0.4);
});
