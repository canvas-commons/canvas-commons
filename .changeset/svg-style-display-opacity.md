---
'@canvas-commons/2d': patch
---

SVG applies `<style>` element rules in selector specificity order, including
rules on the root `svg` element and selector lists inside `:is()`. It skips
elements with `display: none` and multiplies group opacity into the opacity of
its children. A selector the browser cannot match is skipped with a warning.
