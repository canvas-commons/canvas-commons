import type {PlacedLine} from '../../text';
import {Txt} from '../Txt';
import {TextState, mockTextContext} from './mockTextContext';
import {PaintCall, recordingTextContext} from './recordingTextContext';
import {fontSizeOf} from './sceneFixtures';

const REGULAR_RATIO = 0.5;
const BOLD_RATIO = 0.6;
const MONO_RATIO = 0.55;
const KERN_RATIO = 0.1;
const ASCENT_RATIO = 0.8;
const DESCENT_RATIO = 0.25;
/** Characters the fake font draws nothing for and spaces nothing after. */
const INVISIBLE = /[\u00ad\u200b\u2060]/g;

function faceRatio(font: string): number {
  if (font.includes('monospace')) return MONO_RATIO;
  return font.includes('700') ? BOLD_RATIO : REGULAR_RATIO;
}

/**
 * A fake font that scales with its size, gives bold a wider face than regular,
 * kerns an `AV` pair no mark stands between, gives a soft hyphen and the
 * zero-width marks no width of their own, and follows every glyph with the
 * letter spacing the context carries, as a canvas does.
 */
export function mockFontWidth(text: string, state: TextState): number {
  const size = fontSizeOf(state.font);
  const kerns = text.split('AV').length - 1;
  const glyphs = text.replace(INVISIBLE, '');
  const spacing = parseFloat(state.letterSpacing) || 0;
  return (
    glyphs.length * size * faceRatio(state.font) -
    kerns * size * KERN_RATIO +
    glyphs.length * spacing
  );
}

/** Font box metrics of the fake font, so a line has real vertical ink. */
export function mockFontBounds(state: TextState): {
  ascent: number;
  descent: number;
} {
  const size = fontSizeOf(state.font);
  return {ascent: size * ASCENT_RATIO, descent: size * DESCENT_RATIO};
}

/** Install the fake font for a suite. */
export function fakeFont(): void {
  mockTextContext(mockFontWidth, mockFontBounds);
}

export class DrawProbe extends Txt {
  public probeDraw(context: CanvasRenderingContext2D) {
    this.draw(context);
  }

  /** The placed lines, so a sweep can read the free segment of each one. */
  public probeLines(): readonly PlacedLine[] {
    return this.positionedLines();
  }
}

/** Every text fill a node paints, in draw order. */
export function fillCalls(txt: DrawProbe): PaintCall[] {
  const {calls, context} = recordingTextContext();
  txt.probeDraw(context);
  return calls.filter(call => call.kind === 'fill');
}

export const TEXTS: {name: string; text: string}[] = [
  {name: 'short-words', text: 'pack my box AV five dozen jugs now'},
  {
    name: 'long-word',
    text: 'short and supercalifragilisticexpialidocious after',
  },
  {
    name: 'soft-hyphens',
    text: 'un\u00adbreak\u00adable ex\u00adtra\u00adordi\u00adnary words',
  },
  {name: 'crlf', text: 'first here\r\nsecond there\rthird\u000cfourth'},
  {name: 'tabs', text: 'one\ttwo\tthree four AV five'},
  {name: 'space-runs', text: 'one  two   three AV  four'},
  {name: 'edge-space', text: '  leading and trailing AV  '},
  {name: 'punctuation', text: 'one, two; three. AV! four?'},
  {name: 'empty', text: ''},
];
