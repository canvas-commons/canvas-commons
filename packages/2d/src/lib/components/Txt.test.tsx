import {
  createSignal,
  endPlayback,
  endScene,
  linear,
  startPlayback,
  startScene,
  waitFor,
} from '@canvas-commons/core';
import {describe, expect, it, vi} from 'vitest';
import {useScene2D} from '../scenes/useScene2D';
import {Txt} from './Txt';
import {TxtLeaf} from './TxtLeaf';
import {generatorTest} from './__tests__/generatorTest';
import {mockScene2D} from './__tests__/mockScene2D';

describe('Txt', () => {
  mockScene2D();

  it('awaits reactive text outside the scene context', async () => {
    const effect = createSignal('Blur');
    const node = new Txt({
      text: () => `Current Filter: ${effect()}`,
      children: 'fallback',
    });
    const scene = useScene2D();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    endPlayback(scene.playback);
    endScene(scene);
    try {
      await node.toPromise();
      expect(error).not.toHaveBeenCalled();
      expect(node.text()).toBe('Current Filter: Blur');
      const leaf = node.childAs<TxtLeaf>(0);
      expect(leaf).toBeInstanceOf(TxtLeaf);

      effect('Hue');
      await node.toPromise();
      expect(error).not.toHaveBeenCalled();
      expect(node.text()).toBe('Current Filter: Hue');
      expect(node.childAs(0)).toBe(leaf);
    } finally {
      startScene(scene);
      startPlayback(scene.playback);
      error.mockRestore();
    }
  });

  it.each([
    {text: undefined, expected: 'fallback'},
    {text: '', expected: ''},
    {text: 'explicit', expected: 'explicit'},
  ])('resolves text $text with children', ({text, expected}) => {
    const node = new Txt({text, children: 'fallback'});

    expect(node.text()).toBe(expected);
  });

  it('Handle plain text', () => {
    const node = (<Txt lineWidth={8}>test</Txt>) as Txt;

    const parseSpy = vi.spyOn(
      node as unknown as {parseChildren: () => unknown},
      'parseChildren',
    );
    const leaf = node.childAs<TxtLeaf>(0);

    expect(node.text()).toBe('test');
    expect(node.lineWidth()).toBe(8);
    expect(node.children().length).toBe(1);
    expect(leaf).toBeInstanceOf(TxtLeaf);
    expect(leaf!.text()).toBe('test');

    node.lineWidth(16);
    node.text('changed');

    expect(node.childAs(0)).toBe(leaf);
    expect(node.lineWidth()).toBe(16);
    expect(leaf!.text()).toBe('changed');

    // Parsing should not happen when operating exclusively on simple text
    expect(parseSpy).toHaveBeenCalledTimes(0);
  });

  it('Handle complex text', () => {
    const node = (
      <Txt lineWidth={8}>
        Apple <Txt>Banana</Txt> Cherry
      </Txt>
    ) as Txt;

    const first = node.childAs<TxtLeaf>(0);
    const second = node.childAs<Txt>(1);
    const third = node.childAs<TxtLeaf>(2);

    expect(node.text()).toBe('Apple Banana Cherry');
    expect(node.lineWidth()).toBe(8);
    expect(node.children().length).toBe(3);
    expect(first).toBeInstanceOf(TxtLeaf);
    expect(first!.text()).toBe('Apple ');

    expect(second).toBeInstanceOf(Txt);
    expect(second!.text()).toBe('Banana');
    expect(second!.lineWidth()).toBe(8);

    expect(third).toBeInstanceOf(TxtLeaf);
    expect(third!.text()).toBe(' Cherry');
  });

  it(
    'Tween complex to simple text',
    generatorTest(function* () {
      const node = (
        <Txt>
          <Txt>Apple</Txt> Banana
        </Txt>
      ) as Txt;

      yield node.text('Simple', 2, linear);
      yield* waitFor(1);

      const leaf = node.childAs<TxtLeaf>(0)!;

      expect(node.children().length).toBe(1);
      expect(node.text()).toBe('Apple Ban');
      expect(leaf.text()).toBe('Apple Ban');
    }),
  );
});
