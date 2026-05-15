import {useApplication} from '../contexts/index.js';
import {useSubscribableValue} from './useSubscribable.js';

export function useRendererState() {
  const {renderer} = useApplication();
  return useSubscribableValue(renderer.onStateChanged);
}
