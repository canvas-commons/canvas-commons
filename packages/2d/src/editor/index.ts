import './index.css';

import {makeEditorPlugin} from '@canvas-commons/ui';
import {NodeInspectorConfig} from './NodeInspectorConfig.js';
import {PreviewOverlayConfig} from './PreviewOverlayConfig.js';
import {Provider} from './Provider.js';
import {SceneGraphTabConfig} from './SceneGraphTabConfig.js';
import {SCENE_GRAPH_SHORTCUTS} from './shortcuts.js';

export default makeEditorPlugin(() => {
  return {
    name: '@canvas-commons/2d',
    provider: Provider,
    previewOverlay: PreviewOverlayConfig,
    tabs: [SceneGraphTabConfig],
    inspectors: [NodeInspectorConfig],
    shortcuts: [SCENE_GRAPH_SHORTCUTS],
  };
});
