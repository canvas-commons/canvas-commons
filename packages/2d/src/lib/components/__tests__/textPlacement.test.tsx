import {describe, expect, it} from 'vitest';
import {Rect} from '../Rect';
import {TextUnit, Txt, TxtProps} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {recordingTextContext} from './recordingTextContext';

const CHAR_WIDTH = 10;

class DrawProbe extends Txt {
  public drawTo(context: CanvasRenderingContext2D) {
    this.draw(context);
  }
}

function lineWords(txt: Txt, lineIndex: number): TextUnit[] {
  return txt.textWords().filter(word => word.lineIndex === lineIndex);
}

/** Assert that two nodes broke the same words onto `lineIndex`. */
function expectSameWords(rich: Txt, plain: Txt, lineIndex: number): TextUnit[] {
  const richWords = lineWords(rich, lineIndex);
  const plainWords = lineWords(plain, lineIndex);
  expect(plainWords.length).toBeGreaterThan(0);
  expect(richWords.map(word => word.text)).toEqual(
    plainWords.map(word => word.text),
  );
  return plainWords;
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

    const plainWords = expectSameWords(rich, plain, 0);
    const richWords = lineWords(rich, 0);
    expectNoOverlap(plainWords);
    expectNoOverlap(richWords);

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

    const plainWords = expectSameWords(rich, plain, 0);
    const richWords = lineWords(rich, 0);
    expectNoOverlap(richWords);
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
      const plainWords = expectSameWords(rich, plain, line);
      const richWords = lineWords(rich, line);
      expectNoOverlap(richWords);
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
    const referenceRun = recordingTextContext();
    reference.drawTo(referenceRun.context);
    const referenceWord = lineWords(reference, 0)[0];
    // Paint origins and unit positions share a coordinate space up to this
    // offset; derive it instead of assuming one.
    const originToLeftEdge =
      referenceRun.calls[0].x - (referenceWord.x - referenceWord.width / 2);

    const txt = new DrawProbe({
      ...justified,
      children: [
        new Txt({text: 'aa bb ', fill: 'red'}),
        new Txt({text: 'cc dddddddddd'}),
      ],
    });
    const run = recordingTextContext();
    txt.drawTo(run.context);

    const words = txt.textWords();
    expect(words.length).toBeGreaterThan(0);
    expect(run.calls.map(call => call.text)).toEqual(
      words.map(word => word.text),
    );
    for (let i = 0; i < words.length; i++) {
      expect(run.calls[i].x - originToLeftEdge).toBeCloseTo(
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

  /** Left edge of each word, measured from the block's left edge. */
  function wordLefts(txt: Txt, lineIndex: number): number[] {
    const half = txt.width() / 2;
    return lineWords(txt, lineIndex).map(
      word => word.x - word.width / 2 + half,
    );
  }

  it('keeps single-run justification in place', () => {
    const txt = new Txt({...justified, text: 'aa bb cc dddddddddd'});
    // 'aa bb cc ' is 9 glyphs; the remaining width rides its 3 spaces.
    const slack = (140 - 9 * CHAR_WIDTH) / 3;
    expect(wordLefts(txt, 0)).toEqual(
      [0, 3 * CHAR_WIDTH + slack, 6 * CHAR_WIDTH + 2 * slack].map(x =>
        expect.closeTo(x, 2),
      ),
    );

    // 'aa bb cc dd ee' is exactly 140 wide, so justify adds nothing.
    const wide = new Txt({...justified, text: 'aa bb cc dd ee ffffffffff'});
    expect(wordLefts(wide, 0)).toEqual([0, 30, 60, 90, 120]);
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

    // The line occupies 'aa bb ' plus 'cc', 9 glyphs, and the words start
    // every third glyph inside it.
    const lineWidth = 9 * CHAR_WIDTH;
    const starts = [0, 3 * CHAR_WIDTH, 6 * CHAR_WIDTH];
    expect(wordLefts(center, 0)).toEqual(
      starts.map(x => x + (140 - lineWidth) / 2),
    );
    expect(wordLefts(right, 0)).toEqual(starts.map(x => x + 140 - lineWidth));
  });
});
