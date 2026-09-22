---
'@canvas-commons/2d': minor
---

Add `autoSize` to `<Txt>` — when enabled with a fixed `width` and `height`, the
text takes the largest whole-pixel size at or below `fontSize` whose layout fits
the box. A line beside an exclusion has to fit the band the exclusion leaves, so
there the size can be smaller than one that fits the box alone.
