import {describe, expect, it, vi} from 'vitest';
import {useScene2D} from '../../scenes';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

describe('Txt measurement canvas', () => {
  mockScene2D();
  mockTextContext();

  it('does not allocate a canvas per node', () => {
    const view = useScene2D().getView();

    // Warm lazy canvas allocation before observing subsequent nodes.
    const warmup = new Txt({text: 'warmup'});
    view.add(warmup);
    warmup.size();

    const createElement = vi.spyOn(document, 'createElement');
    try {
      for (let i = 0; i < 4; i++) {
        const txt = new Txt({text: `item ${i}`});
        view.add(txt);
        txt.size();
      }
      const canvases = createElement.mock.calls.filter(
        ([tag]) => tag === 'canvas',
      ).length;
      expect(canvases).toBe(0);
    } finally {
      createElement.mockRestore();
    }
  });
});
