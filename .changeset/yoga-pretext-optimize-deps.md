---
'@canvas-commons/vite-plugin': patch
---

Pre-bundle `yoga-layout` and `@chenglou/pretext` so the dev-time dep optimizer
doesn't discover them mid-session and force a page reload.
