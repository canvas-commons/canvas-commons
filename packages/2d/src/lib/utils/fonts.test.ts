import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

async function importFresh() {
  vi.resetModules();
  const core = await import('@canvas-commons/core');
  return {
    hasPromises: () => core.DependencyContext.hasPromises(),
    consumePromises: () => core.DependencyContext.consumePromises(),
    ...(await import('./fonts')),
  };
}

describe('requestFontLoad', () => {
  let loaded: () => void;
  const fonts = {
    addEventListener: vi.fn(),
    check: vi.fn(),
    load: vi.fn(),
  };

  beforeEach(() => {
    fonts.load.mockImplementation(
      () => new Promise<void>(resolve => (loaded = resolve)),
    );
    Object.defineProperty(document, 'fonts', {
      value: fonts,
      configurable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'fonts');
    vi.clearAllMocks();
  });

  test('makes the scene wait for a face that is not loaded', async () => {
    fonts.check.mockReturnValue(false);
    const {hasPromises, consumePromises, fontsVersion, requestFontLoad} =
      await importFresh();
    const version = fontsVersion();

    requestFontLoad('700 320px "JetBrains Mono"');
    expect(hasPromises()).toBe(true);

    const settled = vi.fn();
    const waiting = consumePromises().then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    loaded();
    await waiting;
    expect(fontsVersion()).toBe(version + 1);
  });

  test('does not wait for an available face', async () => {
    fonts.check.mockReturnValue(true);
    const {hasPromises, requestFontLoad} = await importFresh();

    requestFontLoad('16px monospace');
    expect(hasPromises()).toBe(false);
    expect(fonts.load).not.toHaveBeenCalled();
  });

  test('ignores an invalid font shorthand', async () => {
    fonts.check.mockImplementation(() => {
      throw new SyntaxError();
    });
    const {hasPromises, requestFontLoad} = await importFresh();

    expect(() => requestFontLoad('not a font')).not.toThrow();
    expect(hasPromises()).toBe(false);
  });
});
