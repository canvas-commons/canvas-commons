---
'@canvas-commons/2d': patch
---

Fix unbounded memory growth in text-heavy scenes. All `Txt` nodes share one
measurement canvas, and `Node.dispose` disposes the computed values of the node,
so a disposed node is not kept alive by a module-level signal such as the font
version.
