---
'@canvas-commons/2d': patch
---

Knuth-Plass wrapping no longer plans a last line, or any line of text that is
not justified, wider than the node. A word wider than the node now gets its own
line instead of collapsing the whole paragraph onto one line.
