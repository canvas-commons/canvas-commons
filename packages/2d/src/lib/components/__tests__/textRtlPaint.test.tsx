import {describe, expect, it} from 'vitest';
import {TextAlign} from '../../partials';
import {Txt, TxtProps} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {PaintCall, recordingTextContext} from './recordingTextContext';
import {add, kernedWidth} from './sceneFixtures';

class Probe extends Txt {
  public probeDraw(context: CanvasRenderingContext2D) {
    this.draw(context);
  }
}

/** Left edge of a paint call, from the anchor the call was made under. */
function paintedLeft(call: PaintCall): number {
  const width = kernedWidth(call.text);
  const rtl = call.direction === 'rtl';
  switch (call.textAlign) {
    case 'center':
      return call.penX - width / 2;
    case 'right':
      return call.penX - width;
    case 'end':
      return rtl ? call.penX : call.penX - width;
    case 'start':
      return rtl ? call.penX - width : call.penX;
    default:
      return call.penX;
  }
}

/** Span the glyphs cover on the canvas, over every paint of a node. */
function paintedExtent(node: Probe): [number, number] {
  const {calls, context} = recordingTextContext();
  node.probeDraw(context);
  const spans = calls.map((call): [number, number] => {
    const left = paintedLeft(call);
    return [left, left + kernedWidth(call.text)];
  });
  return [
    Math.min(...spans.map(span => span[0])),
    Math.max(...spans.map(span => span[1])),
  ];
}

/** Span the reported words cover. */
function queriedExtent(node: Txt): [number, number] {
  const words = node.textWords();
  return [
    Math.min(...words.map(word => word.x - word.width / 2)),
    Math.max(...words.map(word => word.x + word.width / 2)),
  ];
}

describe('Txt right-to-left paint', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(kernedWidth);

  const Alignments: TextAlign[] = ['left', 'center', 'right', 'justify'];

  for (const textAlign of Alignments) {
    it(`paints a ${textAlign} rtl run where it is reported`, () => {
      const props: TxtProps = {
        text: 'AV',
        fontSize: 10,
        lineHeight: 20,
        width: 100,
        textWrap: false,
        textDirection: 'rtl',
        textAlign,
      };
      const probe = new Probe(props);
      add(probe);

      const [paintedFrom, paintedTo] = paintedExtent(probe);
      const [queriedFrom, queriedTo] = queriedExtent(probe);

      expect(paintedFrom).toBeCloseTo(queriedFrom, 5);
      expect(paintedTo).toBeCloseTo(queriedTo, 5);
    });
  }
});
