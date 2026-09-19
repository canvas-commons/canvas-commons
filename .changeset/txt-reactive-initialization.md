---
'@canvas-commons/2d': patch
---

Keep the same text leaf when a `Txt` gets a reactive `text` prop, so a change to
the signal updates the leaf and does not create a new one.
