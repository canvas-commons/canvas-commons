---
'@canvas-commons/vite-plugin': minor
---

Add the `loadIn` option to define where the `entryPoint` of a Vite plugin loads.
`'editor'` only loads in the editor and renderer. `'project'` also bundles it
into built projects. An empty value will warn and default to `'editor'`.

```ts
[PLUGIN_OPTIONS]: {
  entryPoint: 'my-plugin/client',
  loadIn: 'project',
},
```
