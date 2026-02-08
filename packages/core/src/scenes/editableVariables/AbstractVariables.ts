import {ValueDispatcher} from '../../events';
import {createSignal, SimpleSignal} from '../../signals';
import type {PossibleBBox} from '../../types/BBox';
import {BBox} from '../../types/BBox';
import type {PossibleVector2} from '../../types/Vector';
import {Vector2} from '../../types/Vector';
import type {EditableVariable, VariableType} from './EditableVariable';

/**
 * Shared base for {@link EditableVariables} and {@link ReadOnlyVariables}.
 *
 * @remarks
 * Contains the common signal management, transform/offset maps, and value
 * normalization logic. Subclasses implement `register`, `set`, and lifecycle
 * hooks specific to their context (editor vs. player/presenter).
 */
export abstract class AbstractVariables {
  public get onChanged() {
    return this.properties.subscribable;
  }

  protected readonly properties = new ValueDispatcher<EditableVariable[]>([]);
  protected signals: Record<string, SimpleSignal<unknown>> = {};
  protected externalVariables: Record<string, unknown> = {};
  protected signalRefs = new Map<string, SimpleSignal<unknown>>();
  protected transforms = new Map<string, () => DOMMatrix>();
  protected offsets = new Map<
    string,
    (value: unknown) => {x: number; y: number}
  >();

  public get<T>(name: string, initial: T): () => T {
    this.signals[name] ??= createSignal<unknown>(
      this.externalVariables[name] ?? initial,
    );
    return () => this.signals[name]() as T;
  }

  public updateSignals(variables: Record<string, unknown>) {
    this.externalVariables = variables;
    for (const [name, value] of Object.entries(variables)) {
      if (name in this.signals) {
        this.signals[name](value);
      }
      const ref = this.signalRefs.get(name);
      if (ref) {
        ref(value);
      }
    }
  }

  public getSignalRef(name: string): SimpleSignal<unknown> | undefined {
    return this.signalRefs.get(name);
  }

  public setSignalRef(
    name: string,
    signal: SimpleSignal<unknown>,
    transform?: () => DOMMatrix,
    offset?: (value: unknown) => {x: number; y: number},
  ) {
    this.signalRefs.set(name, signal);
    if (transform) {
      this.transforms.set(name, transform);
    }
    if (offset) {
      this.offsets.set(name, offset);
    }
  }

  public getTransform(name: string): (() => DOMMatrix) | undefined {
    return this.transforms.get(name);
  }

  public getOffset(
    name: string,
  ): ((value: unknown) => {x: number; y: number}) | undefined {
    return this.offsets.get(name);
  }

  protected normalizeValue(type: VariableType, value: unknown): unknown {
    switch (type) {
      case 'vector2': {
        const v = new Vector2(value as PossibleVector2);
        return v.serialize();
      }
      case 'bbox': {
        const b = new BBox(value as PossibleBBox);
        return b.serialize();
      }
      default:
        return value;
    }
  }
}
