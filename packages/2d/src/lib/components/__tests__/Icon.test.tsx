import {
  ThreadGenerator,
  ThreadsFactory,
  Vector2,
  isPromise,
  threads,
} from '@canvas-commons/core';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {useScene2D} from '../../scenes';
import {Icon} from '../Icon';
import {SVGDocument} from '../SVG';
import {mockScene2D} from './mockScene2D';

// jsdom cannot build SVG shapes, so the tween runs on empty documents.
class TestIcon extends Icon {
  protected override parseSVG(): SVGDocument {
    return {size: new Vector2(24, 24), nodes: []};
  }
}

function iconMarkup(url: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" data-src="${url}"></svg>`;
}

async function runThreads(factory: ThreadsFactory) {
  const tasks: ThreadGenerator = threads(factory);
  let step = tasks.next();
  while (!step.done) {
    step = tasks.next(isPromise(step.value) ? await step.value : undefined);
  }
}

describe('Icon', () => {
  mockScene2D();

  beforeAll(() => {
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: true,
      text: async () => iconMarkup(url),
    }));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('follows a later icon change after a tween', async () => {
    const icon = new TestIcon({icon: 'test:a'});
    useScene2D().getView().add(icon);

    await runThreads(function* () {
      yield* icon.icon('test:b', 1);
      yield* icon.icon('test:c', 1);
    });
    icon.icon('test:b');

    expect(icon.svg()).toContain('test/b.svg');
  });
});
