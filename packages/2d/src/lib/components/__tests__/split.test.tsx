import {Color} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

describe('Txt.split (headless)', () => {
  mockScene2D();

  it('returns no pieces without a 2D canvas', () => {
    const txt = (<Txt>hello</Txt>) as Txt;
    expect(txt.split('grapheme')).toEqual([]);
  });
});

// Geometry needs real widths; shim canvas the way the text-unit geometry
// tests do (every glyph measures 10px), so split's positions are deterministic.
describe('Txt.split (geometry)', () => {
  mockScene2D();

  const charWidth = 10;
  mockTextContext(charWidth);

  it('emits one unparented Txt per grapheme at the source position', () => {
    const txt = (<Txt fontSize={10}>abc</Txt>) as Txt;
    const glyphs = txt.textGlyphs();
    const pieces = txt.split('grapheme');

    expect(pieces.map(p => p.text())).toEqual(['a', 'b', 'c']);
    pieces.forEach((piece, i) => {
      expect(piece.parent()).toBeNull();
      // No kerning in the mock, so the kern-invariant pen recipe collapses to
      // the glyph's center — the piece lands exactly on the queried unit.
      expect(piece.position.x()).toBeCloseTo(glyphs[i].x, 5);
      expect(piece.position.y()).toBeCloseTo(glyphs[i].y, 5);
    });
  });

  it('keeps punctuation as its own piece under word granularity', () => {
    const txt = (<Txt fontSize={10}>hi, bye.</Txt>) as Txt;
    // textWords drops punctuation; split must not lose ink.
    expect(txt.textWords().map(w => w.text)).toEqual(['hi', 'bye']);
    expect(txt.split('word').map(p => p.text())).toEqual([
      'hi',
      ',',
      'bye',
      '.',
    ]);
  });

  it('carries each run’s own fill', () => {
    const txt = (
      <Txt fontSize={10} fill={'#ff0000'}>
        a<Txt fill={'#0000ff'}>b</Txt>
      </Txt>
    ) as Txt;
    const pieces = txt.split('grapheme');
    const fillHex = (piece: Txt) => {
      const fill = piece.fill();
      return fill instanceof Color ? fill.hex() : null;
    };
    expect(pieces.map(p => p.text())).toEqual(['a', 'b']);
    expect(fillHex(pieces[0])).toBe('#ff0000');
    expect(fillHex(pieces[1])).toBe('#0000ff');
  });

  it('produces single-line, non-wrapping pieces sized to their text', () => {
    const txt = (<Txt fontSize={10}>ab</Txt>) as Txt;
    const [piece] = txt.split('word');
    expect(piece.text()).toBe('ab');
    expect(piece.textWrap()).toBe(false);
    expect(piece.size.x()).toBeCloseTo(2 * charWidth, 5);
  });
});
