import {
  BBox,
  PlaybackState,
  SimpleSignal,
  createMotionStack,
  createSignalMap,
  map,
} from '@canvas-commons/core';
import {computed, initial, signal} from '../decorators';
import {nodeName} from '../decorators/nodeName';
import {useScene2D} from '../scenes/useScene2D';
import type {Layout} from './Layout';
import type {BoxOffset, LayoutFlight, LayoutPin} from './layoutMotion';
import type {Node} from './Node';
import {Rect, RectProps} from './Rect';

export interface View2DProps extends RectProps {
  assetHash: string;
}

@nodeName('View2D')
export class View2D extends Rect {
  @initial(PlaybackState.Paused)
  @signal()
  declare public readonly playbackState: SimpleSignal<PlaybackState, this>;

  @initial(0)
  @signal()
  declare public readonly globalTime: SimpleSignal<number, this>;

  @signal()
  declare public readonly assetHash: SimpleSignal<string, this>;

  /** The offsets of the nodes in a layout transition. */
  public readonly boxOffsets = createMotionStack<Node, BoxOffset>();

  /** The nodes this view draws above its children in a transition. */
  public readonly flights = createSignalMap<Node, LayoutFlight>();

  /** The scale of each child that enters or leaves a layout: 0 is out, 1 is in. */
  public readonly presences = createSignalMap<Layout, SimpleSignal<number>>();

  /** The box each leaving child keeps, from the center of its flex parent. */
  public readonly exits = createSignalMap<Layout, BBox>();

  /** The pin of each layout that `freezeLayout` holds. */
  public readonly pins = createSignalMap<Layout, LayoutPin>();

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

  /** Add `offset` to `node` and answer the call that takes it away. */
  public offsetNode(node: Node, offset: BoxOffset): () => void {
    return this.boxOffsets.push(node, offset);
  }

  protected override draw(context: CanvasRenderingContext2D) {
    super.draw(context);
    for (const node of this.flights.keys()) {
      const flight = this.flights.get(node);
      const parent = node.parent();
      if (!flight || !parent) {
        continue;
      }
      const matrix = this.worldToLocal().multiply(parent.localToWorld());
      context.save();
      context.transform(
        matrix.a,
        matrix.b,
        matrix.c,
        matrix.d,
        matrix.e,
        matrix.f,
      );
      context.globalAlpha *=
        map(flight.opacity, parent.absoluteOpacity(), flight.progress()) /
        this.opacity();
      node.render(context);
      context.restore();
    }
  }

  /** Whether a node of this view is in a layout transition. */
  @computed()
  public layoutTransition(): boolean {
    return (
      this.boxOffsets.size() > 0 ||
      this.presences.size() > 0 ||
      this.pins.size() > 0
    );
  }

  @computed()
  protected override requestLayoutUpdate(): boolean {
    const size = this.desiredSize();
    this.calculateRootLayout(
      typeof size.x === 'number' ? size.x : undefined,
      typeof size.y === 'number' ? size.y : undefined,
    );
    return this.layoutTransition();
  }

  protected override requestFontUpdate() {
    this.applyFont();
  }

  public override view(): View2D {
    return this;
  }
}
