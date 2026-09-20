---
'@canvas-commons/2d': patch
---

`Code.code`'s `replace`, `append`, and `prepend` tweens dispose their temporary
progress signal even when the tween is cancelled partway through.
