---
'@canvas-commons/2d': patch
---

Concurrent-tween fixes for `<Latex>`, `<Txt>`, and `<Layout>`. `padding`,
`margin`, and `gap` tweens now compose with `size` tweens on the same node;
`Latex.tweenTex` tweens the container size alongside the fragment morph; `Txt`
text tweens stay smooth when `fontSize` animates at the same time.

`Layout.lockLayout` / `releaseLayout` replace `lockSize` / `releaseSize`.
