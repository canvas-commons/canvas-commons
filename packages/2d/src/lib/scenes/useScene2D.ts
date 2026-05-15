import {useScene} from '@canvas-commons/core';
import type {Scene2D} from './Scene2D.js';

export function useScene2D(): Scene2D {
  return <Scene2D>useScene();
}
