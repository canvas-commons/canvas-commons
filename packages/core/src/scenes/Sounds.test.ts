import {describe, expect, it, vi} from 'vitest';
import type {Scene} from './Scene';
import {Sounds} from './Sounds';

function createSounds(): {sounds: Sounds; recalculate: () => void} {
  const subscribable = {subscribe: vi.fn(() => () => {})};
  let recalcHandler: (() => void) | null = null;
  const scene = {
    onReset: subscribable,
    onReloaded: subscribable,
    onRecalculated: {
      subscribe: vi.fn((handler: () => void) => {
        recalcHandler = handler;
        return () => {};
      }),
    },
    playback: {time: 0},
  } as unknown as Scene;
  return {sounds: new Sounds(scene), recalculate: () => recalcHandler?.()};
}

describe('Sounds', () => {
  it('notifies subscribers when a sound is added via recalculation', () => {
    const {sounds, recalculate} = createSounds();
    const handler = vi.fn();
    sounds.onChanged.subscribe(handler, false);

    sounds.add({audio: 'a.mp3'});
    expect(sounds.getSounds()).toHaveLength(1);

    recalculate();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('defaults origin to audio for keyless sounds and media for keyed ones', () => {
    const {sounds} = createSounds();
    const plain = sounds.add({audio: 'a.mp3'});
    const keyed = sounds.add({audio: 'b.mp3', sourceKey: 'video-1'});
    const explicit = sounds.add({
      audio: 'c.mp3',
      sourceKey: 'audio-1',
      origin: 'audio',
    });

    expect(plain.origin).toBe('audio');
    expect(keyed.origin).toBe('media');
    expect(explicit.origin).toBe('audio');
  });

  it('drops a broadcast sound from the list when it is removed', () => {
    const {sounds, recalculate} = createSounds();
    const clip = sounds.add({audio: 'a.mp3', sourceKey: 'video-1'});
    // Recalculation is what publishes the list the editor renders; a later
    // async removal (e.g. a silent clip) must then drop it.
    recalculate();

    const handler = vi.fn();
    sounds.onChanged.subscribe(handler, false);

    sounds.remove(clip);

    expect(sounds.getSounds()).toHaveLength(0);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith([]);
  });

  it('keeps the broadcast list intact when removing a never-published sound', () => {
    const {sounds, recalculate} = createSounds();
    const published = sounds.add({audio: 'published.mp3', sourceKey: 'a'});
    recalculate();

    // A sound registered after the last recalculation (e.g. during live
    // playback, when the scene re-executes frame by frame) is not part of the
    // published list, so removing it must not disturb what the editor shows.
    const live = sounds.add({audio: 'live.mp3', sourceKey: 'b'});
    const handler = vi.fn();
    sounds.onChanged.subscribe(handler, false);

    sounds.remove(live);

    expect(handler).not.toHaveBeenCalled();
    expect(sounds.onChanged.current).toContain(published);
  });

  it('does not notify when removing an unknown sound', () => {
    const {sounds} = createSounds();
    const handler = vi.fn();
    sounds.onChanged.subscribe(handler, false);

    sounds.remove({audio: 'ghost.mp3'} as never);

    expect(handler).not.toHaveBeenCalled();
  });
});
