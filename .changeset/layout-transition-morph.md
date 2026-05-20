---
'@canvas-commons/2d': patch
---

Add `Node.transitionTo(newParent, [index,] duration)` and
`Node.morphTo(other, duration)`. `transitionTo` reparents a node while tweening
its world position, rotation, and opacity from the old slot to the new one.
`morphTo` cross-fades into a separate destination node.

```tsx
yield * card.transitionTo(grid, 0, 0.6);
yield * button.morphTo(modal, 0.4);
```
