---
'@canvas-commons/2d': minor
---

Add `extendNode`/`onInit` for plugins to register properties, metadata
decorations, and construction hooks on existing node classes without forking
them. `dumpExtensions` inspects the resolved chain for debugging.

```ts
extendNode(
  Shape,
  {rough: {op: 'add', decorators: [initial(false), signal()]}},
  {
    identity: '@canvas-commons/rough',
  },
);
onInit(Shape, shape => shape.rough(true), {identity: '@canvas-commons/rough'});
```
