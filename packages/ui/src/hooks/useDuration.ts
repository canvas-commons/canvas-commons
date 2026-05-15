import {useApplication} from '../contexts/index.js';
import {useSubscribableValue} from './useSubscribable.js';

export function useDuration() {
  const {player} = useApplication();
  return useSubscribableValue(player.onDurationChanged);
}
