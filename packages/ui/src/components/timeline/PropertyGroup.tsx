import type {Scene} from '@canvas-commons/core';
import {useTimelineContext} from '../../contexts';
import {useSubscribableValue} from '../../hooks';
import {PropertyPill} from './PropertyPill';

interface PropertyGroupProps {
  scene: Scene;
}

export function PropertyGroup({scene}: PropertyGroupProps) {
  const {firstVisibleFrame, lastVisibleFrame} = useTimelineContext();
  const properties = useSubscribableValue(scene.variables.onChanged);
  const cached = useSubscribableValue(scene.onCacheChanged);
  const isVisible =
    cached.lastFrame >= firstVisibleFrame &&
    cached.firstFrame <= lastVisibleFrame;

  return (
    <>
      {isVisible &&
        properties
          .filter(p => !p.hidden)
          .map(property => (
            <PropertyPill
              key={property.name}
              property={property}
              scene={scene}
            />
          ))}
    </>
  );
}
