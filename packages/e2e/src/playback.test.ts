import {Page} from 'playwright';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'vitest';
import {openScene} from './helpers/render';

interface PlayThrough {
  duration: number;
  maxFrame: number;
  firstPlayedFrame: number[];
  cachedFirstFrame: number[];
}

interface RestAfterSeek {
  duration: number;
  frame: number;
  unrequestedRenders: number;
}

function savedSpeed(project: string, speed: number): Record<string, string> {
  return {[`${project}/player`]: JSON.stringify({speed})};
}

type Rgba = [number, number, number, number];

async function playThrough(page: Page): Promise<PlayThrough> {
  return page.evaluate(async () => {
    const {player} = window.commons;
    const scenes = player.playback.onScenesRecalculated.current;
    const firstPlayedFrame = scenes.map(() => -1);
    let maxFrame = 0;

    const unsubscribeFrame = player.onFrameChanged.subscribe(frame => {
      maxFrame = Math.max(maxFrame, frame);
    }, false);
    const unsubscribeRender = player.onRender.subscribe(async () => {
      const index = scenes.indexOf(player.playback.currentScene);
      if (index >= 0 && firstPlayedFrame[index] < 0) {
        firstPlayedFrame[index] = player.playback.frame;
      }
    });
    const waitForPaused = (paused: boolean) =>
      new Promise<void>(resolve => {
        const unsubscribe = player.onStateChanged.subscribe(state => {
          if (state.paused === paused) {
            unsubscribe();
            resolve();
          }
        }, false);
      });

    const playing = waitForPaused(false);
    player.toggleLoop(false);
    player.requestSeek(0);
    player.togglePlayback(true);
    await playing;
    await waitForPaused(true);

    unsubscribeFrame();
    unsubscribeRender();
    return {
      duration: player.playback.duration,
      maxFrame,
      firstPlayedFrame,
      cachedFirstFrame: scenes.map(scene => scene.firstFrame),
    };
  });
}

/** Resolves with the frame of the first render completed after the request. */
async function seekTo(page: Page, frame: number): Promise<number> {
  return page.evaluate(
    target =>
      new Promise<number>(resolve => {
        const {player} = window.commons;
        const unsubscribe = player.onFrameChanged.subscribe(current => {
          unsubscribe();
          resolve(current);
        }, false);
        player.requestSeek(target);
      }),
    frame,
  );
}

/** Resolves after the recalculation for the new speed has rendered. */
async function setPlaybackSpeed(page: Page, speed: number): Promise<void> {
  await page.evaluate(
    value =>
      new Promise<void>(resolve => {
        const {player} = window.commons;
        const unsubscribe = player.onFrameChanged.subscribe(() => {
          unsubscribe();
          resolve();
        }, false);
        player.setSpeed(value);
      }),
    speed,
  );
}

/** Counts renders over ten display frames, without requesting any. */
async function countUnrequestedRenders(
  page: Page,
  variables?: Record<string, unknown>,
): Promise<number> {
  return page.evaluate(async variables => {
    const {player} = window.commons;
    let renders = 0;
    const unsubscribe = player.onRender.subscribe(async () => {
      renders++;
    });
    if (variables) {
      player.setVariables(variables);
    }
    for (let frame = 0; frame < 10; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    unsubscribe();
    return renders;
  }, variables);
}

/**
 * Requests two renders in turn. The player runs one render at a time, so when
 * the second starts the stage has finished painting the first.
 */
async function settleRender(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const {player} = window.commons;
    for (let request = 0; request < 2; request++) {
      await new Promise<void>(resolve => {
        const unsubscribe = player.onRender.subscribe(async () => {
          unsubscribe();
          resolve();
        });
        player.requestRender();
      });
    }
  });
}

async function seekToEndAndRest(page: Page): Promise<RestAfterSeek> {
  const duration = await page.evaluate(
    () => window.commons.player.playback.duration,
  );
  const frame = await seekTo(page, duration);
  return {
    duration,
    frame,
    unrequestedRenders: await countUnrequestedRenders(page),
  };
}

async function readStagePixel(
  page: Page,
  fractionX = 0.5,
  fractionY = 0.5,
): Promise<Rgba> {
  return page.evaluate(
    ([fractionX, fractionY]) => {
      const {size, resolutionScale} =
        window.commons.meta.getFullPreviewSettings();
      const width = size.width * resolutionScale;
      const height = size.height * resolutionScale;
      const stage = Array.from(document.querySelectorAll('canvas')).find(
        canvas =>
          Math.abs(canvas.width - width) < 1 &&
          Math.abs(canvas.height - height) < 1,
      );
      const context = stage?.getContext('2d');
      if (!stage || !context) {
        throw new Error('The preview canvas was not found.');
      }
      const {data} = context.getImageData(
        Math.floor(stage.width * fractionX),
        Math.floor(stage.height * fractionY),
        1,
        1,
      );
      return [data[0], data[1], data[2], data[3]];
    },
    [fractionX, fractionY],
  );
}

async function readSceneProgress(
  page: Page,
): Promise<{tween: number; elapsed: number}> {
  const [tween] = await readStagePixel(page, 0.5, 0.25);
  const [elapsed] = await readStagePixel(page, 0.5, 0.75);
  return {tween, elapsed};
}

