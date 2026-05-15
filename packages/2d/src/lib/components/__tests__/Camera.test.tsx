import {Vector2} from '@canvas-commons/core';
import 'geometry-polyfill';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes/index.js';
import {Camera} from '../Camera.js';
import {Node} from '../Node.js';
import {Rect} from '../Rect.js';
import {mockScene2D} from './mockScene2D.js';

describe('Camera', () => {
  mockScene2D();

  it("parents the scene so descendants' localToWorld matches rendering", () => {
    const view = useScene2D().getView();
    const child = new Rect({size: 100, position: [0, 0]});
    const camera = new Camera({children: child});
    view.add(camera);

    expect(camera.scene().parent()).toBe(camera);

    const worldOrigin = new Vector2(0, 0).transformAsPoint(
      child.localToWorld(),
    );
    const viewCenter = new Vector2(0, 0).transformAsPoint(view.localToWorld());
    expect(worldOrigin.x).toBeCloseTo(viewCenter.x, 3);
    expect(worldOrigin.y).toBeCloseTo(viewCenter.y, 3);
  });

  it('applies the inverse camera transform to descendants in world-space', () => {
    const view = useScene2D().getView();
    const child = new Rect({size: 100, position: [0, 0]});
    const camera = new Camera({position: [-300, 120], children: child});
    view.add(camera);

    const viewCenter = new Vector2(0, 0).transformAsPoint(view.localToWorld());
    const childWorld = new Vector2(0, 0).transformAsPoint(child.localToWorld());

    expect(childWorld.x).toBeCloseTo(viewCenter.x + 300, 3);
    expect(childWorld.y).toBeCloseTo(viewCenter.y - 120, 3);
  });

  it("updates descendants' localToWorld when the camera pans", () => {
    const view = useScene2D().getView();
    const child = new Rect({size: 100, position: [-200, 0]});
    const camera = new Camera({children: child});
    view.add(camera);

    const viewCenter = new Vector2(0, 0).transformAsPoint(view.localToWorld());

    const before = new Vector2(0, 0).transformAsPoint(child.localToWorld());
    expect(before.x).toBeCloseTo(viewCenter.x - 200, 3);

    camera.position([-400, 0]);

    const after = new Vector2(0, 0).transformAsPoint(child.localToWorld());
    expect(after.x).toBeCloseTo(viewCenter.x + 200, 3);
  });

  it('reparents the scene when reassigning the scene signal', () => {
    const view = useScene2D().getView();
    const camera = new Camera({});
    view.add(camera);

    const originalScene = camera.scene();
    expect(originalScene.parent()).toBe(camera);

    const newScene = new Node({});
    camera.scene(newScene);

    expect(newScene.parent()).toBe(camera);
    expect(originalScene.parent()).toBe(null);
  });
});
