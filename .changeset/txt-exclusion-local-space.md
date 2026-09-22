---
'@canvas-commons/2d': minor
---

**Breaking:** `Txt.exclusions` coordinates are now Txt-local and center-origin;
a rect's `x`/`y` is its center. `exclusions` also accepts a
`{kind: 'node', node}` entry that reads its shape from a live node.
