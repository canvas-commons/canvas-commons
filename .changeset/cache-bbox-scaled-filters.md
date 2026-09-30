---
'@canvas-commons/2d': patch
'@canvas-commons/core': patch
---

Fix a blur filter or shadow on a scaled child being clipped by a cached parent,
including non-uniform scale and rotated composite roots. Add
`transformScalarPerAxis` for the extent of a scaled distance along each axis.
