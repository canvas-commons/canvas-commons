import {useApplication} from '../contexts/index.js';
import {useSubscribableValue} from './useSubscribable.js';

export function usePresenterState() {
  const {presenter} = useApplication();
  return useSubscribableValue(presenter.onStateChanged);
}
