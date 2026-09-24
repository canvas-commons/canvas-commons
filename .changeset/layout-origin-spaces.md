---
'@canvas-commons/2d': minor
---

Components of position, scale, and layout origin signals reach the coordinate
spaces: `node.x.abs(value, 1)`, `node.right.x.view(value, 1)`.
`relativeTo(node)` on layout origin signals (`left`, `right`, ...) returns the
curried signal that its type declares. Layout origin `abs` and `view` give the
correct point for nodes that are not at the origin of their parent.

`position.relativeTo(node)` and layout origin `relativeTo(node)` read and set a
point in `node`'s local space, so the anchor, rotation, and scale of `node`
apply. For the previous offset in world axes, use
`a.position.abs().sub(b.position.abs())`.
