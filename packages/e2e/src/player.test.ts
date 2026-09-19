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

  test('paused prevents autoplay and resumes when removed', async () => {
    await page.evaluate(() => {
      const src = document.getElementById('player')?.getAttribute('src');
      if (!src) throw new Error('The player fixture has no source.');
      const player = document.createElement('canvas-commons-player');
      player.id = 'controlled-player';
      player.setAttribute('auto', 'true');
      player.setAttribute('paused', '');
      player.setAttribute('src', src);
      document.body.append(player);
    });

    try {
      await page.waitForFunction(() =>
        document
          .getElementById('controlled-player')
          ?.shadowRoot?.querySelector('.overlay')
          ?.classList.contains('state-ready'),
      );

      const initial = await page.evaluate(() => {
        const player = document.getElementById('controlled-player');
        const overlay = player?.shadowRoot?.querySelector('.overlay');
        const canvas = player?.shadowRoot?.querySelector('canvas.canvas');
        if (!player || !overlay || !(canvas instanceof HTMLCanvasElement)) {
          throw new Error('The controlled player has not loaded.');
        }
        const playing = overlay.classList.contains('playing');
        const frame = canvas.toDataURL();
        player.removeAttribute('paused');
        return {playing, frame};
      });
      expect(initial.playing).toBe(false);

      await page.waitForFunction(frame => {
        const player = document.getElementById('controlled-player');
        const canvas = player?.shadowRoot?.querySelector('canvas.canvas');
        return (
          player?.shadowRoot?.querySelector('.overlay.playing') &&
          canvas instanceof HTMLCanvasElement &&
          canvas.toDataURL() !== frame
        );
      }, initial.frame);

      const stopped = await page.evaluate(async () => {
        const player = document.getElementById('controlled-player');
        const canvas = player?.shadowRoot?.querySelector('canvas.canvas');
        if (!player || !(canvas instanceof HTMLCanvasElement)) {
          throw new Error('The controlled player has no canvas.');
        }
        player.setAttribute('paused', '');
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const frame = canvas.toDataURL();
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        return {
          stable: canvas.toDataURL() === frame,
          playing:
            player.shadowRoot
              ?.querySelector('.overlay')
              ?.classList.contains('playing') ?? false,
        };
      });
      expect(stopped).toEqual({stable: true, playing: false});
    } finally {
      await page.evaluate(() =>
        document.getElementById('controlled-player')?.remove(),
      );
    }
  });

  test('paused ignores a click on the overlay', async () => {
    await page.evaluate(() => {
      const src = document.getElementById('player')?.getAttribute('src');
      if (!src) throw new Error('The player fixture has no source.');
      const player = document.createElement('canvas-commons-player');
      player.id = 'clicked-player';
      player.setAttribute('paused', '');
      player.setAttribute('src', src);
      document.body.append(player);
    });

    try {
      await page.waitForFunction(() =>
        document
          .getElementById('clicked-player')
          ?.shadowRoot?.querySelector('.overlay')
          ?.classList.contains('state-ready'),
      );

      const clicked = await page.evaluate(() => {
        const shadow = document.getElementById('clicked-player')?.shadowRoot;
        const overlay = shadow?.querySelector('.overlay');
        const button = shadow?.querySelector('.button');
        if (!overlay || !button) {
          throw new Error('The clicked player has not loaded.');
        }
        overlay.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        return {
          playing: overlay.classList.contains('playing'),
          animations: button.getAnimations().length,
        };
      });

      expect(clicked).toEqual({playing: false, animations: 0});
    } finally {
      await page.evaluate(() =>
        document.getElementById('clicked-player')?.remove(),
      );
    }
  });
});
