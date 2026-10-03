import {Node, Rect, Txt, blur, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';

const CELL_X = [-768, -384, 0, 384, 768];
const SUBJECT_Y = -270;
const REFERENCE_Y = 270;

export default makeScene2D(function* (view) {
  view.add(<Rect size={[1920, 1080]} fill="#ffffff" />);

  const pair = (column: number, subject: Node, reference: Node) => {
    subject.position([CELL_X[column], SUBJECT_Y]);
    reference.position([CELL_X[column], REFERENCE_Y]);
    view.add(subject);
    view.add(reference);
  };

  pair(
    0,
    <Rect size={10} cache>
      <Rect size={400} scale={0.25} fill="#000000" filters={[blur(40)]} />
    </Rect>,
    <Node>
      <Rect size={400} scale={0.25} fill="#000000" filters={[blur(40)]} />
    </Node>,
  );

  pair(
    1,
    <Txt fontSize={120} lineHeight="60%" text="Hg" cache fill="#000000" />,
    <Txt fontSize={120} lineHeight="60%" text="Hg" fill="#000000" />,
  );

  pair(
    2,
    <Node composite cache rotation={90}>
      <Rect
        size={400}
        scale={[0.5, 0.25]}
        fill="#000000"
        filters={[blur(40)]}
      />
    </Node>,
    <Node composite rotation={90}>
      <Rect
        size={400}
        scale={[0.5, 0.25]}
        fill="#000000"
        filters={[blur(40)]}
      />
    </Node>,
  );

  pair(
    4,
    <Node composite cache scale={[2, 1]}>
      <Rect size={120} fill="#000000" filters={[blur(20)]} />
    </Node>,
    <Node composite scale={[2, 1]}>
      <Rect size={120} fill="#000000" filters={[blur(20)]} />
    </Node>,
  );

  pair(
    3,
    <Txt
      fontSize={160}
      fontFamily="serif"
      fontStyle="italic"
      text="fjf"
      cache
      fill="#000000"
    />,
    <Txt
      fontSize={160}
      fontFamily="serif"
      fontStyle="italic"
      text="fjf"
      fill="#000000"
    />,
  );

  yield* waitFor(0.1);
});
