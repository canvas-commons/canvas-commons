import {
  Code,
  Rect,
  insert,
  makeScene2D,
  remove,
  replace,
} from '@canvas-commons/2d';
import {
  ThreadGenerator,
  all,
  cancel,
  createRef,
  waitFor,
} from '@canvas-commons/core';

const WIDTH = 600;
const HEIGHT = 60;
const ROW_HEIGHT = 200;
const FIRST_ROW = -400;
const EDITED_X = -600;
const CONTROL_X = 600;

function snippet(row: number, x: number, text: string, fontSize = 36) {
  const ref = createRef<Code>();
  const node = (
    <Code
      ref={ref}
      x={x}
      y={FIRST_ROW + row * ROW_HEIGHT + HEIGHT / 2}
      width={WIDTH}
      height={HEIGHT}
      fontFamily="monospace"
      fontSize={fontSize}
      fill="#000000"
      code={text}
    />
  );
  return {ref, node};
}

export default makeScene2D(function* (view) {
  view.add(<Rect size={[1920, 1080]} fill="#ffffff" />);

  const mixed = snippet(0, EDITED_X, 'f(aa, bb, cc)');
  const disjoint = snippet(1, EDITED_X, 'xxxx yyyy zzzz');
  const overlapping = snippet(2, EDITED_X, 'xxxx yyyy zzzz');
  const cancelled = snippet(3, EDITED_X, 'xxxx yyyy zzzz');
  const resized = snippet(4, EDITED_X, 'yyyy xxxx zzzz');
  const controls = [
    snippet(0, CONTROL_X, 'f(XXX, bb);'),
    snippet(1, CONTROL_X, 'AAAA yyyy CCCC'),
    snippet(2, CONTROL_X, 'BBBB yyyy zzzz'),
    snippet(3, CONTROL_X, 'AAAA yyyy zzzz'),
    snippet(4, CONTROL_X, 'yyyy AA zzzz', 54),
  ];
  for (const {node} of [
    mixed,
    disjoint,
    overlapping,
    cancelled,
    resized,
    ...controls,
  ]) {
    view.add(node);
  }

  yield mixed
    .ref()
    .code.edit(
      1,
    )`f(${replace('aa', 'XXX')}, bb${remove(', cc')})${insert(';')}`;

  yield disjoint.ref().code.edit(1)`${replace('xxxx', 'AAAA')} yyyy zzzz`;
  yield (function* (): ThreadGenerator {
    yield* waitFor(0.3);
    yield* disjoint.ref().code.edit(1)`AAAA yyyy ${replace('zzzz', 'CCCC')}`;
  })();

  yield overlapping.ref().code.edit(1)`${replace('xxxx', 'AAAA')} yyyy zzzz`;
  yield (function* (): ThreadGenerator {
    yield* waitFor(0.3);
    yield* overlapping.ref().code.edit(1)`${replace('AAAA', 'BBBB')} yyyy zzzz`;
  })();

  const cancelledEdit = yield cancelled
    .ref()
    .code.edit(1)`${replace('xxxx', 'AAAA')} yyyy zzzz`;
  yield (function* (): ThreadGenerator {
    yield* waitFor(0.5);
    cancel(cancelledEdit);
  })();

  yield* all(
    resized.ref().fontSize(54, 1),
    resized.ref().code.edit(1)`yyyy ${replace('xxxx', 'AA')} zzzz`,
  );
  yield* waitFor(0.5);
});
