import {describe, expect, test, vi} from 'vitest';
import {createComputed} from './createComputed';
import {createMotionStack} from './createMotionStack';
import {createSignal} from './createSignal';

function setup() {
  const stack = createMotionStack<
    string,
    {progress: ReturnType<typeof createSignal<number>>; delta: number}
  >();
  return {stack, first: createSignal(0), second: createSignal(0)};
}

describe('createMotionStack()', () => {
  test('A reader of a key sees entries pushed on that key only', () => {
    const {stack, first} = setup();
    stack.push('c', {progress: first, delta: 0});
    const read = vi.fn(() => stack.entries('a').map(entry => entry.delta));
    const a = createComputed(read);

    expect(a()).toEqual([]);

    stack.push('b', {progress: first, delta: 1});
    a();
    expect(read).toHaveBeenCalledTimes(1);

    stack.push('a', {progress: first, delta: 2});
    stack.push('a', {progress: first, delta: 3});
    expect(a()).toEqual([2, 3]);
  });

  test('Releasing a progress removes its entries on every key', () => {
    const {stack, first, second} = setup();
    stack.push('a', {progress: first, delta: 1});
    stack.push('a', {progress: second, delta: 2});
    stack.push('b', {progress: first, delta: 3});
    stack.push('b', {progress: second, delta: 4});

    stack.release(first);

    expect(stack.entries('a').map(entry => entry.delta)).toEqual([2]);
    expect(stack.entries('b').map(entry => entry.delta)).toEqual([4]);
  });

  test('A key with no entries left disappears', () => {
    const {stack, first, second} = setup();
    stack.push('a', {progress: first, delta: 1});
    stack.push('b', {progress: second, delta: 2});
    const hasA = createComputed(() => stack.has('a'));
    expect(hasA()).toBe(true);

    stack.release(first);

    expect(stack.keys()).toEqual(['b']);
    expect(stack.size()).toBe(1);
    expect(hasA()).toBe(false);
  });

  test('The call returned by push removes only that entry', () => {
    const {stack, first} = setup();
    const removeFirst = stack.push('a', {progress: first, delta: 1});
    stack.push('a', {progress: first, delta: 2});

    removeFirst();
    expect(stack.entries('a').map(entry => entry.delta)).toEqual([2]);
  });

  test('Disposing the stack clears every key', () => {
    const {stack, first} = setup();
    stack.push('a', {progress: first, delta: 1});
    stack.push('b', {progress: first, delta: 2});

    stack.dispose();

    expect(stack.size()).toBe(0);
    expect(stack.entries('a')).toEqual([]);
  });
});
