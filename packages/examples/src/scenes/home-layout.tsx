import {Layout, makeScene2D, Rect} from '@canvas-commons/2d';
import {createRef, useScene, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const v = useScene().variables;
  const group = createRef<Layout>();
  const extra = createRef<Rect>();
  const palette = [
    v.get('--cc-red', '#f38ba8'),
    v.get('--cc-peach', '#fab387'),
    v.get('--cc-yellow', '#f9e2af'),
    v.get('--cc-green', '#a6e3a1'),
  ];

  view.add(
    <Layout ref={group} layout gap={20} padding={20}>
      {palette.map(fill => (
        <Rect width={90} height={120} radius={12} fill={fill} />
      ))}
    </Layout>,
  );

  yield* waitFor(0.3);
  yield* group().insert(
    <Rect
      ref={extra}
      width={90}
      height={120}
      radius={12}
      fill={v.get('--cc-blue', '#89b4fa')}
    />,
    1,
    0.6,
  );
  yield* waitFor(0.2);
  yield* group().gap(56, 0.6);
  yield* waitFor(0.2);
  yield* extra().remove(0.6);
  yield* group().gap(20, 0.6);
  yield* waitFor(0.4);
});
