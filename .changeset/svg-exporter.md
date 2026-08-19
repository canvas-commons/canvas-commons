---
'@canvas-commons/svg': minor
---

add `@canvas-commons/svg`, a new exporter that saves your scene as a standalone
SVG instead of a rasterized image — ideal for vector-friendly content like logos
and diagrams. It faithfully reproduces transforms, opacity, gradients, clip
paths, blend modes, filters, drop shadows, and the project background, and can
optionally embed the page's web fonts so exported text renders correctly
anywhere. Animated scenes export one SVG per frame.
