import {describe, expect, test} from 'vitest';
import {FramePacer} from './FramePacer';

function countDrawnFrames(fps: number, refreshRate: number, seconds: number) {
  const pacer = new FramePacer();
  let drawn = 0;
  for (let tick = 0; tick < refreshRate * seconds; tick++) {
    if (pacer.isDue((tick * 1000) / refreshRate, fps)) {
      drawn++;
    }
  }
  return drawn;
}

describe('FramePacer', () => {
  test.each([
    [10, 60],
    [24, 60],
    [30, 60],
    [60, 60],
    [24, 144],
    [30, 144],
    [60, 144],
    [25, 75],
  ])('draws %i fps on a %i Hz display', (fps, refreshRate) => {
    const seconds = 10;
    const drawn = countDrawnFrames(fps, refreshRate, seconds);
    expect(Math.abs(drawn - fps * seconds)).toBeLessThanOrEqual(1);
  });

  test('draws at the display rate when the target is faster', () => {
    expect(countDrawnFrames(120, 60, 10)).toBe(600);
  });

  test('draws within a few refreshes after raising the frame rate', () => {
    const pacer = new FramePacer();
    expect(pacer.isDue(0, 1)).toBe(true);
    const refreshes = [1, 2, 3].map(i => (i * 1000) / 60);
    expect(refreshes.some(time => pacer.isDue(time, 60))).toBe(true);
  });

  test('resumes without catch-up frames after a stall', () => {
    const pacer = new FramePacer();
    expect(pacer.isDue(0, 30)).toBe(true);
    expect(pacer.isDue(5000, 30)).toBe(true);
    expect(pacer.isDue(5000 + 1000 / 60, 30)).toBe(false);
    expect(pacer.isDue(5000 + 1000 / 30, 30)).toBe(true);
  });
});
