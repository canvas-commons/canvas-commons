import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Node} from '../Node';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {recordingTextContext} from './recordingTextContext';

class Probe extends Txt {
  public probeDraw(context: CanvasRenderingContext2D) {
    this.draw(context);
  }
}

function add(node: Node): void {
  useScene2D().getView().add(node);
}

function painted(txt: Probe): string[] {
  const {calls, context} = recordingTextContext();
  txt.probeDraw(context);
  return calls.map(call => call.text);
}

function lineText(txt: Txt): string {
  return txt
    .textLines()
    .lines.map(line => line.fragments.map(f => f.text).join(''))
    .join('\n');
}

describe('Txt non-string text values', () => {
  mockScene2D();
  mockTextContext();

  // A value the type system calls a string but that is a number at runtime,
  // as untyped callers supply.
  const zero: string = JSON.parse('0');

  it('renders a number passed as text', () => {
    const txt = new Probe({fontSize: 10, lineHeight: 20, text: zero});
    add(txt);

    expect(txt.text()).toBe('0');
    expect(lineText(txt)).toBe('0');
    expect(painted(txt)).toEqual(['0']);
  });

  it('renders a number in a span with its own font', () => {
    const txt = new Probe({
      fontSize: 10,
      lineHeight: 20,
      children: [new Txt({text: zero, fontSize: 24}), new Txt({text: 'x'})],
    });
    add(txt);

    expect(txt.text()).toBe('0x');
    expect(lineText(txt)).toBe('0x');
    expect(painted(txt)).toEqual(['0', 'x']);
  });

  it('renders a number returned by a reactive text', () => {
    const txt = new Probe({fontSize: 10, lineHeight: 20, text: () => zero});
    add(txt);

    expect(txt.text()).toBe('0');
    expect(lineText(txt)).toBe('0');
    expect(painted(txt)).toEqual(['0']);
  });
});