function isColor(pixel: Rgba, expected: 'red' | 'blue'): boolean {
  const [r, , b, a] = pixel;
  const strong = expected === 'red' ? r : b;
  const weak = expected === 'red' ? b : r;
  return a === 255 && strong > 200 && weak < 60;
}

describe('playback through scene boundaries', () => {
  let page: Page;

  afterEach(async () => {
    await page?.close();
  });

  test('play reaches the end of a project without empty scenes', async () => {
    page = await openScene('empty-control');
    const result = await playThrough(page);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.maxFrame).toBe(result.duration);
    expect(result.firstPlayedFrame[1]).toBeGreaterThanOrEqual(0);
  });

  test('a transition starts on the frame its scene says it starts', async () => {
    page = await openScene('transition-control');
    const result = await playThrough(page);
    expect(result.firstPlayedFrame[1]).toBeGreaterThan(0);
    expect(result.firstPlayedFrame[1]).toBe(result.cachedFirstFrame[1]);
  });
});

describe('playback through scene boundaries (defects)', () => {
  const projects = ['empty-middle', 'empty-first', 'first-step-finish'];
  const pages = new Map<string, Page>();

  beforeAll(async () => {
    for (const project of projects) {
      pages.set(project, await openScene(project));
    }
  }, 120000);

  afterAll(async () => {
    await Promise.all([...pages.values()].map(page => page.close()));
  });

  function pageOf(project: string): Page {
    const page = pages.get(project);
    if (!page) {
      throw new Error(`${project} was not opened.`);
    }
    return page;
  }

  test('play continues through an empty middle scene', async () => {
    const result = await playThrough(pageOf('empty-middle'));
    expect(result.maxFrame).toBe(result.duration);
    expect(result.firstPlayedFrame[2]).toBeGreaterThanOrEqual(0);
  });

  test('play continues after an empty first scene', async () => {
    const result = await playThrough(pageOf('empty-first'));
    expect(result.maxFrame).toBe(result.duration);
    expect(result.firstPlayedFrame[1]).toBeGreaterThanOrEqual(0);
  });

  test('a scene after a first-step finish starts where the timeline says', async () => {
    const result = await playThrough(pageOf('first-step-finish'));
    expect(result.firstPlayedFrame[1]).toBeGreaterThanOrEqual(0);
    expect(result.firstPlayedFrame[1]).toBe(result.cachedFirstFrame[1]);
  });
});

describe('player state and rendering', () => {
  let page: Page;

  afterEach(async () => {
    await page?.close();
  });

  describe('saved speed', () => {
    beforeEach(async () => {
      page = await openScene('var-color', {
        localStorage: savedSpeed('var-color', 2),
      });
    });

    test('a saved player speed is stored in the player state', async () => {
      const state = await page.evaluate(
        () => window.commons.player.onStateChanged.current,
      );
      expect(state.speed).toBe(2);
    });

    test('a saved player speed is applied to playback', async () => {
      const playbackSpeed = await page.evaluate(
        () => window.commons.player.playback.speed,
      );
      expect(playbackSpeed).toBe(2);
    });
  });

  describe('odd-length scene', () => {
    beforeEach(async () => {
      page = await openScene('odd-length');
    });

    test('rests after a seek to its end at normal speed', async () => {
      const result = await seekToEndAndRest(page);
      expect(result.duration % 2).toBe(1);
      expect(result.frame).toBe(result.duration);
      expect(result.unrequestedRenders).toBe(0);
    });

    test.fails('rests after a seek to its end at double speed', async () => {
      await setPlaybackSpeed(page, 2);
      const result = await seekToEndAndRest(page);
      expect(result.frame).toBe(result.duration);
      expect(result.unrequestedRenders).toBe(0);
    });

    test.fails('a seek at double speed shows the requested frame', async () => {
      const target = 5;
      await seekTo(page, target);
      const expected = await readSceneProgress(page);

      await setPlaybackSpeed(page, 2);
      await seekTo(page, 0);
      expect(await seekTo(page, target)).toBe(target);
      const actual = await readSceneProgress(page);
      expect(Math.abs(actual.tween - expected.tween)).toBeLessThanOrEqual(1);
      expect(Math.abs(actual.elapsed - expected.elapsed)).toBeLessThanOrEqual(
        1,
      );
    });
  });

  describe('paused preview', () => {
    beforeEach(async () => {
      page = await openScene('var-color');
      await settleRender(page);
      expect(isColor(await readStagePixel(page), 'red')).toBe(true);
    });

    test('repaints new variables after a requested render', async () => {
      await page.evaluate(() => {
        const {player} = window.commons;
        player.setVariables({color: 'blue'});
        player.requestRender();
      });
      await settleRender(page);
      expect(isColor(await readStagePixel(page), 'blue')).toBe(true);
    });

    test.fails('repaints when variables change', async () => {
      expect(
        await countUnrequestedRenders(page, {color: 'blue'}),
      ).toBeGreaterThan(0);
      await settleRender(page);
      expect(isColor(await readStagePixel(page), 'blue')).toBe(true);
    });
  });
});
