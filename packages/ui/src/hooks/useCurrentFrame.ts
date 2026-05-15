import {RendererState} from '@canvas-commons/core';
import {useApplication} from '../contexts/index.js';
import {useRendererState} from './useRendererState.js';
import {usePreviewSettings, useRenderingSettings} from './useSettings.js';
import {useSubscribableValue} from './useSubscribable.js';

export function useCurrentFrame() {
  const {player, renderer} = useApplication();
  const playerFrame = useSubscribableValue(player.onFrameChanged);
  const rendererFrame = useSubscribableValue(renderer.onFrameChanged);
  const rendererState = useRendererState();
  const preview = usePreviewSettings();
  const rendering = useRenderingSettings();

  return rendererState === RendererState.Working
    ? Math.floor((rendererFrame / rendering.fps) * preview.fps)
    : playerFrame;
}
