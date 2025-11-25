import {Latex, makeScene2D, math} from '@canvas-commons/2d';

export default makeScene2D(function* (view) {
  const first = new Latex({
    fill: 'white',
    fontSize: 64,
    tex: math('(x+y)^2'),
  });

  const second = new Latex({
    fill: 'white',
    fontSize: 64,
    tex: math('|a-b|^2'),
  });

  const third = new Latex({
    fill: 'white',
    fontSize: 64,
    tex: math('/sum_{n=0}^{/infty}n'),
  });

  const fourth = new Latex({
    fill: 'white',
    fontSize: 64,
    tex: math('/int_{0}^{/pi}/sin{x}=2'),
  });

  const fifth = new Latex({
    fill: 'white',
    fontSize: 64,
    tex: math('/ln|x|'),
  });

  view.add(first);

  yield* first.morph(second, 1);

  yield* first.morph(third, 1);

  yield* first.map(fourth, [[0], [1], [3, 7], [2, 8], [4], [5, 6]], 1);

  yield* first.map(fifth, [[0], [1], [2], [], [4], [1], [], [], [3]], 1);
});
