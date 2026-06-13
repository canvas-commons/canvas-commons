---
'@canvas-commons/2d': patch
---

Fix `Txt` unit queries (`textWords`, `textGlyphs`, `textSentences`) on justified
lines to follow the word-by-word paint instead of a cumulative measure across
the fragment, which had folded in inter-word kerning the renderer never applies.
Sentence units also distribute justification slack per interior whitespace run.
Separately, guard `Txt`'s construction-time layout so it never marks a
measure-less yoga node dirty (which aborted yoga's WASM in the browser).
