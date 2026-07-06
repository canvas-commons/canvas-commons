---
'@canvas-commons/core': minor
---

Add `SignalContext.extend` for swapping a signal's getter, setter, or tweener
after construction. Add the `interpolators` registry: named interpolators back
default tweens before `deepLerp`, and registered factories like
`Vector2.createPolarLerp` produce functions carrying `{id, params}` descriptors.
