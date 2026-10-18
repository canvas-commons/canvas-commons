import {describe, expect, test, vi} from 'vitest';
import {createComputed} from './createComputed';
import {createSignalMap} from './createSignalMap';

describe('createSignalMap()', () => {
  test('A reader of one key reruns only when that key changes', () => {
    const map = createSignalMap<string, number>();
    map.set('a', 1).set('b', 1);
    const read = vi.fn(() => map.get('a'));
    const a = createComputed(read);

    expect(a()).toBe(1);

    map.set('b', 2);
    map.set('c', 3);
    map.delete('b');
    a();
    expect(read).toHaveBeenCalledTimes(1);

    map.set('a', 2);
    expect(a()).toBe(2);
    expect(read).toHaveBeenCalledTimes(2);
  });

  test('A reader of a missing key reruns when that key appears', () => {
    const map = createSignalMap<string, number>();
    map.set('c', 1);
    const read = vi.fn(() => map.has('a'));
    const hasA = createComputed(read);

    expect(hasA()).toBe(false);

    map.set('b', 1);
    hasA();
    expect(read).toHaveBeenCalledTimes(1);

    map.set('a', 1);
    expect(hasA()).toBe(true);

    map.delete('a');
    expect(hasA()).toBe(false);
    expect(read).toHaveBeenCalledTimes(3);
  });

  test('A reader of a deleted key sees no value while other keys remain', () => {
    const map = createSignalMap<string, number>();
    map.set('a', 1).set('b', 2);
    const a = createComputed(() => map.get('a'));
    expect(a()).toBe(1);

    map.delete('a');
    expect(a()).toBeUndefined();
  });

  test('Readers of a map that is empty again still see new keys', () => {
    const map = createSignalMap<string, number>();
    const a = createComputed(() => map.get('a'));
    const b = createComputed(() => map.get('b'));

    expect(a()).toBeUndefined();
    map.set('a', 1);
    expect(a()).toBe(1);
    expect(b()).toBeUndefined();

    map.delete('a');
    expect(a()).toBeUndefined();
    expect(b()).toBeUndefined();

    map.set('b', 2);
    expect(a()).toBeUndefined();
    expect(b()).toBe(2);
  });

  test('A reader of the keys reruns only when the key set changes', () => {
    const map = createSignalMap<string, number>();
    map.set('a', 1);
    const read = vi.fn(() => map.keys());
    const keys = createComputed(read);
    const size = createComputed(() => map.size());

    expect(keys()).toEqual(['a']);
    expect(size()).toBe(1);

    map.set('a', 2);
    keys();
    expect(read).toHaveBeenCalledTimes(1);

    map.set('b', 1);
    expect(keys()).toEqual(['a', 'b']);
    expect(size()).toBe(2);

    map.delete('a');
    expect(keys()).toEqual(['b']);
    expect(size()).toBe(1);
    expect(read).toHaveBeenCalledTimes(3);
  });

  test('A disposed map no longer reruns its readers', () => {
    const map = createSignalMap<string, number>();
    map.set('a', 1);
    const read = vi.fn(() => map.get('a'));
    const a = createComputed(read);
    a();

    map.dispose();
    map.set('a', 2);
    a();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
