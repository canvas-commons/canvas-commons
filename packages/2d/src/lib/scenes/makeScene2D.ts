import {
  createSceneMetadata,
  DescriptionOf,
  ThreadGeneratorFactory,
} from '@canvas-commons/core';
import type {View2D} from '../components';
import {Scene2D} from './Scene2D';

export function makeScene2D(
  runner: ThreadGeneratorFactory<View2D>,
): DescriptionOf<Scene2D> {
  return {
    klass: Scene2D,
    config: runner,
    stack: new Error().stack,
    meta: createSceneMetadata(),
    plugins: ['@canvas-commons/2d/editor'],
  };
}
