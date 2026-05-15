import type {ThreadGenerator} from '../threading/index.js';
import {useScene} from './useScene.js';
import {useThread} from './useThread.js';

export function* beginSlide(name: string): ThreadGenerator {
  const {slides} = useScene();
  const thread = useThread();
  slides.register(name, thread.fixed);
  yield;

  while (slides.shouldWait(name)) {
    yield;
  }
}
