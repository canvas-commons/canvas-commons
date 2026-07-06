---
'@canvas-commons/2d': patch
---

Resolve property metadata and initializers through the prototype chain, so
contributions to a base class apply to its subclasses even when registered late.
Override decorators like `@initial` on a subclass now require redeclaring
`@signal()` there instead of mutating the base class's metadata.
