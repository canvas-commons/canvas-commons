---
'@canvas-commons/2d': minor
---

Add `Txt.split(granularity)` — explode a text node into one standalone,
style-matched `Txt` per grapheme, word, or sentence, each positioned to
reproduce the source render exactly (kerning included) so the pieces can be
animated independently.
