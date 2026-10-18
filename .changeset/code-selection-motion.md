---
'@canvas-commons/2d': minor
---

**Breaking:** `Code.oldSelection` and `Code.selectionProgress` are removed. A
`selection(value, duration)` tween that is cancelled or overlapped by another
one leaves no half state.
