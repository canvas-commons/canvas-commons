---
'@canvas-commons/2d': minor
---

Add the edit helpers of `Code` to `Txt.text`, a `TxtSignal`: `edit`, `insert`,
`replace`, `remove`, `append` and `prepend`, with offsets into the text. An edit
changes the text at once and animates each word from where it is drawn. Add the
`Txt.transitions` property and `Txt.defaultTransitions`. Edits take optional
transitions that override both.
