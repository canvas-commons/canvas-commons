import {Layout, Txt, makeScene2D} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';

const Paragraph = `Canvas Commons consists of two main components:

- A TypeScript library that uses generators to program animations.
- An editor providing a real-time preview of said animations.

It's a specialized tool designed to create informative vector animations and synchronize them with voice-overs. It's not meant to be a replacement for traditional video editing software.`;

export default makeScene2D(function* (view) {
  view.fill('#000');

  const hero = createRef<Txt>();
  const body = createRef<Txt>();

  view.add(
    <Layout direction={'column'} gap={48} alignItems={'center'} layout>
      <Txt
        ref={hero}
        strokeFirst
        lineWidth={20}
        lineJoin={'round'}
        stroke={'#fff'}
        fill={'#ff8888'}
        fontSize={320}
        fontWeight={900}
        fontFamily={'Segoe Print'}
        text={'Hello!'}
      />
      <Txt
        ref={body}
        fontSize={36}
        fontFamily={'"JetBrains Mono", monospace'}
        fill={'#fff'}
        width={1400}
        textWrap={'pre-wrap'}
        textAlign={'left'}
        text={Paragraph}
      />
    </Layout>,
  );

  yield* waitFor(0.3);
  yield* body().textAlign('center', 0.6);
  yield* waitFor(0.3);
  yield* body().textAlign('right', 0.6);
});
