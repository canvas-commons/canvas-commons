---
'@canvas-commons/core': patch
'@canvas-commons/2d': patch
---

Media elements follow the player's audio state, so muting the editor also mutes
them. A `Video` node now stops its element when it leaves the scene tree and
releases it from the media pool when disposed.
