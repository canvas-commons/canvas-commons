---
'@canvas-commons/core': patch
---

Fix `cancel()` and `join()` ignoring tasks from `spawn()` when called from a
nested thread or on the same frame, `any()` without tasks never ending, and
`join(false, ...)` waiting for a finished task.
