import {Circle, Layout, Rect, Txt, makeScene2D} from '@canvas-commons/2d';

import {createRef, range, useRandom} from '@canvas-commons/core';
import {Logo} from '../components/Logo';

// Catppuccin Mocha, matching the docs site's dark theme (custom.css).
const TEXT = '#cdd6f4';
const SUBTEXT = '#a6adc8';
const BASE = '#1e1e2e';
const MANTLE = '#181825';
const ACCENT = '#89b4fa';

const FALLBACK_STACK = 'system-ui, -apple-system, Segoe UI, sans-serif';
const HEADING_FONT = `Space Grotesk, ${FALLBACK_STACK}`;
const BODY_FONT = `IBM Plex Sans, ${FALLBACK_STACK}`;

const TAGLINE =
  'A TypeScript framework for creating animations with code. Write animations with JSX and generators.';

export default makeScene2D(function* (view) {
  const heading = createRef<Txt>();
  const random = useRandom();
  const circleColors = [BASE, MANTLE];
  view.add(
    <>
      {[...range(20)].map(() => {
        const size = random.nextInt(10, 150);
        return (
          <Circle
            x={random.nextInt(size, view.width() - size) - view.width() / 2}
            y={random.nextInt(size, view.height() - size) - view.height() / 2}
            size={size}
            fill={circleColors[random.nextInt(0, circleColors.length)]}
          ></Circle>
        );
      })}
      <Layout
        layout
        direction={'column'}
        alignItems={'center'}
        justifyContent={'center'}
        gap={48}
        width={'100%'}
        height={'100%'}
        padding={80}
      >
        <Layout layout direction={'row'} alignItems={'center'} gap={32}>
          <Logo size={128} />
          <Layout direction={'column'} alignItems={'start'} gap={16}>
            <Txt
              fontSize={92}
              fontWeight={700}
              fontFamily={HEADING_FONT}
              fill={TEXT}
              ref={heading}
            >
              Canvas Commons
            </Txt>
            <Rect width={'100%'} height={6} radius={3} fill={ACCENT} />
          </Layout>
        </Layout>
        <Txt
          fontSize={32}
          fontFamily={BODY_FONT}
          fill={SUBTEXT}
          width={840}
          textAlign={'center'}
        >
          {TAGLINE}
        </Txt>
      </Layout>
      ,
    </>,
  );

  yield;
});
