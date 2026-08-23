import {describe, expect, it} from 'vitest';
import {Video} from '../Video';
import {mockScene2D} from './mockScene2D';

class TestVideo extends Video {
  public element(): HTMLVideoElement {
    return this.video();
  }
}

describe('Video muted', () => {
  mockScene2D();

  it('is muted and silent, and cannot be unmuted', () => {
    const video = (<TestVideo src="muted-test.mp4" />) as TestVideo;
    const element = video.element();

    expect(element.muted).toBe(true);
    expect(element.volume).toBe(0);
    expect(element.defaultMuted).toBe(true);

    element.muted = false;
    element.volume = 1;
    expect(element.muted).toBe(true);

    const reaccessed = video.element();
    expect(reaccessed).toBe(element);
    expect(reaccessed.muted).toBe(true);
    expect(reaccessed.volume).toBe(0);
  });
});
