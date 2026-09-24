import {describe, expect, it} from 'vitest';
import {
  GenerationTracker,
  isStaleGeneration,
  VariableTracker,
} from './protocol';

describe('isStaleGeneration', () => {
  it('treats only a lower generation as stale', () => {
    expect(isStaleGeneration(1, 3)).toBe(true);
    expect(isStaleGeneration(3, 3)).toBe(false);
    expect(isStaleGeneration(4, 3)).toBe(false);
  });
});

describe('GenerationTracker', () => {
  it('allocates monotonically increasing generations', () => {
    const tracker = new GenerationTracker();
    expect(tracker.next()).toBe(0);
    expect(tracker.next()).toBe(1);
    expect(tracker.next()).toBe(2);
  });

  it('accepts a generation at or above the current one', () => {
    const tracker = new GenerationTracker();
    tracker.next();
    tracker.next();
    expect(tracker.observe(1)).toBe(true);
    expect(tracker.current).toBe(1);
  });

  it('drops a generation below the latest observed', () => {
    const tracker = new GenerationTracker();
    tracker.observe(5);
    expect(tracker.observe(2)).toBe(false);
    expect(tracker.current).toBe(5);
  });

  it('drops an older run that finishes after a newer one started', () => {
    const tracker = new GenerationTracker();
    const older = tracker.next();
    const newer = tracker.next();
    tracker.observe(newer);
    expect(tracker.observe(older)).toBe(false);
  });
});

/* eslint-disable-next-line @typescript-eslint/naming-convention -- scene
   variables are CSS custom property names. */
const LATTE_GREEN = {'--cc-green': '#40a02b'};

describe('VariableTracker', () => {
  function fakeTarget() {
    const applied: Record<string, unknown>[] = [];
    let renders = 0;
    return {
      applied,
      get renders() {
        return renders;
      },
      setVariables(variables: Record<string, unknown>) {
        applied.push(variables);
      },
      requestRender() {
        renders += 1;
      },
    };
  }

  it('repaints the current target when variables arrive', () => {
    const tracker = new VariableTracker();
    const target = fakeTarget();
    tracker.set(LATTE_GREEN);
    tracker.applyTo(target);
    expect(target.applied).toEqual([LATTE_GREEN]);
    expect(target.renders).toBe(1);
  });

  it('applies the last variables to a target created later', () => {
    const tracker = new VariableTracker();
    tracker.set(LATTE_GREEN);
    tracker.applyTo(fakeTarget());
    const replacement = fakeTarget();
    tracker.applyTo(replacement);
    expect(replacement.applied).toEqual([LATTE_GREEN]);
  });

  it('leaves a target alone until variables arrive', () => {
    const tracker = new VariableTracker();
    const target = fakeTarget();
    tracker.applyTo(target);
    expect(target.applied).toEqual([]);
    expect(target.renders).toBe(0);
  });
});
