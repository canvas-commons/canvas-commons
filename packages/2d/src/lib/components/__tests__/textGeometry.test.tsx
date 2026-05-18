import {createRef} from '@canvas-commons/core';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout} from '../Layout';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';

// Wrapping needs real width measurements, so getContext is shimmed with a
// deterministic context that reports 10px per character — the same pattern
// used by the text unit geometry tests.
describe('Txt flex-constrained wrapping', () => {
  mockScene2D();

  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeAll(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    const fakeContext = {
      font: '',
      letterSpacing: '0px',
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      save() {},
      restore() {},
      measureText(text: string) {
        return {width: text.length * 10} as TextMetrics;
      },
      fillText() {},
      strokeText() {},
    } as unknown as CanvasRenderingContext2D;
    HTMLCanvasElement.prototype.getContext = function (kind: string) {
      return kind === '2d' ? fakeContext : null;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('wraps at the yoga-resolved width when no width is declared', () => {
    const view = useScene2D().getView();
    const txt = createRef<Txt>();
    const wrapper = (
      <Layout layout={true} width={200}>
        <Txt ref={txt} fontSize={10} lineHeight={20}>
          one two three four five six
        </Txt>
      </Layout>
    ) as Layout;
    view.add(wrapper);

    // 27 characters at 10px each cannot fit a 200px flex container, so the
    // draw-side layout must wrap at the computed width instead of treating
    // the missing declared width as unconstrained.
    const layout = txt().textLines();
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.width).toBeLessThanOrEqual(200.5);
  });
});
