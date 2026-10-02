import {
  Layout,
  Node,
  Rect,
  Scene2D,
  View2D,
  initial,
  makeScene2D,
  vector2Signal,
} from '@canvas-commons/2d';
import {
  Color,
  FullSceneDescription,
  Logger,
  PlaybackManager,
  PlaybackStatus,
  ReadOnlyTimeEvents,
  SharedWebGLContext,
  ThreadGeneratorFactory,
  ValueDispatcher,
  Vector2,
  Vector2Signal,
  endPlayback,
  endScene,
  startPlayback,
  startScene,
  threads,
} from '@canvas-commons/core';
import {
  Pill,
  Tile,
  createPillRow,
  defaultPluginName,
  engineClasses,
  insertedByDiff,
  makeColor,
  moveOffset,
  readOffset,
} from 'motion-canvas-fixture-library';

type SceneDescription = FullSceneDescription<ThreadGeneratorFactory<View2D>>;

function createScene(): Scene2D {
  const playback = new PlaybackStatus(new PlaybackManager());
  const logger = new Logger();
  const description: SceneDescription = {
    ...makeScene2D(function* () {
      // The probe builds the nodes itself.
    }),
    name: 'probe',
    size: new Vector2(1920, 1080),
    resolutionScale: 1,
    timeEventsClass: ReadOnlyTimeEvents,
    playback,
    logger,
    sharedWebGLContext: new SharedWebGLContext(logger),
    get variables() {
      return scene.variables;
    },
    get onReplaced() {
      return onReplaced;
    },
  };
  const onReplaced = new ValueDispatcher(description);
  const scene = new Scene2D(description);
  startScene(scene);
  startPlayback(playback);
  return scene;
}

class OwnOffsetRect extends Rect {
  declare public readonly offset: Vector2Signal<this>;
}
vector2Signal('offset')(OwnOffsetRect.prototype, 'offset');
initial(Vector2.zero)(OwnOffsetRect.prototype, 'offset');

function anchorOf(node: Node): number[] {
  if (!(node instanceof Layout)) {
    throw new Error('Expected a layout.');
  }
  return node.anchor().toArray();
}

/** Build the library components with the engine of the project. */
export function runProbe() {
  const scene = createScene();
  try {
    const pill = new Pill({});
    const [rowPill, rowTile, rowRect] = createPillRow().children();
    const tweened = new Pill({});
    [
      ...threads(() =>
        (function* () {
          yield* moveOffset(tweened);
        })(),
      ),
    ];
    const own = new OwnOffsetRect({offset: [3, 4]});

    return {
      offsetInSuperProps: anchorOf(pill),
      offsetXYInSuperProps: anchorOf(new Tile({})),
      offsetInJsxProps: anchorOf(rowPill),
      offsetYInJsxProps: anchorOf(rowTile),
      offsetInJsxPropsOfEngineClass: anchorOf(rowRect),
      offsetRead: readOffset(pill).toArray(),
      offsetComponentRead: pill.offset.x(),
      offsetIsAnchor: pill.offset === pill.anchor,
      offsetTweened: anchorOf(tweened),
      offsetCloned: anchorOf(pill.clone()),
      ownOffset: own.offset().toArray(),
      ownOffsetLeavesAnchor: anchorOf(own),
      colorFromLibraryIsEngineColor: makeColor() instanceof Color,
      pillIsEngineLayout: pill instanceof Layout,
      libraryLayoutIsEngineLayout: engineClasses.Layout === Layout,
      libraryVector2IsEngineVector2: engineClasses.Vector2 === Vector2,
      libraryColorIsEngineColor: engineClasses.Color === Color,
      insertedByDiff,
      defaultPluginName,
    };
  } finally {
    endPlayback(scene.playback);
    endScene(scene);
  }
}
