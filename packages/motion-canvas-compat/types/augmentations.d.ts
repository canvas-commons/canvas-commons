import type {
  PossibleVector2,
  SignalValue,
  Vector2Signal,
} from '@canvas-commons/core';

declare module '@canvas-commons/2d' {
  interface LayoutProps {
    offset?: SignalValue<PossibleVector2>;
    offsetX?: SignalValue<number>;
    offsetY?: SignalValue<number>;
  }

  interface Layout {
    readonly offset: Vector2Signal<this>;
  }
}
