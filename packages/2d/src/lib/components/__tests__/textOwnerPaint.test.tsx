import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Node} from '../Node';
import {TextLayoutResult, Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {PaintCall, recordingTextContext} from './recordingTextContext';

class PaintProbe extends Txt {
  public probeDraw(context: CanvasRenderingContext2D) {
    this.draw(context);
  }

  public probePrepared(): object | null {
    return this.preparedLayout();
  }

  public probeLayout(): TextLayoutResult {
    return this.textLayout();
  }

  public probePlaced(): object {
    return this.positionedLines();
  }
}

function add(node: Node): void {
  useScene2D().getView().add(node);
}

function paint(txt: PaintProbe): PaintCall[] {
  const {calls, context} = recordingTextContext();
  txt.probeDraw(context);
  return calls;
}

function wordPositions(txt: Txt): number[] {
  return txt.textWords().map(word => word.x);
}

describe('Txt owner paint', () => {
  mockScene2D();
  mockTextContext();

  it('does not paint the text of a transparent span', () => {
    const hidden = new Txt({text: 'hidden', opacity: 0});
    const txt = new PaintProbe({fontSize: 10, children: [hidden]});
    add(txt);

    expect(paint(txt)).toEqual([]);
  });

  it('multiplies the opacity of every span between the run and the root', () => {
    const inner = new Txt({text: 'deep', opacity: 0.5});
    const middle = new Txt({opacity: 0.5, children: [inner]});
    const txt = new PaintProbe({
      fontSize: 10,
      opacity: 0.5,
      children: [middle],
    });
    add(txt);

    const calls = paint(txt);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe('deep');
    expect(calls[0].globalAlpha).toBeCloseTo(0.25);
  });

  it('repaints a span at its new opacity without laying out again', () => {
    const span = new Txt({text: 'span'});
    const txt = new PaintProbe({fontSize: 10, children: ['head ', span]});
    add(txt);

    const before = paint(txt);
    const prepared = txt.probePrepared();
    const layout = txt.probeLayout();
    const placed = txt.probePlaced();

    span.opacity(0.3);
    const after = paint(txt);

    expect(before.map(call => call.globalAlpha)).toEqual([1, 1]);
    expect(after.map(call => call.globalAlpha)).toEqual([1, 0.3]);
    expect(after.map(call => call.x)).toEqual(before.map(call => call.x));
    expect(txt.probePrepared()).toBe(prepared);
    expect(txt.probeLayout()).toBe(layout);
    expect(txt.probePlaced()).toBe(placed);
  });

  it('repaints a span in its new fill without laying out again', () => {
    const span = new Txt({text: 'span', fill: 'red'});
    const txt = new PaintProbe({fontSize: 10, children: ['head ', span]});
    add(txt);

    const before = paint(txt);
    const prepared = txt.probePrepared();
    const layout = txt.probeLayout();
    const placed = txt.probePlaced();

    span.fill('blue');
    const after = paint(txt);

    expect(after[1].fillStyle).not.toBe(before[1].fillStyle);
    expect(txt.probePrepared()).toBe(prepared);
    expect(txt.probeLayout()).toBe(layout);
    expect(txt.probePlaced()).toBe(placed);
  });

  it('keeps the space of a transparent span in the layout', () => {
    const span = new Txt({text: 'middle '});
    const txt = new PaintProbe({
      fontSize: 10,
      children: ['head ', span, 'tail'],
    });
    add(txt);

    const opaque = wordPositions(txt);
    span.opacity(0);

    expect(wordPositions(txt)).toEqual(opaque);
  });

  it('paints two opaque runs exactly as before owner paint', () => {
    const txt = new PaintProbe({
      fontSize: 10,
      lineHeight: 20,
      width: 200,
      textAlign: 'left',
      children: [new Txt({text: 'red ', fill: 'red'}), new Txt({text: 'rest'})],
    });
    add(txt);

    expect(paint(txt)).toEqual(GOLDEN_TWO_RUN_PAINT);
  });
});

/**
 * Paint calls the two-run fixture above made before paint moved to the run
 * owner; recorded from the previous implementation.
 */
const GOLDEN_TWO_RUN_PAINT: PaintCall[] = [
  {
    kind: 'fill',
    text: 'red',
    x: -100,
    y: 5,
    globalAlpha: 1,
    fillStyle: 'rgb(255 0 0)',
    font: '500 10px Roboto',
  },
  {
    kind: 'fill',
    text: 'rest',
    x: -60,
    y: 5,
    globalAlpha: 1,
    fillStyle: '',
    font: '500 10px Roboto',
  },
];
