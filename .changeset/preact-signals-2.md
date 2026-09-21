---
'@canvas-commons/2d': patch
'@canvas-commons/editor': patch
---

Upgrade `@preact/signals` to v2. `useSignalEffect` callbacks re-run on the next
animation frame, and signal-to-DOM bindings in JSX update after the Preact
render pass. An editor plugin that reads the DOM or subscribes to an event right
after it writes a signal must wait a frame.
