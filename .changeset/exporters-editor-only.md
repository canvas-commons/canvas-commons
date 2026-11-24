---
'@canvas-commons/webcodecs': patch
'@canvas-commons/ffmpeg': patch
---

Leave the exporter client out of a production build of a project. A built
project with the WebCodecs plugin no longer includes `mediabunny`.
