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

Text breaks and spaces as CSS does: a CRLF is one line break, a space or tab
next to a line break is dropped, and a space at a soft wrap hangs past the line,
so a wrapped `<Txt>` shrink-wraps to its ink. Runs of different sizes on one
line share one baseline, and a word that a colour or font change cuts keeps the
kerning of the whole word.

A nested `<Txt>` no longer lays out its own text: its `size()` is the extent of
the text it paints in the root paragraph, across every line it wraps onto, not
the size of its text set alone on one line. It ignores `width`, `height` and
`padding`, and its `textLines()`, `textWords()` and `split()` read the root's
layout.
