import {describe, expect, test} from 'vitest';
import type {Sound} from '../scenes';
import {planLane} from './planLane';

function sound(settings: Partial<Sound> & {offset: number}): Sound {
  const rate = settings.playbackRate ?? 1;
  return {
    audio: 'test.mp3',
    realPlaybackRate: rate * Math.pow(2, (settings.detune ?? 0) / 1200),
    ...settings,
  };
}

describe('planLane()', () => {
  test('starts at the clock when the window already opened', () => {
    const plan = planLane(sound({offset: 10, start: 2, end: 5}), 12, 1, 20);
    expect(plan.begin).toBe(12);
    expect(plan.bufferOffset).toBe(4);
    expect(plan.end).toBe(13);
    expect(plan.endOffset).toBe(5);
  });

  test('waits for the window when the sound starts later', () => {
    const plan = planLane(sound({offset: 10, start: 2}), 5, 1, 20);
    expect(plan.begin).toBe(10);
    expect(plan.bufferOffset).toBe(2);
  });

  test('the rate scales with the playback speed', () => {
    const source = sound({offset: 10, start: 2, playbackRate: 2, detune: 1200});
    expect(source.realPlaybackRate).toBe(4);
    const plan = planLane(source, 12, 4, 20);
    expect(plan.rate).toBe(16);
    expect(plan.bufferOffset).toBe(10);
    expect(plan.end).toBe(14.5);
  });

  test('ends when the buffer runs out', () => {
    const plan = planLane(sound({offset: 10, start: 2}), 12, 1, 14);
    expect(plan.endOffset).toBe(14);
    expect(plan.end).toBe(22);
  });
});
