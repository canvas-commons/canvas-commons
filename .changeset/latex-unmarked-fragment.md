---
'@canvas-commons/2d': minor
---

**Breaking:** `Latex.map` indices on a formula with no marked parts address the
whole formula, which is one fragment, and no longer single glyphs. A formula
with no marked parts is one fragment, the same as `{{formula}}`. A `tex` tween
between two such formulas pairs their glyphs by identity.
