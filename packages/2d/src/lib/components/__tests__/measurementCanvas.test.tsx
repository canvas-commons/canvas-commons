import {describe, expect, it, vi} from 'vitest';
import {useScene2D} from '../../scenes';
import {Code} from '../Code';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {TextState, mockTextContext} from './mockTextContext';

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

describe('Code measurement canvas', () => {
  mockScene2D();
  mockTextContext();

  it('does not allocate a canvas per node', () => {
    const view = useScene2D().getView();

    // Warm lazy canvas allocation before observing subsequent nodes.
    const warmup = new Code({code: 'warmup'});
    view.add(warmup);
    warmup.size();

    const createElement = vi.spyOn(document, 'createElement');
    try {
      for (let i = 0; i < 4; i++) {
        const code = new Code({code: `item(${i});`});
        view.add(code);
        code.size();
        code.getPointBBox([0, 0]);
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

/** Glyphs scale with the font size, so a wrong font shows up as a wrong width. */
function fontSensitiveWidth(text: string, state: TextState): number {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1] ?? 20);
  return text.length * (size / 2 + parseFloat(state.letterSpacing));
}

describe('shared measurement state', () => {
  mockScene2D();
  mockTextContext(fontSensitiveWidth);

  it('measures Code in its own font when a fragment measures a Txt', () => {
    const view = useScene2D().getView();
    const txt = new Txt({text: 'hello', fontSize: 60, letterSpacing: 7});
    view.add(txt);
    const code = new Code({
      fontSize: 20,
      code: [() => txt.textWords()[0]?.text ?? ''],
    });
    view.add(code);

    expect(code.size().x).toBeCloseTo(50);
  });
});
