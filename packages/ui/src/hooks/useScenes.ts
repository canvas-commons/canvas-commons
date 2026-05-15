import {useApplication} from '../contexts/index.js';
import {useSubscribableValue} from './useSubscribable.js';

export function useScenes() {
  const {player} = useApplication();
  return useSubscribableValue(player.playback.onScenesRecalculated);
}

export function useCurrentScene() {
  const {player} = useApplication();
  return useSubscribableValue(player.playback.onSceneChanged);
}
