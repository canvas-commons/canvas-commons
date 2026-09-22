import {createSignal} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import type {TextExclusion} from '../../partials/types';
import {Txt} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {add} from './sceneFixtures';

describe('Txt layout memo', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  it('lays out again when an exclusion moves inside its array', () => {
    const left = createSignal(0);
    const moving = {kind: 'rect' as const, x: 0, y: 0, width: 60, height: 80};
    const exclusions: TextExclusion[] = [moving];
    const txt = new Txt({
      fontSize: 16,
      lineHeight: 20,
      width: 120,
      textWrap: true,
      text: 'hello world here and more words to wrap',
      exclusions: () => {
        moving.x = left();
        return exclusions;
      },
    });
    add(txt);
    expect(txt.textLines().lines).toHaveLength(6);
    expect(txt.size().y).toBeCloseTo(120, 5);

    left(200);

    expect(txt.textLines().lines).toHaveLength(4);
    expect(txt.size().y).toBeCloseTo(80, 5);
  });
});
