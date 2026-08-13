---
'@canvas-commons/2d': patch
---

`Code` nodes measure text with the measurement canvas that `Txt` uses, so a
scene that makes many `Code` nodes does not collect one canvas per node.
