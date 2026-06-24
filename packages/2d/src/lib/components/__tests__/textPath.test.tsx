import {describe, expect, it} from 'vitest';
import {getPathProfile} from '../../curves/getPathProfile';
import {Line} from '../Line';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

describe('Txt path (headless)', () => {
  mockScene2D();

  it('resolves a string path to its arc length', () => {
    const txt = (<Txt textPath={'M 0 0 L 100 0'}>hi</Txt>) as Txt;
    expect(txt.pathArcLength()).toBeCloseTo(100, 5);
  });

  it('resolves a CurveProfile path', () => {
    const txt = (
      <Txt textPath={getPathProfile('M 0 0 L 0 50')}>hi</Txt>
    ) as Txt;
    expect(txt.pathArcLength()).toBeCloseTo(50, 5);
  });

  it('resolves a live Curve node sharing this transform', () => {
    const line = (
      <Line
        points={[
          [0, 0],
          [80, 0],
        ]}
      />
    ) as Line;
    const txt = (<Txt textPath={line}>hi</Txt>) as Txt;
    expect(txt.pathArcLength()).toBeCloseTo(line.arcLength(), 5);
  });

  it('sizes the node to the path bounding box', () => {
    const txt = (<Txt textPath={'M 0 0 L 100 0'}>hi</Txt>) as Txt;
    expect(txt.size().x).toBeCloseTo(100, 0);
    expect(txt.size().y).toBeCloseTo(0, 0);
  });

  it('defaults pathAlign to baseline and accepts edge anchors', () => {
    const txt = (<Txt textPath={'M 0 0 L 100 0'}>hi</Txt>) as Txt;
    expect(txt.pathAlign()).toBe('baseline');
    txt.pathAlign('top');
    expect(txt.pathAlign()).toBe('top');
  });

  it('defaults pathSplit to grapheme and accepts word', () => {
    const txt = (<Txt textPath={'M 0 0 L 100 0'}>hi</Txt>) as Txt;
    expect(txt.pathSplit()).toBe('grapheme');
    txt.pathSplit('word');
    expect(txt.pathSplit()).toBe('word');
  });

  it('disables split and unit queries under a path', () => {
    const txt = (<Txt textPath={'M 0 0 L 100 0'}>hello world</Txt>) as Txt;
    expect(txt.split('grapheme')).toEqual([]);
    expect(txt.textGlyphs()).toEqual([]);
    expect(txt.textWords()).toEqual([]);
    expect(txt.textSentences()).toEqual([]);
  });
});

describe('Txt path (geometry)', () => {
  mockScene2D();
  mockTextContext();

  it('forces a single line, collapsing embedded newlines', () => {
    const txt = (
      <Txt textPath={'M 0 0 L 1000 0'} width={50}>
        {'a\nb\nc'}
      </Txt>
    ) as Txt;
    expect(txt.lineCount()).toBe(1);
  });

  it('preserves glyph order and count along the path', () => {
    const txt = (<Txt textPath={'M 0 0 L 1000 0'}>abcde</Txt>) as Txt;
    expect(txt.text()).toBe('abcde');
    // The path forces one line wide enough to hold every glyph.
    expect(txt.lineCount()).toBe(1);
    expect(txt.textLines().lines[0].fragments[0].text).toBe('abcde');
  });
});
