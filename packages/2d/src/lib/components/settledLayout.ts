import type {Layout} from './Layout';

/** A yoga box as a finished pass left it, in its parent's top-left space. */
export type SettledBox = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/**
 * The box each node of a layout root had when a yoga pass of the root
 * finished. A measurement inside the next pass reads these, so every node it
 * reads comes from the same finished pass. The first pass of a layout reads
 * none.
 */
export const SettledBoxes = new WeakMap<Layout, SettledBox>();

/** A node whose measurement may read {@link SettledBoxes}. */
export type LayoutSettler = {
  /** Whether the node's measurement reads the settled boxes now. */
  reads(): boolean;
  /**
   * Mark the node dirty and answer true when the boxes it read have moved
   * since it measured.
   */
  settle(): boolean;
};

export const LayoutSettlers = new WeakMap<Layout, LayoutSettler>();
