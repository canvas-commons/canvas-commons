---
'@canvas-commons/2d': patch
---

`Layout.morphTo` and `Node.transitionTo` add their position correction to the
own `translate` or position of the siblings they shift, and give that value back
unchanged afterwards, including reactive bindings.
