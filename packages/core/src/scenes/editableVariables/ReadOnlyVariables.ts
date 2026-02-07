import type {Scene} from '../Scene';
import type {Variables} from '../Variables';
import {AbstractVariables} from './AbstractVariables';
import type {VariableType} from './EditableVariable';

/**
 * Manages editable variables during rendering and presentation.
 *
 * @remarks
 * Values are read-only: external overrides via {@link updateSignals} take
 * precedence, followed by persisted `.meta` values, then defaults. The
 * {@link set} method is a no-op because there is no editor to persist changes.
 */
export class ReadOnlyVariables extends AbstractVariables implements Variables {
  private lookup = new Map<string, unknown>();

  public constructor(private readonly scene: Scene) {
    super();
    scene.onReloaded.subscribe(this.handleReload);
    scene.onReset.subscribe(this.handleReset);
  }

  public set() {
    // no-op: read-only in player/presenter
  }

  public register<T>(name: string, type: VariableType, defaultValue: T): T {
    let value = this.lookup.get(name);
    if (value === undefined) {
      const external = this.externalVariables[name];
      if (external !== undefined) {
        value = this.normalizeValue(type, external);
      } else {
        const property = this.scene.meta.properties
          .get()
          .find(p => p.name === name);
        value = property
          ? this.normalizeValue(type, property.value)
          : this.normalizeValue(type, defaultValue);
      }
      this.lookup.set(name, value);
    }

    return value as T;
  }

  private handleReload = () => {
    this.lookup.clear();
    this.signalRefs.clear();
    this.transforms.clear();
    this.offsets.clear();
    this.signals = {};
  };

  private handleReset = () => {
    this.signals = {};
  };
}
