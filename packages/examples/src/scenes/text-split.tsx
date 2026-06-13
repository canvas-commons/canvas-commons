import {Node, Txt, makeScene2D} from '@canvas-commons/2d';
import {sequence, waitFor} from '@canvas-commons/core';

/**
 * Regression scene for {@link Txt.split}. Frame 0 is the source, the mid frame
 * is the exploded copy (`source.split(...)` pieces at the source's transform),
 * and the last frame is a whole-string clone whose diff is pipeline noise, not
 * a split-math error. packages/e2e/src/text-split.test.ts compares them.
 */

function wrap(source: Txt, children: Txt[]): Node {
  return new Node({
    position: source.position(),
    rotation: source.rotation(),
    scale: source.scale(),
    opacity: 0,
    children,
  });
}

function cloneWhole(source: Txt): Node {
  return wrap(source, [
    new Txt({
      fontFamily: source.fontFamily(),
      fontSize: source.fontSize(),
      fontStyle: source.fontStyle(),
      fontWeight: source.fontWeight(),
      letterSpacing: source.letterSpacing(),
      fill: source.fill(),
      textAlign: source.textAlign(),
      textWrap: source.textWrap(),
      width: source.width.context.getter() ?? undefined,
      lineHeight: source.lineHeight(),
      text: source.text(),
    }),
  ]);
}

export default makeScene2D(function* (view) {
  view.fill('#0d1117');

  const column = 1180;
  const body = (text: string) =>
    new Txt({
      fontFamily: 'sans-serif',
      fontSize: 42,
      lineHeight: 60,
      fill: '#b8c1cc',
      width: column,
      textAlign: 'left',
      text,
    });

  const sources = [
    new Txt({
      fontFamily: 'sans-serif',
      fontWeight: 700,
      fontSize: 104,
      lineHeight: 116,
      fill: '#f5f5f5',
      width: column,
      textAlign: 'left',
      text: 'Procedural for a Change',
    }),
    body(
      'Let the execution of your code define the animation. Write generator ' +
        'functions that describe what should happen - step by step.',
    ),
    body(
      'Focus on duration, speed and acceleration instead of hardcoded key ' +
        'frames.',
    ),
  ];
  sources.forEach(n => view.add(n));

  // Shared width centered at x=0 aligns every left edge; stack the measured
  // heights into a vertically centered block.
  const gaps = [56, 36];
  const heights = sources.map(n => n.height());
  const total = heights.reduce((sum, h) => sum + h, 0) + gaps[0] + gaps[1];
  let top = total / -2;
  sources.forEach((n, i) => {
    n.position([0, top + heights[i] / 2]);
    top += heights[i] + (gaps[i] ?? 0);
  });

  const exploded = sources.map(n => wrap(n, n.split('grapheme')));
  const whole = sources.map(cloneWhole);
  exploded.forEach(n => view.add(n));
  whole.forEach(n => view.add(n));

  yield* waitFor(0.2);
  sources.forEach(n => n.opacity(0));
  exploded.forEach(n => n.opacity(1));
  yield* waitFor(0.2);

  yield* sequence(0.2, ...exploded[0].children().map(n => n.rotation(360, 1)));
  yield* waitFor(1);

  exploded.forEach(n => n.opacity(0));
  whole.forEach(n => n.opacity(1));
  yield* waitFor(0.2);
});
