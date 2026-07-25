---
'@canvas-commons/2d': patch
---

Fix `<Latex>` fragments claiming glyphs that belong to a neighbouring fragment
when MathJax does not emit their own contiguously, and repair fragments that a
split leaves without the argument or the `\end` their commands need instead of
reporting them as invalid MathJax.
