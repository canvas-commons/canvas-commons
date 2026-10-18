---
'@canvas-commons/2d': minor
---

`Latex.edit` and `Latex.replace` take the `insert`, `remove` and `replace`
fragments of `Code`. They animate with the `fragmentTransition` of the node, and
an `insert` in `Latex.replace` adds its fragment at the end of the formula.
