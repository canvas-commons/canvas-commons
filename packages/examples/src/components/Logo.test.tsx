import {
  Node,
  Scene2D,
  View2D,
  makeScene2D,
  useScene2D,
} from '@canvas-commons/2d';
import {
  FullSceneDescription,
  Logger,
  PlaybackManager,
  PlaybackStatus,
  ReadOnlyTimeEvents,
  SharedWebGLContext,
  ThreadGeneratorFactory,
  ValueDispatcher,
  Vector2,
  endScene,
  startScene,
} from '@canvas-commons/core';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {Logo} from './Logo';

type Description = FullSceneDescription<ThreadGeneratorFactory<View2D>>;

function mockScene(): Scene2D {
  const logger = new Logger();
  // A scene builds its own variables, and the dispatcher needs the finished
  // description, so both are read back rather than passed in.
  const description: Description = {
    ...makeScene2D(function* () {
      // nothing to play
    }),
    name: 'logo',
    size: new Vector2(1920, 1080),
    resolutionScale: 1,
    playback: new PlaybackStatus(new PlaybackManager()),
    logger,
    sharedWebGLContext: new SharedWebGLContext(logger),
    timeEventsClass: ReadOnlyTimeEvents,
    get variables() {
      return useScene2D().variables;
    },
    get onReplaced() {
      return replaced;
    },
  };
  const replaced = new ValueDispatcher(description);
  return new Scene2D(description);
}

function parts(logo: Logo): Node[] {
  return logo.children();
}

describe('Logo', () => {
  const scene = mockScene();

  beforeAll(() => startScene(scene));
  afterAll(() => endScene(scene));
  beforeEach(() => scene.reset());

  it('draws every part once', () => {
    // Three lanes, the carve out and the light bar.
    expect(parts(new Logo()).length).toBe(5);
  });

  it('gives every lane one trail and one mask', () => {
    const lanes = parts(new Logo()).filter(part => part.cache());

    expect(lanes.length).toBe(3);
    for (const lane of lanes) {
      expect(lane.children().length).toBe(2);
      expect(lane.children()[0].children().length).toBe(4);
    }
  });

  it('does not double its parts when cloned', () => {
    const logo = new Logo({size: 96});
    const clone = logo.clone();

    expect(parts(clone).length).toBe(parts(logo).length);
    expect(parts(clone).map(part => part.children().length)).toEqual(
      parts(logo).map(part => part.children().length),
    );
  });

  it('keeps its properties when cloned', () => {
    const clone = new Logo({dot: '#ff0000'}).clone({size: 96});

    expect(clone.dot().hex()).toBe('#ff0000');
    expect(clone.size().x).toBe(96);
  });
});
