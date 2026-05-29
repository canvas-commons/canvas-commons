---
'@canvas-commons/vite-plugin': patch
---

dedupe preact and pre-bundle mathjax-full so consumer dev servers don't crash on
duplicate preact copies or unresolved CommonJS exports.
