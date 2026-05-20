---
'@canvas-commons/2d': patch
---

Split `layout` on `<Layout>` into `layoutSelf` (does this node participate in
its parent's flex) and `layoutChildren` (does this node lay out its own
children). Both default to `null` and fall back to `layout`, so existing code is
unaffected. `Layout.applyLayout` and `Layout.requestLayoutUpdate` are now
public.
