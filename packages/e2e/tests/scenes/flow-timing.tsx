import {makeScene2D} from '@canvas-commons/2d';
import {
  ThreadGenerator,
  all,
  any,
  cancel,
  every,
  join,
  spawn,
  tween,
  usePlayback,
  useThread,
  waitFor,
} from '@canvas-commons/core';
import type {FlowProbe, FrameSample} from './flow-timing.probe';

const CaseTimeoutSeconds = 12;

const Published: {resolve: (probe: FlowProbe) => void} = {resolve: () => {}};
window.flowProbe = new Promise<FlowProbe>(resolve => {
  Published.resolve = resolve;
});

export default makeScene2D(function* () {
  const playback = usePlayback();
  const probe: FlowProbe = {
    fps: playback.fps,
    ticks: 0,
    wholeFrameTicks: 0,
    retimedTicksAfterChange: -1,
    canceledSpawnProgress: -1,
    controlProgress: -1,
    finalizedByCancel: [],
    anyWithoutTasksDoneAt: -1,
    joinFinishedDoneAt: -1,
    allDoneAt: -1,
    frames: [],
  };
  const now = () => useThread().time();

  function* everyCase(): ThreadGenerator {
    const fine = every(0.05, () => {
      probe.ticks++;
    });
    const whole = every(0.1, () => {
      probe.wholeFrameTicks++;
    });
    let retimedTicks = 0;
    const retimed = every(3, () => {
      retimedTicks++;
    });
    const fineTask: ThreadGenerator = yield fine.runner;
    const wholeTask: ThreadGenerator = yield whole.runner;
    const retimedTask: ThreadGenerator = yield retimed.runner;
    yield* waitFor(2.5);
    retimed.setInterval(0.5);
    const ticksBeforeChange = retimedTicks;
    yield* waitFor(1.5);
    probe.retimedTicksAfterChange = retimedTicks - ticksBeforeChange;
    cancel(fineTask, wholeTask, retimedTask);
  }

  function* spawnCase(): ThreadGenerator {
    const canceled = spawn(
      tween(2, value => {
        probe.canceledSpawnProgress = value;
      }),
    );
    const control: ThreadGenerator = yield tween(2, value => {
      probe.controlProgress = value;
    });
    yield* waitFor(0.5);
    cancel(canceled);
    yield* join(control);
  }

  const finalized: string[] = [];

  function* child(id: string): ThreadGenerator {
    try {
      yield* waitFor(5);
    } finally {
      finalized.push(id);
    }
  }

  function* finalizerCase(): ThreadGenerator {
    const leaf: ThreadGenerator = yield child('leaf');
    const group: ThreadGenerator = yield all(child('a'), child('b'));
    yield* waitFor(0.5);
    cancel(leaf, group);
    probe.finalizedByCancel = [...finalized];
  }

  function* anyWithoutTasksCase(): ThreadGenerator {
    const tasks: ThreadGenerator[] = [];
    yield* any(...tasks);
    probe.anyWithoutTasksDoneAt = now();
  }

  function* joinFinishedCase(): ThreadGenerator {
    const finished: ThreadGenerator = yield waitFor(0.1);
    yield* waitFor(0.5);
    yield* join(false, finished);
    probe.joinFinishedDoneAt = now();
  }

  function* allCase(): ThreadGenerator {
    yield* all(waitFor(0.1), waitFor(0.2));
    probe.allDoneAt = now();
  }

  function* measure(
    construct: FrameSample['construct'],
    seconds: number,
    task: ThreadGenerator,
  ): ThreadGenerator {
    const start = playback.frame;
    yield* task;
    probe.frames.push({construct, seconds, frames: playback.frame - start});
  }

  function* chainedWaits(count: number): ThreadGenerator {
    for (let i = 0; i < count; i++) {
      yield* waitFor(0.1);
    }
  }

  function* frameCase(): ThreadGenerator {
    for (const seconds of [0.1, 0.3, 0.5, 1]) {
      yield* measure('waitFor', seconds, waitFor(seconds));
      yield* measure(
        'tween',
        seconds,
        tween(seconds, () => {}),
      );
      yield* measure(
        'chained waitFor',
        seconds,
        chainedWaits(Math.round(seconds * 10)),
      );
    }
  }

  yield* any(
    waitFor(CaseTimeoutSeconds),
    all(
      everyCase(),
      spawnCase(),
      finalizerCase(),
      anyWithoutTasksCase(),
      joinFinishedCase(),
      allCase(),
      frameCase(),
    ),
  );

  Published.resolve(probe);
});
