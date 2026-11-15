---
'@canvas-commons/core': patch
---

Audio plays from decoded buffers against a master render clock. Playback no
longer seeks an element every frame, so a changed playback speed no longer
produces a seek storm, and a slow render loop drops frames instead of slowing
the audio down.
