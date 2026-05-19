import * as path from 'path';
import {Page} from 'playwright';
import {fileURLToPath} from 'url';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {newPage} from './app';

const ProjectPath = path
  .resolve(
    fileURLToPath(new URL('.', import.meta.url)),
    '../tests/projects/quickstart.ts',
  )
  .split(path.sep)
  .join('/');

describe('Player', () => {
  let page: Page;

  beforeAll(async () => {
    page = await newPage({path: '/player.html', waitFor: '#player'});
    const src = `/@fs/${ProjectPath}?project`;
    const setSrc = async () => {
      await page.waitForFunction(
        () => !!document.getElementById('player')?.shadowRoot,
      );
      await page.evaluate(value => {
        document.getElementById('player')!.setAttribute('src', value);
      }, src);
    };
    // Vite optimizing the project's deps the first time triggers a full
    // reload, which drops the dynamic `src`. Reassert it whenever the
    // page reloads so we don't lose the project mid-test.
    page.on('load', () => {
      setSrc().catch(() => {});
    });
    await setSrc();
  });

  afterAll(async () => {
    await page.close();
  });

  test('builds shadow DOM with player template', async () => {
    const shape = await page.evaluate(() => {
      const player = document.getElementById('player');
      const shadow = player!.shadowRoot!;
      const style = shadow.querySelector('style');
      return {
        mode: shadow.mode,
        styleLength: style?.textContent?.length ?? 0,
        hasHostStyle: style?.textContent?.includes(':host') ?? false,
        elements: {
          overlay: !!shadow.querySelector('.overlay'),
          button: !!shadow.querySelector('.button'),
          canvas: !!shadow.querySelector('canvas.canvas'),
          loader: !!shadow.querySelector('.loader'),
          message: !!shadow.querySelector('.message'),
        },
      };
    });

    expect(shape.mode).toBe('open');
    expect(shape.styleLength).toBeGreaterThan(0);
    expect(shape.hasHostStyle).toBe(true);
    expect(shape.elements).toEqual({
      overlay: true,
      button: true,
      canvas: true,
      loader: true,
      message: true,
    });
  });

  test('CSS does not leak across the shadow root boundary', async () => {
    const scoping = await page.evaluate(() => {
      const player = document.getElementById('player')!;
      const shadow = player.shadowRoot!;
      const shadowOverlay = shadow.querySelector('.overlay')!;
      const pageOverlay = document.getElementById('page-overlay')!;
      const pageButton = document.getElementById('page-button')!;
      return {
        pageOverlayBg: getComputedStyle(pageOverlay).backgroundColor,
        shadowOverlayBg: getComputedStyle(shadowOverlay).backgroundColor,
        pageButtonBg: getComputedStyle(pageButton).backgroundColor,
      };
    });

    // Page styles still apply to page elements
    expect(scoping.pageOverlayBg).toBe('rgb(255, 0, 0)');
    expect(scoping.pageButtonBg).toBe('rgb(0, 255, 0)');
    // Shadow .overlay gets the player's rgba(0, 0, 0, 0.54), not the page's red
    expect(scoping.shadowOverlayBg).toBe('rgba(0, 0, 0, 0.54)');
  });

  test('loads the project and reaches ready state', async () => {
    // Player drives state through the canvas className: state-initial,
    // state-loading, state-ready, state-error.
    await page.waitForFunction(
      () =>
        document
          .getElementById('player')
          ?.shadowRoot?.querySelector('canvas.canvas')
          ?.classList.contains('state-ready') ?? false,
      undefined,
      {timeout: 30000},
    );

    const status = await page.evaluate(() => {
      const canvas = document
        .getElementById('player')
        ?.shadowRoot?.querySelector(
          'canvas.canvas',
        ) as HTMLCanvasElement | null;
      return {
        hasCanvas: !!canvas,
        canvasWidth: canvas?.width ?? 0,
        canvasHeight: canvas?.height ?? 0,
        classes: canvas?.className ?? '',
      };
    });

    expect(status.hasCanvas).toBe(true);
    expect(status.classes).toContain('state-ready');
    expect(status.canvasWidth).toBeGreaterThan(0);
    expect(status.canvasHeight).toBeGreaterThan(0);
  });
});
