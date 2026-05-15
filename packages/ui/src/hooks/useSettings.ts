import {useApplication} from '../contexts/index.js';
import {useSubscribableValue} from './useSubscribable.js';

export function useSharedSettings() {
  const {meta} = useApplication();
  return useSubscribableValue(meta.shared.onChanged);
}

export function usePreviewSettings() {
  const {meta} = useApplication();
  return useSubscribableValue(meta.preview.onChanged);
}

export function useRenderingSettings() {
  const {meta} = useApplication();
  return useSubscribableValue(meta.rendering.onChanged);
}
