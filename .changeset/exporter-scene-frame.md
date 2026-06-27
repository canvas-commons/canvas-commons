---
'@canvas-commons/core': minor
---

add an optional `handleSceneFrame` hook to the `Exporter` interface so exporters
can read the scene tree directly instead of a rasterized canvas, enabling vector
backends such as SVG or Lottie.
