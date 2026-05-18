import {SignalValue, SimpleSignal, textLerp} from '@canvas-commons/core';
import {
  computed,
  initial,
  interpolation,
  nodeName,
  signal,
} from '../decorators';
import {Node, NodeProps} from './Node';
import {Txt} from './Txt';

export interface TxtLeafProps extends NodeProps {
  children?: string;
  text?: SignalValue<string>;
}

/**
 * A leaf text node that holds text content.
 *
 * @remarks
 * `TxtLeaf` does not render itself. The closest ancestor {@link Txt} owns all
 * text layout and rendering via Pretext's inline-flow engine. `TxtLeaf` serves
 * as a lightweight container whose `text` value feeds into the parent's layout
 * computation. Styles (fill, stroke, font, etc.) are inherited from the parent
 * `Txt`.
 */
@nodeName('TxtLeaf')
export class TxtLeaf extends Node {
  @initial('')
  @interpolation(textLerp)
  @signal()
  declare public readonly text: SimpleSignal<string, this>;

  public constructor({children, ...rest}: TxtLeafProps) {
    super(rest);
    if (children) {
      this.text(children);
    }
  }

  @computed()
  public parentTxt(): Txt | null {
    const parent = this.parent();
    return parent instanceof Txt ? parent : null;
  }
}
