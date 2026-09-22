import {describe, expect, it} from 'vitest';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Txt} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {recordingTextContext} from './recordingTextContext';
import {add, lineTexts} from './sceneFixtures';

class Probe extends Txt {
  public probeDraw(context: CanvasRenderingContext2D) {
    this.draw(context);
  }
}

describe('Txt in a flex row', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(10);

  it('wraps at a resolved width of zero', () => {
    const probe = new Probe({
      text: 'abc',
      overflowWrap: 'anywhere',
      fontSize: 10,
      lineHeight: 20,
      minWidth: 0,
    });
    add(
      <Layout layout width={100}>
        <Rect width={100} height={10} shrink={0} />
        {probe}
      </Layout>,
    );
    const {calls, context} = recordingTextContext();
    probe.probeDraw(context);

    expect(probe.width()).toBe(0);
    expect(lineTexts(probe)).toEqual(['a', 'b', 'c']);
    expect(calls.map(call => call.text)).toEqual(['a', 'b', 'c']);
    expect(new Set(calls.map(call => call.penY)).size * 20).toBe(
      probe.height(),
    );
    for (const call of calls) {
      expect(call.penX).toBeLessThanOrEqual(probe.width() / 2);
    }
  });
});
