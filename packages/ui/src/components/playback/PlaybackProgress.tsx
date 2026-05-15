import styles from './Playback.module.scss';

import {useApplication} from '../../contexts/index.js';
import {usePlayerTime, useSubscribableValue} from '../../hooks/index.js';

export function PlaybackProgress() {
  const state = usePlayerTime();
  return <Progress completion={state.completion} />;
}

export function RenderingProgress() {
  const {renderer} = useApplication();
  const completion = useSubscribableValue(
    renderer.estimator.onCompletionChanged,
  );
  return <Progress completion={completion} />;
}

interface ProgressProps {
  completion: number;
}

function Progress({completion}: ProgressProps) {
  return (
    <div className={styles.progress}>
      <div
        className={styles.progressFill}
        style={{width: `${completion * 100}%`}}
      />
    </div>
  );
}
