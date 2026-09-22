---
'@canvas-commons/2d': minor
---

Add `exclusions` to `<Txt>` — rect, polygon and node regions that text flows
around, CSS `shape-outside`-style. Coordinates are Txt-local and center-origin;
a rect's `x`/`y` is its center. A `{kind: 'node', node}` entry reads its shape
from a live node. A flex layout may place the text, the node, or both. A node
that this text's own flow places throws.
