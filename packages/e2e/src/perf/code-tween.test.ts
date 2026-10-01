import {Page} from 'playwright';
import {beforeAll, describe, expect, test} from 'vitest';
import {openScene} from '../helpers/render';

const SmallLineCount = 50;
const LargeLineCount = 400;
const WarmupSteps = 1;
const MeasuredSteps = 5;
const FirstFrame = 8;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Median render time of tween frames, stepped on a private canvas. */
async function measureSteppedRenderMs(lineCount: number): Promise<number> {
  const page: Page = await openScene(`perf-code-${lineCount}`);
  try {
    const durations = await page.evaluate(
      async ({first, warmup, steps}) => {
        const {player} = window.commons;
        const {playback} = player;
        await new Promise<void>(resolve => {
          const unsubscribe = player.onFrameChanged.subscribe(frame => {
            if (frame === first) {
              unsubscribe();
              resolve();
            }
          }, false);
          player.requestSeek(first);
        });

        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 270;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('No 2d context.');
        }

        const measured: number[] = [];
        for (let step = 0; step < warmup + steps; step++) {
          await playback.progress();
          const start = performance.now();
          await playback.currentScene.render(context);
          if (step >= warmup) {
            measured.push(performance.now() - start);
          }
        }
        return measured;
      },
      {first: FirstFrame, warmup: WarmupSteps, steps: MeasuredSteps},
    );
    return median(durations);
  } finally {
    await page.close();
  }
}

describe('code tween render cost', () => {
  let smallMs = 0;
  let largeMs = 0;

  beforeAll(async () => {
    smallMs = await measureSteppedRenderMs(SmallLineCount);
    largeMs = await measureSteppedRenderMs(LargeLineCount);
  }, 300000);

  test('a larger tween takes more time per frame', () => {
    expect(largeMs).toBeGreaterThan(smallMs);
  });

  // 8x the lines: linear growth gives 8, n^1.5 gives 22.6, quadratic gives 64.
  test('stepped tween render time grows well below n^1.5 with lines', () => {
    expect(largeMs / smallMs).toBeLessThan(14);
  });
});
