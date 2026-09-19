import {makeScene2D, Rect} from '@canvas-commons/2d';
import {
  all,
  createRefArray,
  easeInOutCubic,
  useScene,
  waitFor,
} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const v = useScene().variables;
  const values = [5, 2, 8, 1, 6, 3];
  const bars = createRefArray<Rect>();
  const gap = 90;
  const slot = (i: number) => (i - (values.length - 1) / 2) * gap;

  view.add(
    values.map(val => (
      <Rect
        ref={bars}
        width={64}
        height={val * 36}
        y={200 - (val * 36) / 2}
        radius={8}
        fill={v.get('--cc-blue', '#89b4fa')}
      />
    )),
  );
  bars.forEach((bar, i) => bar.x(slot(i)));

  const order = values.map((val, i) => ({val, bar: bars[i]}));
  for (let i = 1; i < order.length; i++) {
    let j = i;
    while (j > 0 && order[j - 1].val > order[j].val) {
      [order[j - 1], order[j]] = [order[j], order[j - 1]];
      j--;
    }
    yield* all(...order.map((o, k) => o.bar.x(slot(k), 0.4, easeInOutCubic)));
  }
  yield* waitFor(0.6);
});
