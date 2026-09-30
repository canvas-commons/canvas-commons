---
'@canvas-commons/2d': patch
---

SVG draws the valid elements when another element cannot be built. An
unsupported paint such as a gradient is ignored, and a `polygon` or `polyline`
without points or a `use` without a valid `href` is skipped, each with a
warning.
