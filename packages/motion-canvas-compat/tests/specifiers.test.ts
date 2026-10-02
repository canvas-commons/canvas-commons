import {describe, expect, it} from 'vitest';
import {getShimName, mapSpecifier} from '../src/specifiers';

describe('mapSpecifier', () => {
  it.each([
    ['@motion-canvas/core', '@canvas-commons/core'],
    ['@motion-canvas/core/lib/utils/Random', '@canvas-commons/core'],
    ['@motion-canvas/core/lib/utils/Random.js', '@canvas-commons/core'],
    ['@motion-canvas/core/lib/utils/index.js', '@canvas-commons/core'],
    ['@motion-canvas/core/lib', '@canvas-commons/core'],
    [
      '@motion-canvas/core/shaders/a.glsl',
      '@canvas-commons/core/shaders/a.glsl',
    ],
    ['@motion-canvas/core/project', '@canvas-commons/core/project'],
    ['@motion-canvas/2d/lib/jsx-runtime', '@canvas-commons/2d/jsx-runtime'],
    ['@motion-canvas/2d/lib/jsx-runtime.js', '@canvas-commons/2d/jsx-runtime'],
    [
      '@motion-canvas/2d/lib/jsx-dev-runtime',
      '@canvas-commons/2d/jsx-dev-runtime',
    ],
    ['@motion-canvas/2d/editor', '@canvas-commons/2d/editor'],
    ['@motion-canvas/ui/dist/style.css', '@canvas-commons/editor/style.css'],
    ['@motion-canvas/ffmpeg/lib/server', '@canvas-commons/ffmpeg/server'],
    [
      '@motion-canvas/ffmpeg/lib/client/index.js',
      '@canvas-commons/ffmpeg/client',
    ],
    ['@motion-canvas/player', '@canvas-commons/player'],
    ['@motion-canvas/vite-plugin', '@canvas-commons/vite-plugin'],
  ])('maps %s to %s', (source, target) => {
    expect(mapSpecifier(source)).toBe(target);
  });

  it.each([
    ['@motion-canvas/2d', '2d'],
    ['@motion-canvas/2d/lib/components/Rect', '2d'],
    ['@motion-canvas/2d/lib/utils/diff.js', '2d'],
    ['@motion-canvas/2d/lib/components/index.js', '2d'],
    ['@motion-canvas/core/lib/plugin/DefaultPlugin', 'default-plugin'],
    ['@motion-canvas/core/lib/plugin/DefaultPlugin.js', 'default-plugin'],
    ['@motion-canvas/ui', 'editor'],
  ])('serves %s from the %s shim', (source, shim) => {
    const target = mapSpecifier(source);
    expect(target && getShimName(target)).toBe(shim);
  });

  it('keeps the query string', () => {
    expect(mapSpecifier('@motion-canvas/core?v=abc')).toBe(
      '@canvas-commons/core?v=abc',
    );
    const shim = mapSpecifier('@motion-canvas/2d?v=abc');
    expect(shim && getShimName(shim)).toBe('2d');
  });

  it.each([
    '@canvas-commons/core',
    'lodash',
    './@motion-canvas/core',
    '@motion-canvasx/core',
  ])('ignores %s', source => {
    expect(mapSpecifier(source)).toBeNull();
  });

  it.each([
    '@motion-canvas/2d/lib/components/CodeBlock',
    '@motion-canvas/2d/lib/components/CodeBlock.js',
    '@motion-canvas/2d/lib/components/CodeBlock?v=1',
  ])('rejects %s and points to the guide', source => {
    expect(() => mapSpecifier(source)).toThrow(/Code.*migration/s);
  });

  it.each([
    '@motion-canvas/unknown',
    '@motion-canvas/core/unknown',
    '@motion-canvas/2d/src/lib',
    '@motion-canvas/ui/dist/main.js',
  ])('rejects %s without falling through to Motion Canvas', source => {
    expect(() => mapSpecifier(source)).toThrow(
      new RegExp(`"${source}".*second engine`, 's'),
    );
  });
});
