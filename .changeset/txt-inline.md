---
'@canvas-commons/2d': minor
---

Add support for inline non-text children inside `<Txt>` — direct `Layout`
children are placed in the text flow as atomic slots sized by their own `width`
/ `height`, and a line may break on either side of one, as beside a replaced
element in CSS.
