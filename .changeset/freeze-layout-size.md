---
'@canvas-commons/2d': patch
---

`Layout.freezeLayout` pins the size and the flex slot of the node.
`Layout.thawLayout` releases them and tweens the size together with the
children. A size set during the freeze is kept.
