---
'@canvas-commons/2d': minor
---

Flex items now keep room for their content: a squeezed `<Txt>` in a row stops at
its widest word, a container stops at its children, and an item of a column
keeps the height of its lines instead of overlapping the next one. Set
`overflowWrap` to `'anywhere'` or `minWidth`/`minHeight` to `0` to squeeze
again.
