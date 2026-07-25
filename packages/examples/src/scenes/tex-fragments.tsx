import {fade, Latex, makeScene2D, morph, partialFade} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const tex = createRef<Latex>();
  view.add(
    <Latex ref={tex} tex="{{a}}{{x^2}} + {{b}}" fill="white" fontSize={48} />,
  );

  yield* waitFor(0.3);
  yield* tex().tex('{{c}}{{y^2}} + {{d}}', 1);

  yield* waitFor(0.3);
  tex().fragmentTransition('fade');
  yield* tex().tex('{{p}}{{y^2}} + {{q}}', 1);
  tex().fragmentTransition('morph');

  yield* waitFor(0.3);
  yield* tex().edit(
    1,
  )`${fade('p', '(2)')}${partialFade('y^2', 'z^2')} + ${morph('q', 'r')}`;

  yield* waitFor(0.3);
  yield* tex().replace(
    1,
    fade('(', ''),
    morph('2', '4'),
    fade(')', ''),
    fade('z^2', 'w'),
  );

  yield* waitFor(0.3);
  tex().debugFragments(true);
  yield* waitFor(0.3);
});
