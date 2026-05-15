import {RendererState} from '@canvas-commons/core';
import clsx from 'clsx';
import {useEffect, useState} from 'preact/hooks';
import {useApplication} from '../../contexts/index.js';
import {
  VIEWPORT_SHORTCUTS,
  useSurfaceShortcuts,
} from '../../contexts/shortcuts.js';
import {useDuration, useRendererState} from '../../hooks/index.js';
import {formatDuration} from '../../utils/index.js';
import {CurrentTime} from '../playback/CurrentTime.js';
import {
  PlaybackControls,
  PlaybackProgress,
  RenderingProgress,
} from '../playback/index.js';
import {EditorPreview} from './EditorPreview.js';
import {StageView} from './StageView.js';
import {Timestamp} from './Timestamp.js';
import styles from './Viewport.module.scss';

export function Viewport() {
  const state = useRendererState();
  return state === RendererState.Working ? (
    <RenderingViewport />
  ) : (
    <EditorViewport />
  );
}

function EditorViewport() {
  const shortcutRef = useSurfaceShortcuts<HTMLDivElement>(VIEWPORT_SHORTCUTS);
  const duration = useDuration();

  return (
    <div ref={shortcutRef} className={styles.root}>
      <EditorPreview />
      <PlaybackProgress />
      <div className={styles.playback}>
        <CurrentTime
          render={time => (
            <Timestamp
              className={styles.time}
              title="Current time"
              frameTitle="Current frame"
              frame={time}
            />
          )}
        />
        <PlaybackControls />
        <Timestamp
          reverse
          className={styles.duration}
          title="Duration"
          frameTitle="Duration in frames"
          frame={duration}
        />
      </div>
    </div>
  );
}

function RenderingViewport() {
  const {renderer} = useApplication();
  const [estimate, setEstimate] = useState(renderer.estimator.estimate());

  useEffect(() => {
    const id = setInterval(() => {
      setEstimate(renderer.estimator.estimate());
    }, 100);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.root}>
      <StageView
        stage={renderer.stage}
        className={clsx(styles.viewport, styles.renderingPreview)}
      />
      <RenderingProgress />
      <div className={styles.playback}>
        <code
          className={styles.time}
          title="Time elapsed since the rendering started"
        >
          {formatDuration(estimate.elapsed / 1000)}
          <span className={styles.frames}>Elapsed</span>
        </code>
        <div />
        <code
          className={styles.duration}
          title="Estimated time remaining until the rendering is complete"
        >
          <span className={styles.frames}>ETA:</span>
          {formatDuration(estimate.eta / 1000)}
        </code>
      </div>
    </div>
  );
}
