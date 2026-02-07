import {MetaField, ObjectMetaField} from '../meta';
import type {SerializedVariable} from './editableVariables';
import {Random} from './Random';
import type {SerializedTimeEvent} from './timeEvents';

/**
 * Create a runtime representation of the scene metadata.
 */
export function createSceneMetadata() {
  return new ObjectMetaField('scene', {
    version: new MetaField('version', 1),
    timeEvents: new MetaField<SerializedTimeEvent[]>('time events', []),
    seed: new MetaField('seed', Random.createSeed()),
    properties: new MetaField<SerializedVariable[]>('properties', []),
  });
}

/**
 * A runtime representation of the scene metadata.
 */
export type SceneMetadata = ReturnType<typeof createSceneMetadata>;
