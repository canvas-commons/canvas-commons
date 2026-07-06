import {SimpleSignal} from '@canvas-commons/core';
import {describe, expect, test, vi} from 'vitest';
import {Node, NodeProps} from '../components';
import {mockScene2D} from '../components/__tests__/mockScene2D';
import {compound} from '../decorators/compound';
import {initial, parser, signal} from '../decorators/signal';
import {partialProps, pickProps} from './pickProps';

interface FillableProps extends NodeProps {
  fill?: string;
}

class Fillable extends Node {
  @initial('white')
  @signal()
  declare public readonly fill: SimpleSignal<string>;

  public constructor(props: FillableProps = {}) {
    super(props);
  }
}

interface LanguageableProps extends NodeProps {
  language?: string;
  offset?: {x: number; y: number};
}

class Languageable extends Node {
  @initial('')
  @signal()
  declare public readonly language: SimpleSignal<string>;

  @initial({x: 0, y: 0})
  @parser((value: {x: number; y: number}) => value)
  @compound({x: 'offsetX', y: 'offsetY'})
  declare public readonly offset: {x: number; y: number};

  public constructor(props: LanguageableProps = {}) {
    super(props);
  }
}

describe('pickProps', () => {
  mockScene2D();

  test('picks declared props and compound sub-props, dropping the rest', () => {
    const merged = {
      fill: 'red',
      language: 'tsx',
      offsetX: 10,
      offsetY: 20,
      bogus: true,
    };

    expect(pickProps(Fillable, merged)).toEqual({fill: 'red'});
    expect(pickProps(Languageable, merged)).toEqual({
      language: 'tsx',
      offsetX: 10,
      offsetY: 20,
    });
  });

  test('is warning-free when spread into the class it was picked for', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const merged = {fill: 'red', language: 'tsx', bogus: true};

    new Fillable(pickProps(Fillable, merged));

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('accepts a named props interface without an index signature', () => {
    interface MergedProps extends FillableProps, LanguageableProps {}

    const merged: MergedProps = {fill: 'red', language: 'tsx'};

    expect(pickProps(Fillable, merged)).toEqual({fill: 'red'});
    expect(partialProps(['language'], merged)).toEqual({language: 'tsx'});
  });
});

describe('partialProps', () => {
  test('picks exactly the named keys', () => {
    const props = {fill: 'red', stroke: 'blue', x: 10};

    expect(partialProps(['fill', 'stroke'], props)).toEqual({
      fill: 'red',
      stroke: 'blue',
    });
  });
});
