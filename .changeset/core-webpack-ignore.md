---
'@canvas-commons/core': patch
---

Stop webpack from resolving the dynamic plugin import, which removes its
critical dependency warning.
