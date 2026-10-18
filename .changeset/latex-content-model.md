---
'@canvas-commons/2d': minor
---

**Breaking:** The protected `Latex` members `texToSvg`, `parseSVG` and
`buildShape` are removed, `tweenTex` changes, and fades run in the first and
last 30% of the eased progress. A `Latex` node holds the formula its tweens end
with, a tween that starts during another one starts where the glyphs are drawn,
and `fragmentTransition` takes `LatexTransitions` hooks.
