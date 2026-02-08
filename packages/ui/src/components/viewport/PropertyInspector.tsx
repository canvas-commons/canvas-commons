import type {Scene} from '@canvas-commons/core';
import type {EditableVariable} from '@canvas-commons/core/lib/scenes/editableVariables';
import {useCallback} from 'preact/hooks';
import {useApplication} from '../../contexts';
import {useScenes, useSubscribableValue} from '../../hooks';
import {Group, Label, PresetPicker, Separator} from '../controls';
import {EditablePropertyField} from '../fields/EditablePropertyField';
import {FieldSurface} from '../fields/Layout';
import {Pane} from '../tabs/Pane';

export const PROPERTY_INSPECTOR_KEY = '@canvas-commons/core/property-inspector';

interface PropertyInspectorPayload {
  sceneName: string;
  propertyName: string;
}

function PropertyInspectorInner({
  scene,
  propertyName,
}: {
  scene: Scene;
  propertyName: string;
}) {
  const {player} = useApplication();
  const properties = useSubscribableValue(scene.variables.onChanged);
  const property = properties?.find(
    (p: EditableVariable) => p.name === propertyName,
  );

  const handlePreviewEnd = useCallback(() => {
    if (!property) return;
    const signal = scene.variables.getSignalRef(property.name);
    if (signal) {
      signal(property.value);
      player.requestRender();
    }
  }, [property, scene, player]);

  if (!property) {
    return null;
  }

  return (
    <Pane title="Property" id="property-inspector-pane">
      <Separator size={1} />
      <Group>
        <Label>name</Label>
        <FieldSurface>
          <span style={{padding: '0 8px', opacity: 0.6}}>{property.name}</span>
        </FieldSurface>
      </Group>
      <Group>
        <Label>type</Label>
        <FieldSurface>
          <span style={{padding: '0 8px', opacity: 0.6}}>{property.type}</span>
        </FieldSurface>
      </Group>
      <Separator size={1} />
      <Group>
        <Label>value</Label>
        <EditablePropertyField
          property={property}
          onChange={value => scene.variables.set(property.name, value)}
          onPreview={value => {
            const signal = scene.variables.getSignalRef(property.name);
            if (signal) {
              signal(value);
              player.requestRender();
            }
          }}
          onPreviewEnd={handlePreviewEnd}
        />
      </Group>
      {property.presets && property.presets.length > 0 && (
        <Group>
          <Label>presets</Label>
          <PresetPicker
            presets={property.presets}
            type={property.type}
            onSelect={value => scene.variables.set(property.name, value)}
            onPreview={value => {
              const signal = scene.variables.getSignalRef(property.name);
              if (signal) {
                signal(value);
                player.requestRender();
              }
            }}
            onPreviewEnd={handlePreviewEnd}
          />
        </Group>
      )}
    </Pane>
  );
}

function PropertyInspectorComponent() {
  const {inspection} = useApplication();
  const scenes = useScenes();
  const payload = inspection.value.payload as PropertyInspectorPayload;
  const scene = scenes.find(s => s.name === payload?.sceneName);

  if (!scene) {
    return null;
  }

  return (
    <PropertyInspectorInner scene={scene} propertyName={payload.propertyName} />
  );
}

export const PropertyInspectorConfig = {
  key: PROPERTY_INSPECTOR_KEY,
  component: PropertyInspectorComponent,
};
