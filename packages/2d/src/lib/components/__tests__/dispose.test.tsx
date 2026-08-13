import {ComputedContext, createSignal} from '@canvas-commons/core';
import {describe, expect, it, vi} from 'vitest';
import {computed} from '../../decorators';
import {Rect} from '../Rect';
import {mockScene2D} from './mockScene2D';

const ExternalSignal = createSignal(0);
let Evaluations = 0;

class ExternalReader extends Rect {
  @computed()
  public reads(): number {
    Evaluations++;
    return ExternalSignal();
  }
}

describe('Node.dispose', () => {
  mockScene2D();

  it('tracks ExternalSignal dependencies through decorated computeds', () => {
    const node = new ExternalReader({});
    ExternalSignal(0);

    const before = Evaluations;
    expect(node.reads()).toBe(0);
    expect(node.reads()).toBe(0);
    expect(Evaluations).toBe(before + 1);

    ExternalSignal(7);
    expect(node.reads()).toBe(7);
    expect(Evaluations).toBe(before + 2);
  });

  it('disposes decorator-created computeds', () => {
    const node = new ExternalReader({});
    node.reads();

    const dispose = vi.spyOn(ComputedContext.prototype, 'dispose');
    try {
      node.dispose();
      expect(dispose).toHaveBeenCalled();
    } finally {
      dispose.mockRestore();
    }
  });
});
