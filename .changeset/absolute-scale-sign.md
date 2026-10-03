---
'@canvas-commons/2d': minor
---

**Breaking:** `scale.abs()` and `absoluteScale` return a negative `y` for a
mirrored transform and no longer include the node's own skew. `reparent` keeps a
mirrored node in place.
