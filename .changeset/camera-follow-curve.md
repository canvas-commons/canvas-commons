---
'@canvas-commons/2d': patch
---

Fix `Camera.followCurve` and its variants so the camera follows the curve in the
scene's coordinate space, whether the curve is inside the camera, elsewhere in
the view, or detached from the tree.
