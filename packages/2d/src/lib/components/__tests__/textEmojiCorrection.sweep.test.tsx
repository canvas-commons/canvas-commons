import {clearCache, prepareWithSegments} from '@chenglou/pretext';
import {describe, expect, it, vi} from 'vitest';
import type {ParagraphShape} from '../../text/mixedParagraph';
import {prepareMixedParagraph} from '../../text/mixedParagraph';
import type {RunMetrics} from '../../text/paragraphContent';
import {buildParagraphContent} from '../../text/paragraphContent';
import {canvasParagraphMeasurer} from '../../text/preparedParagraph';
import {segment} from '../../text/segmenter';
import {mockDomTextWidth, mockTextContext} from './mockTextContext';

// Pretext keeps one measurement context for the life of the module, so a
// suite that needs a font of its own needs a file of its own.
const EMOJI = /\p{Extended_Pictographic}/u;
const CANVAS: RunMetrics = {font: '400 20px one', letterSpacing: 0};
const PUNCTUATION: RunMetrics = {font: '400 20px two', letterSpacing: 0};
const SHAPE: ParagraphShape = {
  whiteSpace: 'normal',
  wordBreak: 'normal',
  metrics: CANVAS,
};

let EmojiWidth = 24;
let DomMeasurements = 0;

describe('an emoji a canvas measures wider than the DOM', () => {
  mockTextContext(text => {
    let width = 0;
    for (const grapheme of segment(text, 'grapheme')) {
      width += EMOJI.test(grapheme.segment) ? EmojiWidth : 12;
    }
    return width;
  });
  mockDomTextWidth(text => {
    DomMeasurements++;
    return 20 * segment(text, 'grapheme').length;
  });

  it('corrects a refined piece the way it corrects a whole segment', () => {
    const text = '\u{1F600}!';
    const whole = prepareMixedParagraph(
      buildParagraphContent(
        [{kind: 'text', owner: 0, paint: 0, metrics: CANVAS, text}],
        'normal',
      ),
      SHAPE,
      canvasParagraphMeasurer,
    );
    const split = prepareMixedParagraph(
      buildParagraphContent(
        [
          {
            kind: 'text',
            owner: 0,
            paint: 0,
            metrics: CANVAS,
            text: '\u{1F600}',
          },
          {kind: 'text', owner: 1, paint: 1, metrics: PUNCTUATION, text: '!'},
        ],
        'normal',
      ),
      SHAPE,
      canvasParagraphMeasurer,
    );

    expect(whole.items.widths).toEqual([32]);
    expect(split.items.widths).toEqual([20, 12]);
    expect(split.items.joinsPrevious).toEqual([false, true]);
    expect(split.items.widths.reduce((sum, value) => sum + value, 0)).toBe(
      whole.items.widths[0],
    );
  });

  it('measures the DOM no more than pretext does across font sizes', () => {
    const sizes = [21, 22, 23, 24, 25];
    const measurementsOf = (run: () => void) => {
      const before = DomMeasurements;
      run();
      return DomMeasurements - before;
    };
    const ours = measurementsOf(() => {
      for (const size of sizes) {
        const emoji: RunMetrics = {font: `400 ${size}px one`, letterSpacing: 0};
        const mark: RunMetrics = {font: `400 ${size}px two`, letterSpacing: 0};
        prepareMixedParagraph(
          buildParagraphContent(
            [
              {
                kind: 'text',
                owner: 0,
                paint: 0,
                metrics: emoji,
                text: '\u{1F600}',
              },
              {kind: 'text', owner: 1, paint: 1, metrics: mark, text: '!'},
            ],
            'normal',
          ),
          {...SHAPE, metrics: emoji},
          canvasParagraphMeasurer,
        );
      }
    });
    clearCache();
    const theirs = measurementsOf(() => {
      for (const size of sizes) {
        for (const face of ['one', 'two']) {
          prepareWithSegments('\u{1F600}!', `400 ${size}px ${face}`);
        }
      }
    });

    expect(theirs).toBeGreaterThan(0);
    expect(ours).toBe(theirs);
  });

  it('forgets the corrections a font load invalidates', async () => {
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', {
      value: fonts,
      configurable: true,
    });
    vi.resetModules();
    // One module graph, so the font invalidation reaches the corrections the
    // measurements below read.
    await import('../../utils/fonts');
    const {prepareMixedParagraph: prepare} =
      await import('../../text/mixedParagraph');
    const {buildParagraphContent: content} =
      await import('../../text/paragraphContent');
    const {canvasParagraphMeasurer: measurer} =
      await import('../../text/preparedParagraph');

    const widthsOf = (runs: Parameters<typeof content>[0]) =>
      prepare(content(runs, 'normal'), SHAPE, measurer).items.widths.reduce(
        (sum, value) => sum + value,
        0,
      );
    const whole = () =>
      widthsOf([
        {kind: 'text', owner: 0, paint: 0, metrics: CANVAS, text: '\u{1F600}!'},
      ]);
    const split = () =>
      widthsOf([
        {kind: 'text', owner: 0, paint: 0, metrics: CANVAS, text: '\u{1F600}'},
        {kind: 'text', owner: 1, paint: 1, metrics: PUNCTUATION, text: '!'},
      ]);

    expect(whole()).toBe(32);
    expect(split()).toBe(32);

    // The face changes under the measurement context, as a font load does.
    EmojiWidth = 30;
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(whole()).toBe(32);
    expect(split()).toBe(32);

    EmojiWidth = 24;
    vi.resetModules();
  });
});
