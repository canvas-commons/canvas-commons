import {describe, expect, it} from 'vitest';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {recordingTextContext} from './recordingTextContext';
import {add, lineTexts} from './sceneFixtures';

class Probe extends Txt {
  public probeDraw(context: CanvasRenderingContext2D) {
    this.draw(context);
  }
}

function painted(txt: Probe): string[] {
  const {calls, context} = recordingTextContext();
  txt.probeDraw(context);
  return calls.map(call => call.text);
}

describe('Txt non-string text values', () => {
  mockScene2D();
  mockTextContext();

  it('renders a number passed as text', () => {
    const txt = new Probe({
      fontSize: 10,
      lineHeight: 20,
      // @ts-expect-error untyped callers pass a number here
      text: 0,
    });
    add(txt);

    expect(txt.text()).toBe('0');
    expect(lineTexts(txt).join('\n')).toBe('0');
    expect(painted(txt)).toEqual(['0']);
  });

  it('renders a number in a span with its own font', () => {
    const txt = new Probe({
      fontSize: 10,
      lineHeight: 20,
      children: [
        // @ts-expect-error untyped callers pass a number here
        new Txt({text: 0, fontSize: 24}),
        new Txt({text: 'x'}),
      ],
    });
    add(txt);

    expect(txt.text()).toBe('0x');
    expect(lineTexts(txt).join('\n')).toBe('0x');
    expect(painted(txt)).toEqual(['0', 'x']);
  });

  it('renders a number returned by a reactive text', () => {
    const txt = new Probe({
      fontSize: 10,
      lineHeight: 20,
      // @ts-expect-error untyped callers pass a number here
      text: () => 0,
    });
    add(txt);

    expect(txt.text()).toBe('0');
    expect(lineTexts(txt).join('\n')).toBe('0');
    expect(painted(txt)).toEqual(['0']);
  });
});
