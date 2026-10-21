---
'@canvas-commons/core': patch
'@canvas-commons/ffmpeg': patch
---

Finish image sequence and FFmpeg exports as soon as the server confirms the last
frames, instead of polling once per second.
