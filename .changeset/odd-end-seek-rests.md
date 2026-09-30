---
'@canvas-commons/core': patch
---

Seeking at a playback speed above 1 lands exactly on the target frame and shows
the scene at that frame's time. A seek to the end of a range rests while paused
instead of re-rendering the scene on every tick.
