---
'@canvas-commons/2d': minor
---

**Breaking:** A `Code` signal holds the code its edits end with, `parsed()`
returns that code during an edit, and `CodeCursor` and `extractRange` are
removed. An edit that starts during another one starts where the code is drawn.
