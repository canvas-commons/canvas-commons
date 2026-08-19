---
'@canvas-commons/2d': minor
---

add a `toSVG` method so each node can serialize its own geometry — shapes,
grids, images, text (including pattern fills and text along a path), and
syntax-highlighted code — letting a scene be exported as vector graphics instead
of a rasterized image. `getPathData`, a node's outline as an SVG path string, is
now public as well, so a shape's path or a layout's content box can be reused as
a clip region. Together they back the new `@canvas-commons/svg` exporter.
