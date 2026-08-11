import styles from './Timeline.module.scss';

import {useScenes} from '../../hooks';
import {LabelGroup} from './LabelGroup';
import {useTrackLayout} from './trackLayout';

export function LabelTrack() {
  const scenes = useScenes();
  const layoutRef = useTrackLayout<HTMLDivElement>('label');

  return (
    <div ref={layoutRef} className={styles.labelTrack}>
      {scenes.map(scene => (
        <LabelGroup key={scene.name} scene={scene} />
      ))}
    </div>
  );
}
