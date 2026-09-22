import type {Layout} from './Layout';

/**
 * Content floor of each node that lays out text itself, which the layout that
 * sizes the node reads in place of its children's.
 */
export const ContentFloors = new WeakMap<Layout, () => number>();
