import {Code, Latex, Rect, lines, makeScene2D} from '@canvas-commons/2d';
import {
  DEFAULT,
  cancel,
  createRef,
  createSignal,
  waitFor,
} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const scaleSubject = createRef<Rect>();
  const codeSubject = createRef<Code>();
  const texSubject = createRef<Latex>();
  const texReference = createRef<Latex>();
  const mixed = createSignal<number | string>(0);

  view.add(
    <>
      <Rect size={[1920, 1080]} fill="#000" />
      <Rect ref={scaleSubject} x={-400} y={-330} size={200} fill="#00aaff" />
      <Rect x={400} y={-330} size={200} fill="#00aaff" />
      <Code
        ref={codeSubject}
        x={-400}
        fontSize={50}
        fill="#fff"
        code={'one\ntwo'}
        selection={lines(0)}
      />
      <Code
        x={400}
        fontSize={50}
        fill="#fff"
        code={'one\ntwo'}
        selection={lines(1)}
      />
      <Rect
        size={120}
        fill={() => (typeof mixed() === 'string' ? '#00ff00' : '#ff0000')}
      />
      <Latex
        ref={texSubject}
        x={-400}
        y={330}
        scale={3}
        tex="x^2"
        fill="#fff"
      />
      <Latex
        ref={texReference}
        x={400}
        y={330}
        scale={3}
        tex="y^3"
        fill="#fff"
      />
    </>,
  );

  scaleSubject().scale(3);
  yield* scaleSubject().scale(DEFAULT, 1);

  const selectionTween = yield codeSubject().selection(lines(1), 1);
  yield* waitFor(0.3);
  cancel(selectionTween);
  codeSubject().selection(lines(1));
  yield* waitFor(0.1);

  yield* texSubject().tex('y^3', 1);
  yield* waitFor(0.5);
  texSubject().tex('z^4');
  texReference().tex('z^4');
  yield* waitFor(0.3);

  const texTween = yield texSubject().tex('w^5', 1);
  yield* waitFor(0.6);
  cancel(texTween);
  yield* waitFor(0.1);

  try {
    yield* mixed('done', 0.5);
  } catch {
    // The rectangle stays red when the tween fails.
  }
  yield* waitFor(0.1);
});
