import styles from './Timeline.module.scss';

import {useScenes} from '../../hooks/index.js';
import {LabelGroup} from './LabelGroup.js';

export function LabelTrack() {
  const scenes = useScenes();

  return (
    <div className={styles.labelTrack}>
      {scenes.map(scene => (
        <LabelGroup key={scene.name} scene={scene} />
      ))}
    </div>
  );
}
