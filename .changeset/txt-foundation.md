---
'@canvas-commons/2d': minor
---

Replace DOM-based layout and text with Yoga and Pretext.

**Breaking:** `View2D.shadowRoot` and `Layout.element` / `Layout.styles` are
removed; use `Layout.yogaNode` and `getDomContainer()` (for SVG / arc
measurement) instead. `TxtLeaf` now extends `Node`, not `Shape` — direct
`<TxtLeaf>` styling no longer applies; styles cascade from the enclosing
`<Txt>`. `FlexBasis` / `LengthLimit` drop the unsupported content-keyword
variants, `FlexContent` adds `'normal'`, `FlexItems` adds `'auto'`, and
`textWrap` now defaults to `true` so width-bounded `<Txt>` wraps without opt-in.
