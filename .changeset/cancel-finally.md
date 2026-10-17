---
'@canvas-commons/core': patch
---

Run the `finally` blocks of all descendant tasks when a task is canceled.
Cleanup in a `finally` block must not yield; a yield there is skipped with a
warning.
