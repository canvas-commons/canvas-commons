import {
  DependencyContext,
  linear,
  threads,
  waitFor,
} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {requestFontLoad} from '../../utils';
import {Txt} from '../Txt';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

/** True once the narrower face has replaced the fallback. */
let Loaded = false;
const FROM = 'aaaa bbbb cccc dddd eeee ffff';
const TO = 'gggg hhhh iiii jjjj kkkk llll';

function lineTexts(txt: Txt): string[] {
  return txt
    .textLines()
    .lines.map(line => line.fragments.map(fragment => fragment.text).join(''));
}

/** Report a web font as freshly loaded, which bumps the font epoch. */
async function finishFontLoad(): Promise<void> {
  Object.defineProperty(document, 'fonts', {
    value: {
      addEventListener: () => {},
      check: () => false,
      load: () => Promise.resolve([]),
    },
    configurable: true,
  });
  requestFontLoad('400 99px a-face-no-case-asks-for');
  await Promise.resolve();
  await Promise.resolve();
  Reflect.deleteProperty(document, 'fonts');
  // The load was collected as an asynchronous resource; the scene that runs
  // next must not inherit it.
  if (DependencyContext.hasPromises()) {
    await DependencyContext.consumePromises();
  }
}

/**
 * Run a text tween frame by frame, loading the face at `loadAt`, and report
 * the lines the node shows at `readAt`.
 */
async function linesDuringTween(
  loadAt: number | null,
  readAt: number,
): Promise<string[]> {
  const view = useScene2D().getView();
  const txt = (<Txt width={100} textWrap text={FROM} />) as Txt;
  view.add(txt);
  let lines: string[] = [];
  let frame = 0;
  const frames = threads(function* () {
    yield* txt.text(TO, 2, linear);
  });
  while (!frames.next().done) {
    frame++;
    if (frame === loadAt) await finishFontLoad();
    if (frame === readAt) lines = lineTexts(txt);
  }
  txt.remove();
  return lines;
}

describe('Txt text tween plan', () => {
  mockScene2D();
  mockTextContext(text => text.length * (Loaded ? 6 : 10));

  it('reads the endpoints again when a face loads mid-tween', async () => {
    const played = await linesDuringTween(20, 40);
    Loaded = true;
    const replayed = await linesDuringTween(null, 40);
    Loaded = false;

    expect(played).toEqual(replayed);
  });
});

describe('Txt text tween box', () => {
  mockScene2D();
  mockTextContext();

  it(
    'keeps the box on the dimensions the text really places',
    generatorTest(function* () {
      const txt = (
        <Txt width={200} textWrap lineHeight={30} fontSize={10} text={'aaa'} />
      ) as Txt;

      yield txt.text('bbb', 2, linear);
      yield* waitFor(0.5);
      txt.fontSize(20);
      yield* waitFor(0.5);

      expect(txt.size().y).toBeCloseTo(txt.textLines().height, 3);
    }),
  );
});
