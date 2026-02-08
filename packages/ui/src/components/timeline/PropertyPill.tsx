import styles from './Timeline.module.scss';

import type {Scene} from '@canvas-commons/core';
import type {EditableVariable} from '@canvas-commons/core/lib/scenes/editableVariables';
import {useApplication, useTimelineContext} from '../../contexts';
import {PROPERTY_INSPECTOR_KEY} from '../viewport/PropertyInspector';

interface PropertyPillProps {
  property: EditableVariable;
  scene: Scene;
}

export function PropertyPill({property, scene}: PropertyPillProps) {
  const {framesToPercents} = useTimelineContext();
  const {inspection} = useApplication();

  const inspected = inspection.value;
  const isSelected =
    inspected.key === PROPERTY_INSPECTOR_KEY &&
    (inspected.payload as {sceneName: string; propertyName: string})
      ?.sceneName === scene.name &&
    (inspected.payload as {sceneName: string; propertyName: string})
      ?.propertyName === property.name;

  return (
    <div
      className={`${styles.propertyPill} ${isSelected ? styles.selected : ''}`}
      data-name={property.name}
      data-type={property.type}
      onPointerDown={e => {
        if (e.button !== 0) return;
        e.stopPropagation();
        inspection.value = {
          key: PROPERTY_INSPECTOR_KEY,
          payload: {sceneName: scene.name, propertyName: property.name},
        };
      }}
      style={{
        left: `${framesToPercents(
          scene.firstFrame +
            scene.playback.secondsToFrames(property.initialTime),
        )}%`,
      }}
    />
  );
}
