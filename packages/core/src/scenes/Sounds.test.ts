import {describe, expect, it, vi} from 'vitest';
import type {Scene} from './Scene';
import {Sounds} from './Sounds';

function createSounds(): Sounds {
  const subscribable = {subscribe: vi.fn(() => () => {})};
  const scene = {
    onReset: subscribable,
    onReloaded: subscribable,
    onRecalculated: subscribable,
    playback: {time: 0},
  } as unknown as Scene;
  return new Sounds(scene);
}

describe('Sounds', () => {
  it('notifies subscribers when a sound is added via recalculation', () => {
    const sounds = createSounds();
    const handler = vi.fn();
    sounds.onChanged.subscribe(handler, false);

    sounds.add({audio: 'a.mp3'});
    expect(sounds.getSounds()).toHaveLength(1);
  });

  it('broadcasts the updated list when a sound is removed', () => {
    const sounds = createSounds();
    const clip = sounds.add({audio: 'a.mp3', sourceKey: 'video-1'});

    const handler = vi.fn();
    sounds.onChanged.subscribe(handler, false);

    sounds.remove(clip);

    expect(sounds.getSounds()).toHaveLength(0);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith([]);
  });

  it('does not notify when removing an unknown sound', () => {
    const sounds = createSounds();
    const handler = vi.fn();
    sounds.onChanged.subscribe(handler, false);

    sounds.remove({audio: 'ghost.mp3'} as never);

    expect(handler).not.toHaveBeenCalled();
  });
});
