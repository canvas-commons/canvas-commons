import {usePluginState} from '../Provider.js';
import {NodeElement} from './NodeElement.js';
import {TreeElement} from './TreeElement.js';
import {TreeRoot} from './TreeRoot.js';

export function DetachedRoot() {
  const {afterRender, openDetached, scene} = usePluginState();
  const currentScene = scene.value;
  const children = currentScene ? [...currentScene.getDetachedNodes()] : [];
  afterRender.value;

  return children.length > 0 ? (
    <TreeRoot>
      <TreeElement
        open={openDetached.value}
        hasChildren
        onToggle={value => {
          openDetached.value = value;
        }}
        label="Detached nodes"
      >
        {openDetached.value &&
          children.map(child => <NodeElement node={child} depth={1} />)}
      </TreeElement>
    </TreeRoot>
  ) : null;
}
