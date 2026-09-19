import {Code} from '@canvas-commons/2d';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {FiddleHarness} from './harness-runtime';
import {createFiddleHighlighter} from './highlighter';
import type {HostToHarnessMessage} from './protocol';

describe('the fiddle harness frame', () => {
  const channel = new MessageChannel();
  const harness = new FiddleHarness();

  beforeAll(() => {
    harness.start();
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window.parent,
        ports: [channel.port1],
      }),
    );
  });

  afterAll(() => {
    harness.dispose();
    channel.port1.close();
    channel.port2.close();
  });

  it('letterboxes its canvas instead of stretching it', () => {
    const canvas = document.querySelector('canvas');
    expect(canvas?.style.getPropertyValue('object-fit')).toBe('contain');
  });

  it('installs a highlighter every Code node picks up', () => {
    expect(Code.defaultHighlighter).not.toBeNull();
  });

  it('updates the default palette when the host sends theme variables', () => {
    const previous = Code.defaultHighlighter;
    const variables = Object.fromEntries([['--cc-mauve', '#8839ef']]);
    channel.port1.onmessage?.(
      new MessageEvent<HostToHarnessMessage>('message', {
        data: {type: 'variables', variables},
      }),
    );
    const highlighter = Code.defaultHighlighter;
    expect(highlighter).not.toBe(previous);
    const cache = highlighter?.prepare('const value = 1;');
    expect(highlighter?.highlight(0, cache).color).toBe('#8839ef');
  });

  it('preserves a default highlighter supplied by scene code', () => {
    const custom = createFiddleHighlighter();
    Code.defaultHighlighter = custom;
    channel.port1.onmessage?.(
      new MessageEvent<HostToHarnessMessage>('message', {
        data: {type: 'variables', variables: {}},
      }),
    );
    expect(Code.defaultHighlighter).toBe(custom);
  });
});

describe('the fiddle preview highlighter', () => {
  it.each([
    ['const value = 42;', 'const', '#cba6f7'],
    ['const value = 42;', '42', '#fab387'],
    ['const value = "text";', '"text"', '#a6e3a1'],
    ['// comment', '//', '#9399b2'],
    ['function render() {}', 'render', '#89b4fa'],
    ['type Result = string;', 'Result', '#f9e2af'],
    ['const node = <Rect width={42} />;', 'width', '#f38ba8'],
  ])('highlights %s with the reference palette', (source, token, color) => {
    const highlighter = createFiddleHighlighter();
    const cache = highlighter.prepare(source);
    expect(highlighter.highlight(source.indexOf(token), cache).color).toBe(
      color,
    );
  });

  it('uses supplied theme colours and falls back for missing values', () => {
    const highlighter = createFiddleHighlighter(
      Object.fromEntries([
        ['--cc-mauve', ' #8839ef '],
        ['--cc-green', '#40a02b'],
        ['--cc-peach', ''],
      ]),
    );
    const source = 'const value = "text"; const count = 42;';
    const cache = highlighter.prepare(source);
    expect(highlighter.highlight(0, cache).color).toBe('#8839ef');
    expect(highlighter.highlight(source.indexOf('"text"'), cache).color).toBe(
      '#40a02b',
    );
    expect(highlighter.highlight(source.indexOf('42'), cache).color).toBe(
      '#fab387',
    );
  });
});
