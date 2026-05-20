---
'@canvas-commons/2d': patch
---

Add `translate` to `<Layout>` — a `Vector2Signal` (with `translateX` /
`translateY` props) that visually offsets the node without disturbing siblings,
analogous to CSS `transform: translate()`.
