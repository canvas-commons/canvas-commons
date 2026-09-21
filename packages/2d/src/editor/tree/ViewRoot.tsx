import {useSignal} from '@preact/signals';
import {useEffect} from 'preact/hooks';
import {usePluginState} from '../Provider';
import {NodeElement} from './NodeElement';
import {TreeRoot} from './TreeRoot';

export function ViewRoot() {
  const {scene} = usePluginState();
  const currentScene = scene.value;
  const view = useSignal(currentScene?.getView());

  // useSignalEffect subscribes a frame late and misses an early onReset.
  useEffect(() => {
    view.value = currentScene?.getView();
    return currentScene?.onReset.subscribe(() => {
      view.value = currentScene?.getView();
    });
  }, [currentScene]);

  return view.value ? (
    <TreeRoot>{<NodeElement node={view.value} />}</TreeRoot>
  ) : null;
}
