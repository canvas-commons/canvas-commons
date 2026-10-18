import {
  Latex,
  LatexProps,
  Rect,
  UnitPose,
  insert,
  makeScene2D,
  morph,
  remove,
} from '@canvas-commons/2d';
import {
  ThreadGenerator,
  all,
  cancel,
  createRef,
  waitFor,
} from '@canvas-commons/core';

const PMATRIX =
  '\\begin{pmatrix} {{a}} & {{b}} \\\\ {{c}} & {{d}} \\end{pmatrix}';
const PMATRIX_MAP: number[][] = [[1], [2], [0], [3], [4]];
const SUM = '{{x}}{{+y}}{{=3}}';

function cell(index: number, target = false) {
  const column = (index % 2) * 2 + (target ? 1 : 0);
  return {x: -720 + column * 480, y: -432 + Math.floor(index / 2) * 216};
}

function formula(index: number, tex: string, props: LatexProps = {}) {
  return (
    <Latex tex={tex} fill="#000000" fontSize={64} {...cell(index)} {...props} />
  );
}

function expected(index: number, tex: string, props: LatexProps = {}) {
  return formula(index, tex, {...cell(index, true), ...props});
}

export default makeScene2D(function* (view) {
  view.add(<Rect size={[1920, 1080]} fill="#ffffff" />);

  const add = (index: number, tex: string, target: string, props = {}) => {
    const ref = createRef<Latex>();
    view.add(formula(index, tex, {ref}));
    view.add(expected(index, target, props));
    return ref();
  };

  const insertRemove = add(0, SUM, 'a=3+q');
  const replaced = add(1, SUM, 'a=3\\cdot 7');
  const cancelledEdit = add(2, SUM, 'a=3+q');
  const cancelledMap = add(3, '{{x}}^{{2}} + {{y}}^{{2}}', PMATRIX);
  const transformed = add(4, SUM, 'a=3+q', {
    scale: 0.7,
    x: cell(4, true).x + 100,
  });
  const template = add(5, 'x+y=3', 'x+y=3+z\\cdot 2');
  const plainMap = add(6, '{{x}}^{{2}} + {{y}}^{{2}}', PMATRIX);

  view.add(formula(7, 'x+y=3+z'));

  const growing = add(8, 'x=3', 'x=3+y');
  growing.fragmentTransition({
    incoming: (pose: UnitPose, progress: number) => ({
      ...pose,
      scale: 0.2 + 0.8 * progress,
      opacity: 1,
    }),
  });

  const sumEdit = (node: Latex) =>
    node.edit(1)`${morph('x', 'a')}${remove('+y')}=3${insert('+q')}`;

  yield sumEdit(insertRemove);

  yield (function* (): ThreadGenerator {
    const first = yield sumEdit(replaced);
    yield* waitFor(0.3);
    yield* replaced.replace(1, morph('+q', '\\cdot 7'));
    yield* first;
  })();

  yield (function* (): ThreadGenerator {
    const edit = yield sumEdit(cancelledEdit);
    yield* waitFor(0.5);
    cancel(edit);
  })();

  yield (function* (): ThreadGenerator {
    const map = yield cancelledMap.map(PMATRIX, PMATRIX_MAP, 1);
    yield* waitFor(0.5);
    cancel(map);
  })();

  yield all(
    sumEdit(transformed),
    transformed.scale(0.7, 1),
    transformed.position.x(cell(4).x + 100, 1),
  );

  yield (function* (): ThreadGenerator {
    yield template.tex('x+y=3+z', 1);
    yield* waitFor(0.3);
    yield* template.tex('x+y=3+z\\cdot 2', 1);
  })();

  yield growing.replace(1, insert('+y'));

  yield* plainMap.map(PMATRIX, PMATRIX_MAP, 1);
  yield* waitFor(1);
});
