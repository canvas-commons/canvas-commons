import {LogLevel, Logger, useLogger} from '@canvas-commons/core';
import {afterEach, beforeEach, expect} from 'vitest';

/** Fail a test that logs a scene error instead of letting it pass quietly. */
export function failOnSceneErrors(): void {
  const errors: unknown[] = [];
  let unsubscribe: (() => void) | null = null;
  beforeEach(() => {
    errors.length = 0;
    const logger = useLogger();
    if (!(logger instanceof Logger)) return;
    unsubscribe = logger.onLogged.subscribe(payload => {
      if (payload.level === LogLevel.Error) errors.push(payload);
    });
  });
  afterEach(() => {
    unsubscribe?.();
    expect(errors).toEqual([]);
  });
}
