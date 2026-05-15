import clsx from 'clsx';
import {useMemo, useRef} from 'preact/hooks';
import {
  ViewportProvider,
  ViewportState,
  useApplication,
} from '../../contexts/index.js';
import {
  useRenderingSettings,
  useSharedSettings,
  useSize,
} from '../../hooks/index.js';
import {StageView} from '../viewport/index.js';
import {OverlayCanvas} from '../viewport/OverlayCanvas.js';
import styles from '../viewport/Viewport.module.scss';
import {PresentationControls} from './PresentationControls.js';
import {SlideGraph} from './SlideGraph.js';

export function PresentationMode() {
  const {plugins, presenter} = useApplication();
  const ref = useRef<HTMLDivElement>();
  const size = useSize(ref);
  const settings = useSharedSettings();
  const {resolutionScale} = useRenderingSettings();

  const drawHooks = useMemo(
    () =>
      plugins.map(plugin => plugin.presenterOverlay?.drawHook).filter(Boolean),
    [plugins],
  );

  const state: ViewportState = useMemo(() => {
    const state = {
      grid: false,
      rect: size,
      zoom: 1,
      x: 0,
      y: 0,
      resolutionScale,
    };

    const physicalSize = settings.size.scale(resolutionScale);
    if (physicalSize.width > size.width || physicalSize.height > size.height) {
      let newZoom = size.height / physicalSize.height;
      if (physicalSize.width * newZoom > size.width) {
        newZoom = size.width / physicalSize.width;
      }
      if (!isNaN(newZoom) && newZoom > 0 && newZoom < Infinity) {
        state.zoom = newZoom;
      }
    }
    state.zoom *= resolutionScale;

    return state;
  }, [settings, size, resolutionScale]);

  return (
    <ViewportProvider value={state}>
      <StageView
        forwardRef={ref}
        stage={presenter.stage}
        className={clsx(styles.viewport, styles.renderingPreview)}
      />
      <OverlayCanvas
        drawHooks={drawHooks}
        width={size.width}
        height={size.height}
      />
      <SlideGraph />
      <PresentationControls />
    </ViewportProvider>
  );
}
