import {useApplication} from '../../contexts/index.js';
import {useSubscribableValue} from '../../hooks/index.js';
import {Header} from '../layout/index.js';
import {SceneGroup} from './SceneGroup.js';
import styles from './SlideGraph.module.scss';

export function SlideGraph() {
  const {presenter} = useApplication();
  const scenes = useSubscribableValue(presenter.playback.onScenesRecalculated);

  return (
    <div className={styles.root}>
      <Header>SLIDES</Header>
      {scenes.map(scene => (
        <SceneGroup key={scene.name} scene={scene} />
      ))}
    </div>
  );
}
