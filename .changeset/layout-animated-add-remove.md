---
'@canvas-commons/2d': patch
---

`Layout.add` / `insert` / `remove` accept an optional `duration`. Without it
they behave as before; with it they return a `ThreadGenerator` that scales the
child into or out of its slot while the surrounding flex layout reflows.

```tsx
yield * row().insert(<Rect width={100} height={100} fill="red" />, 1, 0.6);
yield * row().children()[0].remove(0.6);
```
