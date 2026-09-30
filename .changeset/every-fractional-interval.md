---
'@canvas-commons/core': patch
---

Fix `every()` ticking slower than its interval when the interval is not a whole
number of frames. The tick rate does not depend on the frame rate, and a timer
whose interval is shortened does not fire catch-up ticks.
