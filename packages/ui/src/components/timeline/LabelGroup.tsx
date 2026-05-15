import type {Scene} from '@canvas-commons/core';
import {useTimelineContext} from '../../contexts/index.js';
import {useSubscribableValue} from '../../hooks/index.js';
import {Label} from './Label.js';

interface LabelGroupProps {
  scene: Scene;
}

export function LabelGroup({scene}: LabelGroupProps) {
  const {firstVisibleFrame, lastVisibleFrame} = useTimelineContext();
  const events = useSubscribableValue(scene.timeEvents.onChanged);
  const cached = useSubscribableValue(scene.onCacheChanged);
  const isVisible =
    cached.lastFrame >= firstVisibleFrame &&
    cached.firstFrame <= lastVisibleFrame;

  return (
    <>
      {isVisible &&
        events.map(event => (
          <Label key={event.name} event={event} scene={scene} />
        ))}
    </>
  );
}
