import {Node, Rect, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';

function parts() {
  return {
    red: new Rect({x: -50, size: 120, fill: '#ff0000', opacity: 0.5}),
    blue: new Rect({size: 120, fill: '#0000ff', opacity: 0.5}),
    green: new Rect({x: 50, y: 60, size: 40, fill: '#00ff00'}),
  };
}

export default makeScene2D(function* (view) {
  view.add(new Rect({size: [1920, 1080], fill: '#ffffff'}));

  const moved = parts();
  const movedGroup = new Node({
    x: -600,
    children: [moved.red, moved.blue, moved.green],
  });
  view.add(movedGroup);
  movedGroup.add(moved.red);

  const expected = parts();
  view.add(
    new Node({
      x: -200,
      children: [expected.blue, expected.green, expected.red],
    }),
  );

  const inner = new Rect({size: 200, fill: '#ff8800'});
  const outer = new Node({x: 400, children: [inner]});
  view.add(outer);
  view.add(new Rect({x: 750, size: 100, fill: '#00aa00'}));

  yield* waitFor(0.1);
  try {
    inner.add(outer);
  } catch {
    // Rejecting the edit is an accepted outcome.
  }
  yield* waitFor(0.4);
});
