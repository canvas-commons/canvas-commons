import {Vector2} from '@canvas-commons/core';
import 'geometry-polyfill';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Rect} from '../Rect';
import {mockScene2D} from './mockScene2D';

describe('Scene2D node coordinates', () => {
  mockScene2D();

  it('returns null for unknown elements', () => {
    const scene = useScene2D();
    expect(scene.inspectElementMatrix('does-not-exist')).toBeNull();
    expect(scene.inspectElementMatrix(null)).toBeNull();
  });

  it('maps a scene-space point into the node local space', () => {
    const scene = useScene2D();
    const view = scene.getView();
    const rect = new Rect({size: 100, position: [200, 120]});
    view.add(rect);

    const localToScene = scene.inspectElementMatrix(rect.key);
    expect(localToScene).not.toBeNull();

    // The node's own origin, in scene space, must map back to (0, 0) locally.
    const sceneOrigin = new Vector2(0, 0).transformAsPoint(rect.localToWorld());
    const scenePoint = scene.transformMousePosition(
      sceneOrigin.x,
      sceneOrigin.y,
    )!;
    const local = scenePoint.transformAsPoint(localToScene!.inverse());

    expect(local.x).toBeCloseTo(0, 3);
    expect(local.y).toBeCloseTo(0, 3);
  });

  it('keeps a location pinned as the node moves and scales', () => {
    const scene = useScene2D();
    const view = scene.getView();
    const rect = new Rect({size: 100, position: [0, 0]});
    view.add(rect);

    // A fixed local point on the node.
    const localTarget = new Vector2(25, -10);

    const sampleLocal = () => {
      const localToScene = scene.inspectElementMatrix(rect.key)!;
      // Put the mouse exactly on the local target's current scene position.
      const targetScene = localTarget.transformAsPoint(rect.localToWorld());
      const mouseScene = scene.transformMousePosition(
        targetScene.x,
        targetScene.y,
      )!;
      return mouseScene.transformAsPoint(localToScene.inverse());
    };

    const before = sampleLocal();
    expect(before.x).toBeCloseTo(localTarget.x, 3);
    expect(before.y).toBeCloseTo(localTarget.y, 3);

    rect.position([300, 150]);
    rect.scale(2);
    rect.rotation(30);

    const after = sampleLocal();
    expect(after.x).toBeCloseTo(localTarget.x, 3);
    expect(after.y).toBeCloseTo(localTarget.y, 3);
  });
});
