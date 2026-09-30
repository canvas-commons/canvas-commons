import {afterEach, describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Video} from '../Video';
import {mockScene2D} from './mockScene2D';

describe('Video time', () => {
  mockScene2D();

  afterEach(() => {
    Reflect.deleteProperty(HTMLMediaElement.prototype, 'error');
  });

  it('uses time zero when the video failed to load', () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'error', {
      configurable: true,
      get: () => ({code: 4}),
    });
    const video = new Video({src: 'failed.mp4', loop: true});
    useScene2D().getView().add(video);

    video.seek(5);

    expect(video.getCurrentTime()).toBe(0);
  });

  it('keeps a requested time while the metadata is pending', () => {
    const video = new Video({src: 'video.mp4'});
    useScene2D().getView().add(video);

    video.seek(5);

    expect(video.getCurrentTime()).toBe(5);
  });
});
