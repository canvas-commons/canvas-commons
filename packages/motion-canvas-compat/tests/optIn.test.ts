import {describe, expect, it} from 'vitest';
import motionCanvasCompat from '../lib/index.js';

describe('motionCanvasCompat', () => {
  it('throws without the experimental opt-in', () => {
    expect(() => Reflect.apply(motionCanvasCompat, undefined, [])).toThrow(
      '{experimental: true}',
    );
  });
});
