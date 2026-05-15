import {useApplication} from '../contexts/index.js';
import {useSubscribableValue} from './useSubscribable.js';

export function usePlayerState() {
  const {player} = useApplication();
  return useSubscribableValue(player.onStateChanged);
}
