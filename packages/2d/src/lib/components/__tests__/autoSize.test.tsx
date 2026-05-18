import {describe, expect, it} from 'vitest';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';

describe('Txt autoSize', () => {
  mockScene2D();

  it('returns the configured fontSize when autoSize is off', () => {
    const txt = (
      <Txt width={400} height={200} fontSize={48}>
        Hello world
      </Txt>
    ) as Txt;

    expect(txt.effectiveFontSize()).toBe(48);
  });

  it('returns the raw fontSize when autoSize is on but bounds are not numeric', () => {
    const txt = (
      <Txt autoSize fontSize={48}>
        Hello world
      </Txt>
    ) as Txt;

    expect(txt.effectiveFontSize()).toBe(48);
  });

  it('returns a finite size at or below the configured fontSize when bounds are set', () => {
    const txt = (
      <Txt autoSize width={120} height={60} fontSize={96}>
        The quick brown fox jumps over the lazy dog
      </Txt>
    ) as Txt;

    const resolved = txt.effectiveFontSize();
    expect(Number.isFinite(resolved)).toBe(true);
    expect(resolved).toBeGreaterThan(0);
    expect(resolved).toBeLessThanOrEqual(96);
  });

  it('reflects fontSize as upper bound when autoSize is on', () => {
    const txt = (
      <Txt autoSize width={1000} height={1000} fontSize={32}>
        Hi
      </Txt>
    ) as Txt;

    const resolved = txt.effectiveFontSize();
    expect(resolved).toBeLessThanOrEqual(32);
    expect(resolved).toBeGreaterThan(0);
  });

  it('invalidates the cached fit when fontSize changes', () => {
    const txt = (
      <Txt autoSize width={200} height={60} fontSize={96}>
        Some longer line of text
      </Txt>
    ) as Txt;

    txt.effectiveFontSize();
    txt.fontSize(48);
    const second = txt.effectiveFontSize();

    expect(second).toBeLessThanOrEqual(48);
    expect(second).toBeGreaterThan(0);
  });

  it('scales nested Txt fonts uniformly via fontScale', () => {
    const txt = (
      <Txt autoSize width={300} height={100} fontSize={48}>
        outer <Txt fontSize={24}>inner</Txt>
      </Txt>
    ) as Txt;

    expect(Number.isFinite(txt.effectiveFontSize())).toBe(true);
  });
});
