---
'@canvas-commons/2d': patch
---

Add `Layout.freezeLayout` / `thawLayout`. `freezeLayout` snaps children to their
current visual positions and turns `layoutChildren` off so they can be animated
by hand; `thawLayout` turns it back on and tweens children to their flex slots.

```tsx
row().freezeLayout();
yield * row().children()[0].position.x(-200, 1).back(1);
yield * row().thawLayout(0.3);
```
