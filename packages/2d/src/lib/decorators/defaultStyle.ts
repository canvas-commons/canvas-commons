import {capitalize} from '@canvas-commons/core';
import {Layout} from '../components';

export function defaultStyle<T>(initial?: T): PropertyDecorator {
  return (target: any, key) => {
    target[`getDefault${capitalize(<string>key)}`] = function (this: Layout) {
      const parent = this.parentTransform();
      if (
        parent &&
        this.layoutSelf() !== false &&
        parent.layoutChildrenEnabled()
      ) {
        return (parent as any)[key]();
      }

      return initial;
    };
  };
}
