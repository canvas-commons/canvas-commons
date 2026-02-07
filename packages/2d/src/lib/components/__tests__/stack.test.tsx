import {createRef} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {is} from '../../utils';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {HStack, VStack} from '../Stack';
import {mockScene2D} from './mockScene2D';

describe('Stack', () => {
  mockScene2D();

  describe('VStack', () => {
    it('Creates a column layout', () => {
      const view = useScene2D().getView();
      const stack = createRef<VStack>();

      view.add(
        <VStack ref={stack}>
          <Rect size={50} />
        </VStack>,
      );

      expect(stack().direction()).toBe('column');
      expect(stack().layoutEnabled()).toBe(true);
    });

    it('Accepts layout props like gap and padding', () => {
      const view = useScene2D().getView();
      const stack = createRef<VStack>();

      view.add(<VStack ref={stack} gap={10} padding={20} />);

      expect(stack().gap.x()).toBe(10);
      expect(stack().padding.top()).toBe(20);
    });

    it('Is an instance of Layout', () => {
      const view = useScene2D().getView();
      const stack = createRef<VStack>();

      view.add(<VStack ref={stack} />);

      expect(stack()).toBeInstanceOf(Layout);
    });

    it('Can be queried with is(VStack)', () => {
      const view = useScene2D().getView();
      const stack = createRef<VStack>();

      view.add(
        <>
          <Layout layout />
          <VStack ref={stack} />
          <HStack />
        </>,
      );

      const results = view.findAll(is(VStack));
      expect(results.length).toBe(1);
      expect(results[0]).toBe(stack());
    });
  });

  describe('HStack', () => {
    it('Creates a row layout', () => {
      const view = useScene2D().getView();
      const stack = createRef<HStack>();

      view.add(
        <HStack ref={stack}>
          <Rect size={50} />
        </HStack>,
      );

      expect(stack().direction()).toBe('row');
      expect(stack().layoutEnabled()).toBe(true);
    });

    it('Is an instance of Layout', () => {
      const view = useScene2D().getView();
      const stack = createRef<HStack>();

      view.add(<HStack ref={stack} />);

      expect(stack()).toBeInstanceOf(Layout);
    });

    it('Can be queried with is(HStack)', () => {
      const view = useScene2D().getView();
      const stack = createRef<HStack>();

      view.add(
        <>
          <Layout layout />
          <HStack ref={stack} />
          <VStack />
        </>,
      );

      const results = view.findAll(is(HStack));
      expect(results.length).toBe(1);
      expect(results[0]).toBe(stack());
    });
  });
});
