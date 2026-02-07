import type {Scene} from '../Scene';
import type {Variables} from '../Variables';
import {AbstractVariables} from './AbstractVariables';
import type {
  EditableVariable,
  VariableOptions,
  VariableType,
} from './EditableVariable';
import type {SerializedVariable} from './SerializedVariable';

/**
 * Manages editable variables during editing.
 *
 * @remarks
 * Merges simple key-value variable signals with typed, persisted, editor-UI
 * editable variables into a single implementation.
 */
export class EditableVariables extends AbstractVariables implements Variables {
  private registeredProperties = new Map<string, EditableVariable>();
  private lookup = new Map<string, EditableVariable>();
  private collisionLookup = new Set<string>();
  private previousReference: SerializedVariable[] = [];
  private didPropertiesChange = false;

  public constructor(private readonly scene: Scene) {
    super();
    this.previousReference = scene.meta.properties.get();
    this.load(this.previousReference);

    scene.onReloaded.subscribe(this.handleReload);
    scene.onRecalculated.subscribe(this.handleRecalculated);
    scene.onReset.subscribe(this.handleReset);
    scene.meta.properties.onChanged.subscribe(this.handleMetaChanged, false);
  }

  public set(name: string, value: unknown) {
    const property = this.lookup.get(name);
    if (!property) {
      return;
    }

    const updated: EditableVariable = {
      ...property,
      value: this.normalizeValue(property.type, value),
    };
    this.lookup.set(name, updated);
    this.registeredProperties.set(name, updated);
    this.properties.current = [...this.registeredProperties.values()];
    this.didPropertiesChange = true;
    this.scene.reload();
  }

  public register<T>(
    name: string,
    type: VariableType,
    defaultValue: T,
    initialTime: number,
    options?: VariableOptions<T>,
  ): T {
    if (this.collisionLookup.has(name)) {
      this.scene.logger.error({
        message: `Variable name "${name}" has already been used for another editable variable.`,
        stack: new Error().stack,
      });
      return defaultValue;
    }

    const normalizedDefault = this.normalizeValue(type, defaultValue) as T;

    this.collisionLookup.add(name);
    let property = this.lookup.get(name);
    if (!property) {
      this.didPropertiesChange = true;
      property = {
        name,
        type,
        value: normalizedDefault,
        defaultValue: normalizedDefault,
        initialTime,
        stack: new Error().stack,
        presets: options?.presets,
        hidden: options?.hidden,
      };
      this.lookup.set(name, property);
    } else {
      let changed = false;
      const newProperty = {...property};

      newProperty.stack = new Error().stack;

      if (newProperty.type !== type) {
        newProperty.type = type;
        changed = true;
      }

      if (newProperty.defaultValue !== normalizedDefault) {
        newProperty.defaultValue = normalizedDefault;
        changed = true;
      }

      if (newProperty.initialTime !== initialTime) {
        newProperty.initialTime = initialTime;
        changed = true;
      }

      newProperty.presets = options?.presets;
      newProperty.hidden = options?.hidden;

      if (changed) {
        property = newProperty;
        this.lookup.set(name, property);
      }
    }

    this.registeredProperties.set(name, property);

    return property.value as T;
  }

  private handleReload = () => {
    this.registeredProperties.clear();
    this.collisionLookup.clear();
    this.signalRefs.clear();
    this.transforms.clear();
    this.offsets.clear();
    this.signals = {};
  };

  private handleRecalculated = () => {
    this.properties.current = [...this.registeredProperties.values()];

    if (
      this.didPropertiesChange ||
      (this.previousReference?.length ?? 0) !== this.properties.current.length
    ) {
      this.didPropertiesChange = false;
      this.previousReference = [...this.registeredProperties.values()].map(
        property => ({
          name: property.name,
          type: property.type,
          value: property.value,
          initialTime: property.initialTime,
        }),
      );
      this.scene.meta.properties.set(this.previousReference);
    }
  };

  private handleReset = () => {
    this.collisionLookup.clear();
  };

  private handleMetaChanged = (data: SerializedVariable[]) => {
    if (data === this.previousReference) return;
    this.previousReference = data;
    this.load(data);
    this.scene.reload();
  };

  private load(properties: SerializedVariable[]) {
    for (const property of properties) {
      if (typeof property.name !== 'string') {
        continue;
      }

      const normalized = this.normalizeValue(property.type, property.value);
      const previous = this.lookup.get(property.name);
      this.lookup.set(property.name, {
        name: property.name,
        type: property.type,
        value: normalized,
        defaultValue: previous?.defaultValue ?? normalized,
        initialTime: property.initialTime ?? previous?.initialTime ?? 0,
        stack: previous?.stack,
        presets: previous?.presets,
        hidden: previous?.hidden,
      });
    }
  }
}
