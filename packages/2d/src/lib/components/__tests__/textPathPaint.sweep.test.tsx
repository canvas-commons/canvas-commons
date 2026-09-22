import {describe, expect, it} from 'vitest';
import {TextAlign} from '../../partials';
import {Txt, TxtProps} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {recordingTextContext} from './recordingTextContext';
import {CHAR_WIDTH, add} from './sceneFixtures';

class Probe extends Txt {
  public probeDraw(context: CanvasRenderingContext2D) {
    this.draw(context);
  }
}

/** Glyph count and the span the glyphs cover, in scene coordinates. */
function paintedSpan(node: Probe): {count: number; from: number; to: number} {
  const {calls, context} = recordingTextContext();
  node.probeDraw(context);
  const lefts = calls.map(call => call.penX);
  const rights = calls.map(call => call.penX + call.text.length * CHAR_WIDTH);
  return {
    count: calls.length,
    from: Math.min(...lefts),
    to: Math.max(...rights),
  };
}

describe('Txt path paint', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  const Text = 'pack my box';
  const Spans: Record<string, [number, number]> = {
    left: [-250, -140],
    center: [-55, 55],
    right: [140, 250],
  };

  for (const textAlign of Object.keys(Spans) as TextAlign[]) {
    for (const width of [undefined, 110]) {
      const label = width === undefined ? 'its path' : 'its text';
      it(`places a ${textAlign} run along a path as wide as ${label}`, () => {
        const props: TxtProps = {
          text: Text,
          fontSize: 10,
          lineHeight: 20,
          textPath: 'M -250 0 L 250 0',
          textAlign,
          width,
        };
        const probe = new Probe(props);
        add(probe);

        const {count, from, to} = paintedSpan(probe);
        expect(count).toBe(Text.length);
        expect(from).toBeCloseTo(Spans[textAlign][0], 5);
        expect(to).toBeCloseTo(Spans[textAlign][1], 5);
      });
    }
  }
});
