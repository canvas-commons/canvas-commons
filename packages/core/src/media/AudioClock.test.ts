import {describe, expect, test} from 'vitest';
import {AudioClock, type ClockSource} from './AudioClock';

interface Fake {
  clock: AudioClock;
  advance: (seconds: number) => void;
  setKind: (kind: string) => void;
}

function fake(kind = 'device', value = 0): Fake {
  const source: ClockSource = {kind: () => kind, now: () => value};
  return {
    clock: new AudioClock(source),
    advance: (seconds: number) => {
      value += seconds;
    },
    setKind: (next: string) => {
      kind = next;
    },
  };
}

describe('AudioClock', () => {
  test('advances at the configured speed', () => {
    const {clock, advance} = fake();
    clock.setSpeed(4);
    clock.resume();
    advance(1);
    expect(clock.getTime()).toBe(4);
    advance(1);
    expect(clock.getTime()).toBe(8);
  });

  test('keeps the time continuous when the speed changes', () => {
    const {clock, advance} = fake();
    clock.resume();
    advance(1);
    clock.setSpeed(2);
    expect(clock.getTime()).toBe(1);
    advance(1);
    expect(clock.getTime()).toBe(3);
  });

  test('stays frozen while paused and continues on resume', () => {
    const {clock, advance} = fake();
    clock.resume();
    advance(3);
    clock.pause();
    advance(7);
    expect(clock.getTime()).toBe(3);
    clock.resume();
    advance(1);
    expect(clock.getTime()).toBe(4);
  });

  test('anchor pins the clock to a timeline time', () => {
    const {clock, advance} = fake('device', 100);
    clock.resume();
    clock.anchor(5);
    advance(1);
    expect(clock.getTime()).toBe(6);
  });

  test('maps a timeline time back onto the render clock', () => {
    const {clock} = fake();
    clock.setSpeed(2);
    clock.resume();
    expect(clock.sourceTimeAt(4)).toBe(2);
  });

  test('carries the time across a change of clock source', () => {
    const {clock, advance, setKind} = fake('wall', 0);
    clock.resume();
    advance(2);
    expect(clock.getTime()).toBe(2);

    // the render clock counts from its own zero, so the switch must not move the playhead
    setKind('device');
    expect(clock.getTime()).toBe(2);
    clock.setSpeed(1);
    advance(1);
    expect(clock.getTime()).toBe(3);
  });
});
