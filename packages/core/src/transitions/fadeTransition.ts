import {createSignal} from '../signals/index.js';
import {ThreadGenerator} from '../threading/index.js';
import {useTransition} from './useTransition.js';

/**
 * Perform a transition that fades between the scenes.
 *
 * @param duration - The duration of the transition.
 */
export function* fadeTransition(duration = 0.6): ThreadGenerator {
  const progress = createSignal(0);
  const endTransition = useTransition(ctx => {
    ctx.globalAlpha = progress();
  });

  yield* progress(1, duration);
  endTransition();
}
