import {
  SignalContext,
  Thread,
  ThreadGenerator,
  cancel,
  waitFor,
} from '@canvas-commons/core';
import {describe, expect, it, vi} from 'vitest';
import {CodeSignal} from '../../code';
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

      const disposeSpy = vi.spyOn(SignalContext.prototype, 'dispose');
      const before = disposeSpy.mock.calls.length;
      try {
        const thread = new Thread(startTween(node.code));
        thread.next();
        thread.cancel();
        expect(disposeSpy.mock.calls.length).toBe(before + 1);
      } finally {
        disposeSpy.mockRestore();
      }
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
