---
'@canvas-commons/2d': patch
---

Setting `scale.abs`, `scale.view`, or `scale.relativeTo` on a node rotated
inside a non-uniformly scaled parent lands on the value that the same space
reads back, so `reparent` keeps such a node's shape.
