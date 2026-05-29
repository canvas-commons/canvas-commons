---
'@canvas-commons/create': patch
---

declare kleur as a direct dependency so scaffolding works under pnpm's strict
node_modules layout instead of relying on npm hoisting it from prompts.
