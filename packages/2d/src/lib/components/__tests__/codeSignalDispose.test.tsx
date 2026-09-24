import {
  SignalContext,
  Thread,
  ThreadGenerator,
  cancel,
  waitFor,
} from '@canvas-commons/core';
import {describe, expect, it, vi} from 'vitest';
import {CodeSignal} from '../../code';
import {isCodeScope} from '../../code/CodeScope';
import {useScene2D} from '../../scenes';
import {Code} from '../Code';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {recordingTextContext} from './recordingTextContext';
import {add} from './sceneFixtures';

const Tweens: [string, (code: CodeSignal<Code>) => ThreadGenerator][] = [
  [
    'replace',
    code =>
      code.replace(
        [
          [0, 0],
          [0, 5],
        ],
        'HELLO',
        1,
      ),
  ],
  ['append', code => code.append('!', 1)],
  ['prepend', code => code.prepend('!', 1)],
];

describe('Code signal cancellation', () => {
  mockScene2D();
  mockTextContext();

  it.each(Tweens)(
    'disposes the temporary progress signal when %s is cancelled mid-tween',
    (_name, startTween) => {
      const view = useScene2D().getView();
      const node = new Code({code: 'hello world'});
      view.add(node);

      const thread = new Thread(startTween(node.code));
      thread.next();

      const scope = node.code().fragments.find(isCodeScope);
      const progress = scope?.progress;
      if (
        typeof progress !== 'function' ||
        !('context' in progress) ||
        !(progress.context instanceof SignalContext)
      ) {
        throw new Error('expected the tween to scope a progress signal');
      }
      const disposeSpy = vi.spyOn(progress.context, 'dispose');

      thread.cancel();

      expect(disposeSpy).toHaveBeenCalledTimes(1);
      expect(typeof scope?.progress).toBe('number');
    },
  );

  it.each(Tweens)(
    'keeps measuring and drawing after %s is cancelled mid-tween',
    (_name, startTween) =>
      generatorTest(function* () {
        const node = new Code({code: 'hello world'});
        add(node);

        const task = yield startTween(node.code);
        yield* waitFor(0.25);
        cancel(task);
        yield;
        // A later style change re-measures the cancelled fragment.
        node.fontSize(30);

        const size = node.size();
        const {calls, context} = recordingTextContext();
        node.render(context);

        expect(Number.isFinite(size.x)).toBe(true);
        expect(Number.isFinite(size.y)).toBe(true);
        expect(calls.length).toBeGreaterThan(0);
        for (const call of calls) {
          expect(Number.isFinite(call.x)).toBe(true);
          expect(Number.isFinite(call.y)).toBe(true);
          expect(Number.isFinite(call.globalAlpha)).toBe(true);
        }
      })(),
  );
});
