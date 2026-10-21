---
'@canvas-commons/2d': minor
---

**Breaking:** The protected `Layout.runFreezeThawTween` is removed, and
`freezeLayout` keeps flex on: the children are pinned and the layout keeps its
frozen size until `thawLayout`. Layout transitions compose and each decays on
its own: `editLayout`, animated `insert`, `add` and `remove`, `freezeLayout`,
`thawLayout`, `reparent`, `transitionTo` and `morphTo`.
