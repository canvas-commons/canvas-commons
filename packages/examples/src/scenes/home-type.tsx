import {Circle, Node, Txt, makeScene2D} from '@canvas-commons/2d';
import {
  createRef,
  easeOutBack,
  sequence,
  useScene,
  waitFor,
} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const v = useScene().variables;
  const title = createRef<Txt>();
  const ring = createRef<Circle>();

  view.add(
    <>
      <Txt
        ref={title}
        y={-150}
        fontFamily={'sans-serif'}
        fontWeight={700}
        fontSize={64}
        fill={v.get('--cc-text', '#cdd6f4')}
      >
        Canvas Commons
      </Txt>
      <Circle
        ref={ring}
        y={120}
        size={200}
        stroke={v.get('--cc-surface2', '#585b70')}
        lineWidth={2}
      />
      <Txt
        y={120}
        textPath={ring}
        textAlign={'center'}
        fontFamily={'sans-serif'}
        fontWeight={700}
        fontSize={24}
        fill={v.get('--cc-mauve', '#cba6f7')}
      >
        Why don't we ask the circle birds?
      </Txt>
    </>,
  );

  const glyphs = title().split('grapheme');
  const wrapper = new Node({position: title().position()});
  glyphs.forEach(g => {
    g.scale(0);
    wrapper.add(g);
  });
  title().remove();
  view.add(wrapper);

  yield* waitFor(0.2);
  yield* sequence(0.06, ...glyphs.map(g => g.scale(1, 0.5, easeOutBack)));
  yield* ring().rotation(360, 3);
  yield* waitFor(0.3);
});
