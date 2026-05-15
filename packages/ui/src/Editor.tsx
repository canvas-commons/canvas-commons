import {PresenterState} from '@canvas-commons/core';
import {useEffect} from 'preact/hooks';
import styles from './Editor.module.scss';
import {Console} from './components/console/index.js';
import {Footer} from './components/footer/index.js';
import {
  ElementSwitch,
  Navigation,
  ResizeableLayout,
} from './components/layout/index.js';
import {PresentationMode} from './components/presentation/index.js';
import {Settings, Threads, VideoSettings} from './components/sidebar/index.js';
import {Timeline} from './components/timeline/index.js';
import {Viewport} from './components/viewport/index.js';
import {usePanels} from './contexts/index.js';
import {useShortcutContext} from './contexts/shortcuts.js';
import {usePresenterState} from './hooks/index.js';
import {EditorPanel} from './signals/index.js';

export function Editor() {
  const state = usePresenterState();
  const {sidebar, bottom} = usePanels();
  const {global} = useShortcutContext();

  useEffect(() => {
    global.value = state === PresenterState.Initial ? 'editor' : 'presenter';
  }, [state]);

  return state === PresenterState.Initial ? (
    <div className={styles.root}>
      <Navigation />
      <ResizeableLayout
        id={`main-timeline`}
        hidden={bottom.isHidden}
        offset={-160}
        vertical
      >
        <ResizeableLayout
          id={`sidebar-viewport`}
          hidden={sidebar.isHidden}
          offset={400}
        >
          <ElementSwitch
            value={sidebar.current.value}
            cases={{
              [EditorPanel.VideoSettings]: VideoSettings,
              [EditorPanel.Threads]: Threads,
              [EditorPanel.Console]: Console,
              [EditorPanel.Settings]: Settings,
            }}
          />
          <Viewport />
        </ResizeableLayout>
        <ElementSwitch
          value={bottom.current.value}
          cases={{
            [EditorPanel.Timeline]: Timeline,
          }}
        />
      </ResizeableLayout>
      <Footer />
    </div>
  ) : (
    <PresentationMode />
  );
}
