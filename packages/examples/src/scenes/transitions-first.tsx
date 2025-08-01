import {Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  view.add(
    <Rect
      width={'100%'}
      height={'100%'}
      fill={'lightseagreen'}
      layout
      alignItems={'center'}
      justifyContent={'center'}
    >
      <Txt
        fontSize={160}
        fontWeight={700}
        fill={'#fff'}
        fontFamily={'"JetBrains Mono", monospace'}
      >
        FIRST SCENE
      </Txt>
    </Rect>,
  );

  yield* waitFor(1);
});
