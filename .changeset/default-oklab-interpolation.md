---
'@canvas-commons/core': minor
---

change the default color interpolation space from `lch` to `oklab`

`lch` has a singularity at black where the hue is undefined, so fading a
saturated color to (or from) black would drift its hue and produce visibly wrong
intermediate colors. `oklab` is perceptually uniform and avoids this, giving
nicer color tweens by default.
