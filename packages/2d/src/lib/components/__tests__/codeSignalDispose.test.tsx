import {SignalContext, Thread} from '@canvas-commons/core';
import {describe, expect, it, vi} from 'vitest';
import {CodeSignal} from '../../code';
import {useScene2D} from '../../scenes';
import {Code} from '../Code';
import {mockScene2D} from './mockScene2D';

describe('Code signal cancellation', () => {
  mockScene2D();

  it.each([
    [
      'replace',
      (code: CodeSignal<Code>) =>
        code.replace(
          [
            [0, 0],
            [0, 5],
          ],
          'HELLO',
          1,
        ),
    ],
    ['append', (code: CodeSignal<Code>) => code.append('!', 1)],
    ['prepend', (code: CodeSignal<Code>) => code.prepend('!', 1)],
  ])(
    'disposes the temporary progress signal when %s is cancelled mid-tween',
    (_name, startTween) => {
      const view = useScene2D().getView();
      const node = (<Code code={'hello world'} />) as Code;
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
});
