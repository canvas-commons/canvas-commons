import {
  Layout,
  LayoutProps,
  Line,
  Node,
  Rect,
  colorSignal,
  initial,
} from '@canvas-commons/2d';
import {
  ColorSignal,
  PossibleColor,
  SignalValue,
  SimpleSignal,
  ThreadGenerator,
  all,
  chain,
  createRef,
  createSignal,
  linear,
  loop,
  range,
} from '@canvas-commons/core';

const VIEW_BOX = 48;
const BAR_LENGTH = 19.241;
const LANDER_THICKNESS = 6.727;
const BAR_RADIUS = LANDER_THICKNESS / 2;
const BAR_ANGLE = 45;
const DIAGONAL = Math.SQRT1_2;

const MASK_BLEED = 0.4;
const SEGMENT_COUNT = 4;

const CARVE_REACH = 8.913;

interface Lane {
  start: number;
  across: number;
  length: number;
  period: number;
  base: number;
}

const YELLOW_LANE: Lane = {
  start: -27.48,
  across: 1.846,
  length: 47.269,
  period: 23.707,
  base: 0,
};
const PINK_LANE: Lane = {
  start: -16.357,
  across: 12.865,
  length: 29.755,
  period: 23.742,
  base: 0,
};
const BLUE_LANE: Lane = {
  start: -22.891,
  across: -9.104,
  length: 36.149,
  period: 23.777,
  base: -12.653,
};

type Point = [number, number];

const CHECK_POINTS: Point[] = [
  [-6.388, 20.319],
  [12.663, 15.397],
  [17.497, -3.729],
];

export interface LogoProps extends LayoutProps {
  dot?: SignalValue<PossibleColor>;
  yellowBar?: SignalValue<PossibleColor>;
  blueBar?: SignalValue<PossibleColor>;
  pinkBar?: SignalValue<PossibleColor>;
  lander?: SignalValue<PossibleColor>;
}

export class Logo extends Layout {
  @initial('#a6e3a1')
  @colorSignal()
  declare public readonly dot: ColorSignal<this>;

  @initial('#f9e2af')
  @colorSignal()
  declare public readonly yellowBar: ColorSignal<this>;

  @initial('#89b4fa')
  @colorSignal()
  declare public readonly blueBar: ColorSignal<this>;

  @initial('#f38ba8')
  @colorSignal()
  declare public readonly pinkBar: ColorSignal<this>;

  @initial('#ebebeb')
  @colorSignal()
  declare public readonly lander: ColorSignal<this>;

  private readonly yellowFlow = createSignal(0);
  private readonly pinkFlow = createSignal(0);
  private readonly blueFlow = createSignal(0);
  private readonly head = createRef<Rect>();

  public constructor(props?: LogoProps) {
    super({size: VIEW_BOX, cache: true, ...props});

    this.children([
      this.lane(YELLOW_LANE, this.yellowFlow, () => this.yellowBar()),
      this.lane(PINK_LANE, this.pinkFlow, () => this.pinkBar()),
      this.lane(BLUE_LANE, this.blueFlow, index =>
        index === 0 ? this.dot() : this.blueBar(),
      ),
      <Line
        layout={false}
        points={() => CHECK_POINTS.map(point => this.at(point))}
        stroke={'white'}
        lineWidth={() => 2 * CARVE_REACH * this.unit()}
        lineCap={'round'}
        lineJoin={'miter'}
        compositeOperation={'destination-out'}
      />,
      <Line
        layout={false}
        points={() => CHECK_POINTS.map(point => this.at(point))}
        stroke={this.lander}
        lineWidth={() => LANDER_THICKNESS * this.unit()}
        lineCap={'round'}
        lineJoin={'round'}
      />,
    ]);
  }

  public animate(duration = 4): ThreadGenerator {
    const beat = duration / 4;
    return loop(() =>
      all(
        loop(4, () =>
          chain(this.yellowFlow(1, beat, linear), this.yellowFlow(0, 0)),
        ),
        loop(2, () =>
          chain(this.pinkFlow(1, 2 * beat, linear), this.pinkFlow(0, 0)),
        ),
        loop(2, () =>
          chain(
            all(
              this.blueFlow(1, 2 * beat, linear),
              this.head().fill(this.dot(), 2 * beat, linear),
            ),
            all(this.head().fill(this.blueBar(), 0), this.blueFlow(0, 0)),
          ),
        ),
      ),
    );
  }

  private lane(
    lane: Lane,
    flow: SimpleSignal<number>,
    fill: (index: number) => PossibleColor,
  ) {
    return (
      <Node
        cache
        position={() => this.at(this.onLane(lane, 0))}
        rotation={BAR_ANGLE}
      >
        <Node x={() => -flow() * lane.period * this.unit()}>
          {range(SEGMENT_COUNT).map(index => (
            <Rect
              ref={lane === BLUE_LANE && index === 1 ? this.head : undefined}
              layout={false}
              anchor={[-1, 0]}
              position={() => [
                (lane.base + index * lane.period) * this.unit(),
                0,
              ]}
              size={() => [
                BAR_LENGTH * this.unit(),
                LANDER_THICKNESS * this.unit(),
              ]}
              radius={() => BAR_RADIUS * this.unit()}
              fill={() => fill(index)}
            />
          ))}
        </Node>
        <Rect
          layout={false}
          anchor={[-1, 0]}
          size={() => [
            lane.length * this.unit(),
            (LANDER_THICKNESS + 2 * MASK_BLEED) * this.unit(),
          ]}
          radius={() => (BAR_RADIUS + MASK_BLEED) * this.unit()}
          fill={'white'}
          compositeOperation={'destination-in'}
        />
      </Node>
    );
  }

  private onLane(lane: Lane, along: number): Point {
    const distance = lane.start + along;
    return [
      (distance - lane.across) * DIAGONAL,
      (distance + lane.across) * DIAGONAL,
    ];
  }

  private unit(): number {
    return this.size().x / VIEW_BOX;
  }

  private at([x, y]: Point): Point {
    return [x * this.unit(), y * this.unit()];
  }
}
