import {describe, expect, it} from 'vitest';
import {Rect} from '../Rect';
import {TextUnit, Txt, TxtProps} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

const CHAR_WIDTH = 10;

class DrawProbe extends Txt {
  public drawTo(context: CanvasRenderingContext2D) {
    this.draw(context);
  }
}

/**
 * Canvas stand-in that records the origin of every painted run. Measurement
 * matches {@link mockTextContext} so the recorded geometry is comparable.
 */
function recordingContext(): {
  context: CanvasRenderingContext2D;
  painted: {text: string; x: number; y: number}[];
} {
  const painted: {text: string; x: number; y: number}[] = [];
  const context = {
    font: '',
    letterSpacing: '0px',
    direction: 'inherit' as CanvasDirection,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    lineDashOffset: 0,
    globalAlpha: 1,
    save() {},
    restore() {},
    setLineDash() {},
    transform() {},
    setTransform() {},
    beginPath() {},
    measureText(text: string) {
      return {width: text.length * CHAR_WIDTH} as TextMetrics;
    },
    fillText(text: string, x: number, y: number) {
      painted.push({text, x, y});
    },
    strokeText() {},
  } as unknown as CanvasRenderingContext2D;
  return {context, painted};
}

function lineWords(txt: Txt, lineIndex: number): TextUnit[] {
  return txt.textWords().filter(word => word.lineIndex === lineIndex);
}

function expectNoOverlap(words: TextUnit[]) {
  for (let i = 1; i < words.length; i++) {
    const previousRight = words[i - 1].x + words[i - 1].width / 2;
    const left = words[i].x - words[i].width / 2;
    expect(left).toBeGreaterThanOrEqual(previousRight - 0.01);
  }
}

describe('Txt placement', () => {
  mockScene2D();
  mockTextContext(CHAR_WIDTH);

  const justified: TxtProps = {
    width: 140,
    fontSize: 10,
    lineHeight: 20,
    textAlign: 'justify',
  };

  it('places styled spans of a justified line like one run', () => {
    const plain = new Txt({...justified, text: 'aa bb cc dddddddddd'});
    const rich = new Txt({
      ...justified,
      children: [
        new Txt({text: 'aa bb ', fill: 'red'}),
        new Txt({text: 'cc dddddddddd'}),
      ],
    });

    const plainWords = lineWords(plain, 0);
    const richWords = lineWords(rich, 0);
    expectNoOverlap(plainWords);
    expectNoOverlap(richWords);

    expect(richWords.map(word => word.text)).toEqual(
      plainWords.map(word => word.text),
    );
    for (let i = 0; i < richWords.length; i++) {
      expect(richWords[i].x).toBeCloseTo(plainWords[i].x, 2);
    }
  });

  it('places three spans of a justified line like one run', () => {
    const plain = new Txt({...justified, text: 'aa bb cc dddddddddd'});
    const rich = new Txt({
      ...justified,
      children: [
        new Txt({text: 'aa '}),
        new Txt({text: 'bb '}),
        new Txt({text: 'cc dddddddddd'}),
      ],
    });

    const richWords = lineWords(rich, 0);
    expectNoOverlap(richWords);
    const plainWords = lineWords(plain, 0);
    for (let i = 0; i < richWords.length; i++) {
      expect(richWords[i].x).toBeCloseTo(plainWords[i].x, 2);
    }
  });

  it('places a span that starts mid-line and ends on a later line', () => {
    const plain = new Txt({
      ...justified,
      text: 'aa bb cc dddddddddd eeee',
    });
    const rich = new Txt({
      ...justified,
      children: [
        new Txt({text: 'aa '}),
        new Txt({text: 'bb cc dddddddddd eeee'}),
      ],
    });

    expect(rich.textLines().lines).toHaveLength(3);
    for (let line = 0; line < 3; line++) {
      const richWords = lineWords(rich, line);
      const plainWords = lineWords(plain, line);
      expectNoOverlap(richWords);
      expect(richWords.map(word => word.text)).toEqual(
        plainWords.map(word => word.text),
      );
      for (let i = 0; i < richWords.length; i++) {
        expect(richWords[i].x).toBeCloseTo(plainWords[i].x, 2);
      }
    }
  });

  it('paints every word where the query reports it', () => {
    const reference = new DrawProbe({
      width: 140,
      fontSize: 10,
      lineHeight: 20,
      textAlign: 'left',
      text: 'aa bb',
    });
    const referenceRun = recordingContext();
    reference.drawTo(referenceRun.context);
    const referenceWord = lineWords(reference, 0)[0];
    // Paint origins and unit positions share a coordinate space up to this
    // offset; derive it instead of assuming one.
    const originToLeftEdge =
      referenceRun.painted[0].x - (referenceWord.x - referenceWord.width / 2);

    const txt = new DrawProbe({
      ...justified,
      children: [
        new Txt({text: 'aa bb ', fill: 'red'}),
        new Txt({text: 'cc dddddddddd'}),
      ],
    });
    const run = recordingContext();
    txt.drawTo(run.context);

    const words = txt.textWords();
    expect(run.painted.map(call => call.text)).toEqual(
      words.map(word => word.text),
    );
    for (let i = 0; i < words.length; i++) {
      expect(run.painted[i].x - originToLeftEdge).toBeCloseTo(
        words[i].x - words[i].width / 2,
        2,
      );
    }
  });

  it('moves an inline child that follows justified words', () => {
    const rect = new Rect({width: 20, height: 10});
    const txt = new Txt({
      ...justified,
      children: [
        new Txt({text: 'aa bb '}),
        rect,
        new Txt({text: ' dddddddddd'}),
      ],
    });

    const words = lineWords(txt, 0);
    const lastWord = words[words.length - 1];
    const slotLeft = rect.position.x() - rect.width() / 2;
    expect(slotLeft).toBeGreaterThanOrEqual(lastWord.x + lastWord.width / 2);
    // The slot is the last thing on a justified line, so it ends at the box.
    expect(slotLeft + rect.width()).toBeCloseTo(txt.width() / 2, 2);
  });

  it('keeps single-run justification in place', () => {
    const txt = new Txt({...justified, text: 'aa bb cc dddddddddd'});
    expect(lineWords(txt, 0).map(word => word.x)).toEqual([
      -60,
      expect.closeTo(-13.333, 2),
      expect.closeTo(33.333, 2),
    ]);

    const wide = new Txt({...justified, text: 'aa bb cc dd ee ffffffffff'});
    expect(lineWords(wide, 0).map(word => word.x)).toEqual([
      -60, -30, 0, 30, 60,
    ]);
  });

  it('keeps center and right alignment of multi-span lines in place', () => {
    const spans = () => [
      new Txt({text: 'aa bb ', fill: 'red'}),
      new Txt({text: 'cc dddddddddd'}),
    ];
    const center = new Txt({
      ...justified,
      textAlign: 'center',
      children: spans(),
    });
    const right = new Txt({
      ...justified,
      textAlign: 'right',
      children: spans(),
    });

    expect(lineWords(center, 0).map(word => word.x)).toEqual([-35, -5, 25]);
    expect(lineWords(right, 0).map(word => word.x)).toEqual([-10, 20, 50]);
  });
});
