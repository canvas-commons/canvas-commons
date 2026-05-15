import {useMemo} from 'preact/hooks';
import {useCurrentFrame} from './useCurrentFrame.js';
import {useDuration} from './useDuration.js';
import {usePreviewSettings} from './useSettings.js';

export function usePlayerTime() {
  const {fps} = usePreviewSettings();
  const frame = useCurrentFrame();
  const duration = useDuration();

  return useMemo(
    () => ({
      frame,
      time: frame / fps,
      duration: duration,
      durationTime: duration / fps,
      completion: frame / duration,
    }),
    [frame, duration, fps],
  );
}
