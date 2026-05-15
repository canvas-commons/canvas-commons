import {useSignal, useSignalEffect} from '@preact/signals';
import {usePluginState} from '../Provider.js';
import {NodeElement} from './NodeElement.js';
import {TreeRoot} from './TreeRoot.js';

export function ViewRoot() {
  const {scene} = usePluginState();
  const view = useSignal(scene.value?.getView());

  useSignalEffect(() => {
    view.value = scene.value?.getView();
    return scene.value?.onReset.subscribe(() => {
      view.value = scene.value?.getView();
    });
  });

  return view.value ? (
    <TreeRoot>{<NodeElement node={view.value} />}</TreeRoot>
  ) : null;
}
