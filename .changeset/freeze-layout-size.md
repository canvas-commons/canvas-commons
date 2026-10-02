---
'@canvas-commons/2d': patch
---

`Layout.freezeLayout` pins the size and the flex slot of the node, so it and its
ancestors keep their size while frozen. A call during a layout animation of the
node applies when the animation ends. `Layout.thawLayout` tweens the size with
the children and keeps a size set during the freeze. `Layout.editLayout` tweens
a child that the mutator reparents under another moving child.
