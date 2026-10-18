---
'@canvas-commons/core': patch
---

Run the `finally` blocks of all descendant tasks when a task is canceled. A
yield in a `finally` block is skipped with a warning.
