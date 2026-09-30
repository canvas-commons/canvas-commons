---
'@canvas-commons/2d': patch
---

Fix `Camera.clone`, `snapshotClone`, and `reactiveClone` so the copy renders its
own copy of the scene at the same zoom and the original camera keeps rendering.
`Camera` keeps a `scale` given in its props or in a clone override.
