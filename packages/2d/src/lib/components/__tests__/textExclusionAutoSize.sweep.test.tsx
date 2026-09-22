import {describe, expect, it} from 'vitest';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Txt, TxtProps} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {add} from './sceneFixtures';
import {
  TEXT,
  boxOf,
  layoutOf,
  paintedRows,
  queriedRows,
} from './textExclusionFixtures';
import {DrawProbe, fakeFont, largestFittingSize} from './textInvariants';

describe('Txt autoSize beside a node its layout places', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  const BOX = {width: 200, height: 100, cap: 24, letterSpacing: 0};
  const fitProps: TxtProps = {
    text: TEXT,
    lineHeight: '120%',
    width: BOX.width,
    height: BOX.height,
  };

  function build() {
    const badge = new Rect({size: [60, 60]});
    const txt = new Txt({
      ...fitProps,
      fontSize: BOX.cap,
      autoSize: true,
      exclusions: [{kind: 'node', node: badge}],
    });
    const root = new Layout({
      layout: true,
      width: 320,
      children: [badge, txt],
    });
    return {badge, txt, root};
  }

  /** Where the badge sits: how far it reaches into the text, and its height. */
  const states: [number, number][] = [];
  for (const overlap of [0, 40, 80, 120]) {
    for (const height of [30, 60, 100]) states.push([overlap, height]);
  }
  const place = (badge: Layout, [overlap, height]: [number, number]) => {
    badge.margin([0, -overlap, 0, 0]);
    badge.size([60, height]);
  };
  const read = (txt: Txt) => ({
    size: txt.effectiveFontSize(),
    ...layoutOf(txt),
  });

  it('queries and paints the size it fits at each badge position', () => {
    const {badge, txt, root} = build();
    const sizes = new Set<number>();
    for (const state of states) {
      place(badge, state);
      sizes.add(txt.effectiveFontSize());
      expect(queriedRows(txt)).toEqual(paintedRows(root));
    }
    expect(sizes.size).toBeGreaterThan(2);
  });

  it('fits the largest size the settled boxes leave room for', () => {
    const {badge, txt} = build();
    for (const state of states) {
      place(badge, state);
      const chosen = txt.effectiveFontSize();
      const toTxt = txt.worldToLocal().multiply(badge.localToWorld());
      const probe = new DrawProbe({
        ...fitProps,
        exclusions: [
          {
            kind: 'polygon',
            points: boxOf(badge).map(point => point.transformAsPoint(toTxt)),
          },
        ],
      });
      add(probe);
      expect(chosen, `${state}`).toBe(
        Math.max(1, largestFittingSize(probe, BOX)),
      );
      probe.remove();
    }
  });

  it('fits the same whatever order its states are reached in', () => {
    const visit = (order: [number, number][]) => {
      const {badge, txt} = build();
      return new Map(
        order.map(state => {
          place(badge, state);
          return [`${state}`, read(txt)];
        }),
      );
    };
    const forward = visit(states);
    const reverse = visit([...states].reverse());

    for (const state of states) {
      const {badge, txt} = build();
      place(badge, state);
      const fresh = read(txt);
      expect(forward.get(`${state}`)).toEqual(fresh);
      expect(reverse.get(`${state}`)).toEqual(fresh);
    }
  });
});
