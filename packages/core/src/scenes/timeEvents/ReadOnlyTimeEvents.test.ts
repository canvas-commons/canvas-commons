import {describe, expect, it} from 'vitest';
import {EventDispatcher} from '../../events';
import type {Scene} from '../Scene';
import {ReadOnlyTimeEvents} from './ReadOnlyTimeEvents';
import type {SerializedTimeEvent} from './SerializedTimeEvent';

function mockScene(events: SerializedTimeEvent[]): Scene {
  return {
    onReloaded: new EventDispatcher<void>(),
    meta: {
      timeEvents: {
        get: () => events,
      },
    },
  } as unknown as Scene;
}

describe('ReadOnlyTimeEvents', () => {
  it('returns the stored duration for an event reached at its initial time', () => {
    const scene = mockScene([{name: 'event', targetTime: 5}]);
    const timeEvents = new ReadOnlyTimeEvents(scene);
    expect(timeEvents.register('event', 0)).toBe(5);
  });

  it('clamps a negative duration to zero', () => {
    // A stored targetTime earlier than where the event is registered would
    // otherwise rewind the timeline and collapse the scene duration.
    const scene = mockScene([{name: 'event', targetTime: 0}]);
    const timeEvents = new ReadOnlyTimeEvents(scene);
    expect(timeEvents.register('event', 96)).toBe(0);
  });

  it('returns zero for an unknown event', () => {
    const scene = mockScene([]);
    const timeEvents = new ReadOnlyTimeEvents(scene);
    expect(timeEvents.register('missing', 10)).toBe(0);
  });

  it('caches the duration on first lookup', () => {
    const scene = mockScene([{name: 'event', targetTime: 8}]);
    const timeEvents = new ReadOnlyTimeEvents(scene);
    expect(timeEvents.register('event', 0)).toBe(8);
    // A later registration at a different time reuses the cached value.
    expect(timeEvents.register('event', 100)).toBe(8);
  });
});
