import {Stage} from '@canvas-commons/core';
import {JSX} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {useApplication} from '../../contexts';
import {VIEWPORT_SHORTCUTS, useShortcuts} from '../../contexts/shortcuts';
import {
  usePreviewSettings,
  useSharedSettings,
  useSubscribable,
} from '../../hooks';
import {StageView} from './StageView';

export function PreviewStage(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [stage] = useState(() => new Stage());
  const {player, project} = useApplication();
  const {size, background} = useSharedSettings();
  const {resolutionScale} = usePreviewSettings();

  useSubscribable(
    player.onRender,
    async () => {
      await stage.render(
        player.playback.currentScene,
        player.playback.previousScene,
      );
    },
    [],
  );

  useEffect(() => {
    stage.configure({resolutionScale, size, background});
    player.requestRender();
  }, [resolutionScale, size, background, player]);

  useShortcuts(VIEWPORT_SHORTCUTS, {
    copyFrame: async () => {
      const blob = await canvasToPng(stage.finalBuffer);
      if (!blob) return;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
    },
    downloadFrame: async () => {
      const blob = await canvasToPng(stage.finalBuffer);
      if (!blob) return;
      const scene = player.playback.currentScene;
      const sceneFrame = player.playback.frame - scene.firstFrame;
      downloadBlob(blob, `${project.name}-${scene.name}-${sceneFrame}.png`);
    },
  });

  return <StageView stage={stage} {...props} />;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
