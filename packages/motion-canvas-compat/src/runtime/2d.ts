import {Layout, addPropAliases} from '@canvas-commons/2d';

addPropAliases(Layout.prototype, {
  offset: 'anchor',
  offsetX: 'anchorX',
  offsetY: 'anchorY',
});

export * from '@canvas-commons/2d';
