---
'@canvas-commons/2d': patch
---

Fix `add()`, `insert()`, and `children()` keeping a node twice in the same
parent. A node that is already a child moves to the requested position and
appears once.
