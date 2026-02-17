import {PlaybackState, SimpleSignal} from '@canvas-commons/core';
import {initial, signal} from '../decorators';
import {nodeName} from '../decorators/nodeName';
import {useScene2D} from '../scenes/useScene2D';
import type {Node} from './Node';
import {Rect, RectProps} from './Rect';

export interface View2DProps extends RectProps {
  assetHash: string;
}

@nodeName('View2D')
export class View2D extends Rect {
  @initial(PlaybackState.Paused)
  @signal()
  public declare readonly playbackState: SimpleSignal<PlaybackState, this>;

  @initial(0)
  @signal()
  public declare readonly globalTime: SimpleSignal<number, this>;

  @signal()
  public declare readonly assetHash: SimpleSignal<string, this>;

  public constructor(props: View2DProps) {
    super({
      composite: true,
      ...props,
    });
    this.view2D = this;
    this.applyFlex();
  }

  public override dispose() {
    this.removeChildren();
    super.dispose();
  }

  public override render(context: CanvasRenderingContext2D) {
    this.computedSize();
    this.computedPosition();
    super.render(context);
  }

  /**
   * Find a node by its key.
   *
   * @param key - The key of the node.
   */
  public findKey<T extends Node = Node>(key: string): T | null {
    return (useScene2D().getNode(key) as T) ?? null;
  }

  protected override requestLayoutUpdate() {
    this.updateLayout();
    const size = this.desiredSize();
    this.yogaNode.calculateLayout(
      typeof size.x === 'number' ? size.x : undefined,
      typeof size.y === 'number' ? size.y : undefined,
    );
  }

  protected override requestFontUpdate() {
    this.applyFont();
  }

  public override view(): View2D {
    return this;
  }
}
