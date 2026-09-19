import {endScene, startScene} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Scene2D, useScene2D} from '../../scenes';
import {Node} from '../Node';
import {mockScene2D} from './mockScene2D';

class Probe extends Node {
  public collectedIn: Scene2D | null = null;

  protected override collectAsyncResources() {
    super.collectAsyncResources();
    this.collectedIn = useScene2D();
  }
}

describe('Node.toPromise', () => {
  mockScene2D();

  it('collects resources in the scene of the node when awaited outside it', async () => {
    const scene = useScene2D();
    const probe = new Probe({});

    endScene(scene);
    try {
      await probe.toPromise();
    } finally {
      startScene(scene);
    }

    expect(probe.collectedIn).toBe(scene);
  });
});
