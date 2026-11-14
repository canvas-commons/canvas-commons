import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useScene2D} from '../../scenes';
import {Video} from '../Video';
import {mockScene2D} from './mockScene2D';

// jsdom reports media as never ready and never playing, so the element state these tests need is installed by hand
function playingElement(video: Video): HTMLVideoElement {
  const element = video['video']();
  Object.defineProperty(element, 'paused', {
    get: () => false,
    configurable: true,
  });
  return element;
}

describe('Video audio', () => {
  const playback = mockScene2D();

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      3,
    );
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('starts with the player audio state', () => {
    playback.muted = true;
    playback.volume = 0.4;

    const video = new Video({src: 'clip.mp4'});
    useScene2D().getView().add(video);

    const element = video['video']();
    expect(element.muted).toBe(true);
    expect(element.volume).toBe(0.4);
  });

  it('applies the audio state again when the player changes it', () => {
    playback.muted = false;

    const video = new Video({src: 'clip.mp4'});
    useScene2D().getView().add(video);
    const element = video['video']();

    playback.muted = true;
    video['applyAudioState'](element);

    expect(element.muted).toBe(true);
  });

  it('stops the media when the node leaves the tree', () => {
    const video = new Video({src: 'clip.mp4'});
    useScene2D().getView().add(video);
    const element = playingElement(video);
    const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});

    video.remove();

    expect(pause).toHaveBeenCalledOnce();
    expect(Video['pool'][video['poolKey']]).toBe(element);
  });

  it('releases the pooled media when the node is disposed', () => {
    const video = new Video({src: 'clip.mp4'});
    useScene2D().getView().add(video);
    const element = playingElement(video);
    const poolKey = video['poolKey'];
    const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});

    video.dispose();

    expect(pause).toHaveBeenCalledOnce();
    expect(Video['pool'][poolKey]).toBeUndefined();
    expect(video['element']).toBeNull();
  });
});
