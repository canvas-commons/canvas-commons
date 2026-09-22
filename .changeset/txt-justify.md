---
'@canvas-commons/2d': minor
---

Add `textAlign={'justify'}` and a `verticalAlign` signal to `<Txt>` — justify
distributes line slack across word gaps and leaves a line that ends on a manual
newline at its natural width, as CSS does; `verticalAlign` lines text up to the
top, middle, or bottom of its box. A line wider than its box starts at its start
edge and overflows past the other, whatever the alignment, as in CSS.
