---
'@canvas-commons/core': patch
---

Fix `waitFor`, `loopFor`, and `tween` ending one frame early or late for
durations that are a whole number of frames.
