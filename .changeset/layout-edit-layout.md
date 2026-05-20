---
'@canvas-commons/2d': patch
---

Add `Layout.editLayout(duration, mutator)` to animate a batch of layout
properties (`direction`, `wrap`, `alignItems`, `padding`, `gap`, …) as one
tween. Children glide from their pre-mutation positions to wherever the
post-mutation layout places them.

```tsx
yield *
  row().editLayout(0.3, n => {
    n.direction('column');
    n.alignItems('end');
  });
```
