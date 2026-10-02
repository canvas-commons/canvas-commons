---
'@canvas-commons/2d': patch
---

`Layout.transitionTo` tweens scale and lands in the exact place a plain insert
would when the destination is not a flex container and has its own transform.
