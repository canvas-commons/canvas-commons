---
'@canvas-commons/2d': minor
---

Add `wrapMode`, `hyphenate` and `overflowWrap` to `<Txt>` — opt into Knuth-Plass
line breaking and bring-your-own soft-hyphen insertion.
`overflowWrap={'anywhere'}` breaks a word wider than the line at any grapheme;
the default `'normal'` keeps it whole, as CSS `overflow-wrap` does.
