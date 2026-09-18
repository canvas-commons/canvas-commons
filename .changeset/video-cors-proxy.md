---
'@canvas-commons/2d': patch
---

`<Video>` sources are now routed through the CORS proxy, the same as `<Img>`
sources. Remote videos no longer taint the canvas when the proxy is enabled.
