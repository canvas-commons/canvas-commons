/**
 * `Inspection.key` used to inspect an individual scene-graph node.
 *
 * @remarks
 * Defined in `core` (rather than `2d`, where the node inspector itself
 * lives) so other packages that can't depend on `2d` - like `editor`'s
 * timeline - can still set/read this to link UI back to a specific node.
 */
export const NODE_INSPECTOR_KEY = '@canvas-commons/2d/node-inspector';
