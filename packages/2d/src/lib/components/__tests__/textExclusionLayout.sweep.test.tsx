import {Vector2} from '@canvas-commons/core';
import {describe, expect, it, vi} from 'vitest';
import {Circle} from '../Circle';
import {Layout} from '../Layout';
import {Rect} from '../Rect';
import {Txt, TxtProps} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {
  PROPS,
  boxOf,
  layoutOf,
  linesOf,
  paintedRows,
  profileOf,
  queriedRows,
  referenceLayout,
} from './textExclusionFixtures';

describe('Txt node exclusions under a flex layout', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  it('flows around an absolute sibling in a row', () => {
    const badge = new Rect({
      layout: false,
      size: [80, 40],
      position: [60, -30],
    });
    const txt = new Txt({
      ...PROPS,
      grow: 1,
      exclusions: [{kind: 'node', node: badge}],
    });
    const row = new Layout({
      layout: true,
      width: 300,
      children: [new Rect({size: [40, 40]}), txt, badge],
    });

    expect(row.size().x).toBe(300);
    expect(txt.size().y).toBe(txt.textLines().height);
    expect(layoutOf(txt)).toEqual(referenceLayout(txt, boxOf(badge), badge));
    expect(txt.textLines().lines.length).toBeGreaterThan(3);
  });

  it('flows around a flex sibling that overlaps it', () => {
    const badge = new Rect({size: [60, 60], margin: [0, 0, 0, -100]});
    const txt = new Txt({
      ...PROPS,
      grow: 1,
      exclusions: [{kind: 'node', node: badge}],
    });
    new Layout({layout: true, width: 320, children: [txt, badge]});

    expect(txt.size().y).toBe(txt.textLines().height);
    expect(layoutOf(txt)).toEqual(referenceLayout(txt, boxOf(badge), badge));
  });

  it('flows around a cousin in a column below a measured title', () => {
    const badge = new Rect({
      layout: false,
      size: 50,
      radius: 25,
      position: [-60, 45],
    });
    const txt = new Txt({
      ...PROPS,
      exclusions: [{kind: 'node', node: badge, horizontalPadding: 4}],
    });
    new Layout({
      layout: true,
      direction: 'column',
      width: 260,
      children: [
        new Txt({...PROPS, text: 'a title that wraps onto two lines'}),
        new Layout({layout: true, height: 30, children: [badge]}),
        txt,
      ],
    });

    expect(txt.size().y).toBe(txt.textLines().height);
    expect(layoutOf(txt)).toEqual(
      referenceLayout(txt, profileOf(badge), badge, 4),
    );
    expect(linesOf(txt)).not.toEqual(
      linesOf(new Txt({...PROPS, width: txt.size().x})),
    );
  });

  it('flows around a node deep under its parent, and follows it', () => {
    const badge = new Rect({layout: false, size: [70, 30], position: [0, 0]});
    const txt = new Txt({
      ...PROPS,
      grow: 1,
      exclusions: [{kind: 'node', node: badge}],
    });
    new Layout({
      layout: true,
      width: 300,
      height: 200,
      children: [
        new Layout({
          layout: true,
          width: 20,
          children: [new Layout({layout: true, children: [badge]})],
        }),
        txt,
      ],
    });

    for (const at of [
      new Vector2(60, 0),
      new Vector2(140, 30),
      new Vector2(200, -10),
    ]) {
      badge.position(at);
      expect(layoutOf(txt)).toEqual(referenceLayout(txt, boxOf(badge), badge));
    }
  });

  it('flows closer to the round edge of a flex circle than to a box', () => {
    const flowBeside = (badge: Layout) => {
      const txt = new Txt({
        ...PROPS,
        grow: 1,
        exclusions: [{kind: 'node', node: badge}],
      });
      new Layout({layout: true, width: 400, children: [txt, badge]});
      return linesOf(txt);
    };
    const round = flowBeside(new Circle({size: 160, margin: [0, 0, 0, -200]}));
    const square = flowBeside(new Rect({size: 160, margin: [0, 0, 0, -200]}));

    expect(round).not.toEqual(square);
    expect(round[1].length).toBeGreaterThan(square[1].length);
  });

  describe.each<[string, TxtProps]>([
    ['a fixed width', {width: 240}],
    ['grow', {grow: 1}],
    ['shrink', {shrink: 1}],
  ])('with %s', (_, sizing) => {
    it.each<[string, () => Layout, (badge: Layout) => void]>([
      [
        'a flex badge',
        () => new Rect({size: [60, 60], margin: [0, -100, 0, 0]}),
        badge => {
          badge.margin([0, -170, 0, 0]);
          badge.size([60, 90]);
        },
      ],
      [
        'a badge the layout does not place',
        () => new Rect({layout: false, size: [60, 60], position: [-60, -20]}),
        badge => badge.position([-120, 10]),
      ],
    ])('queries and paints one layout around %s', (_, create, move) => {
      const badge = create();
      const txt = new Txt({
        ...PROPS,
        ...sizing,
        exclusions: [{kind: 'node', node: badge}],
      });
      const root = new Layout({
        layout: true,
        width: 320,
        children: [badge, txt],
      });

      const before = queriedRows(txt);
      expect(paintedRows(root)).toEqual(before);
      expect(layoutOf(txt)).toEqual(referenceLayout(txt, boxOf(badge), badge));

      move(badge);
      const after = queriedRows(txt);
      expect(after).not.toEqual(before);
      expect(paintedRows(root)).toEqual(after);
      expect(layoutOf(txt)).toEqual(referenceLayout(txt, boxOf(badge), badge));
    });
  });

  describe('a text whose layout reacts to how it wraps', () => {
    /** The layout of the "deep" case with no height, where the root grows. */
    function build() {
      const badge = new Rect({layout: false, size: [70, 30]});
      const txt = new Txt({
        ...PROPS,
        grow: 1,
        exclusions: [{kind: 'node', node: badge}],
      });
      new Layout({
        layout: true,
        width: 300,
        children: [
          new Layout({
            layout: true,
            width: 20,
            children: [new Layout({layout: true, children: [badge]})],
          }),
          txt,
        ],
      });
      return {badge, txt};
    }

    const positions: Vector2[] = [];
    for (let x = 0; x < 360; x += 60) {
      for (let y = -20; y < 40; y += 10) positions.push(new Vector2(x, y));
    }

    it('lays out the same whatever order its states are reached in', () => {
      const visit = (order: Vector2[]) => {
        const {badge, txt} = build();
        return new Map(
          order.map(at => {
            badge.position(at);
            return [`${at.x},${at.y}`, layoutOf(txt)];
          }),
        );
      };
      const forward = visit(positions);
      const reverse = visit([...positions].reverse());

      for (const at of positions) {
        const {badge, txt} = build();
        badge.position(at);
        const fresh = layoutOf(txt);
        expect(forward.get(`${at.x},${at.y}`)).toEqual(fresh);
        expect(reverse.get(`${at.x},${at.y}`)).toEqual(fresh);
      }
    });

    it('keeps the lesser height when no layout agrees with its text', () => {
      const {badge, txt} = build();
      for (const at of [new Vector2(60, -20), new Vector2(60, 20)]) {
        badge.position(at);
        expect(txt.size().y).toBe(100);
        expect(layoutOf(txt)).not.toEqual(
          referenceLayout(txt, boxOf(badge), badge),
        );
      }
    });
  });

  describe('a text whose width moves the node it flows around', () => {
    function build(margin: number) {
      const badge = new Rect({size: 80, margin: [0, 0, 0, -margin]});
      const txt = new Txt({
        ...PROPS,
        maxWidth: 240,
        exclusions: [{kind: 'node', node: badge}],
      });
      const root = new Layout({
        layout: true,
        width: 320,
        children: [txt, badge],
      });
      return {badge, txt, root};
    }

    it('keeps the least height, then the widest box, when passes run out', () => {
      const {txt, root} = build(236);
      const passes = vi.spyOn(root.yogaNode, 'calculateLayout');
      expect(txt.size()).toEqual(new Vector2(240, 140));
      expect(passes).toHaveBeenCalledTimes(8);
    });

    it('lays out the same whatever order its states are reached in', () => {
      const margins: number[] = [];
      for (let margin = 228; margin <= 248; margin += 2) margins.push(margin);
      const visit = (order: number[]) => {
        const {badge, txt} = build(order[0]);
        return new Map(
          order.map(margin => {
            badge.margin([0, 0, 0, -margin]);
            return [margin, [txt.size().x, layoutOf(txt)] as const];
          }),
        );
      };
      const forward = visit(margins);
      const reverse = visit([...margins].reverse());

      for (const margin of margins) {
        const {txt} = build(margin);
        const fresh = [txt.size().x, layoutOf(txt)] as const;
        expect(forward.get(margin)).toEqual(fresh);
        expect(reverse.get(margin)).toEqual(fresh);
      }
    });
  });

  it('blocks the box of a flex badge, not its rounded corners', () => {
    const badge = new Rect({size: 80, radius: 40, margin: [0, 0, 0, -120]});
    const txt = new Txt({
      ...PROPS,
      grow: 1,
      exclusions: [{kind: 'node', node: badge}],
    });
    new Layout({layout: true, width: 320, children: [txt, badge]});

    expect(layoutOf(txt)).toEqual(referenceLayout(txt, boxOf(badge), badge));
  });

  it('keeps the throw for a node the text flow itself places', () => {
    const child = new Rect({size: [20, 20]});
    const txt = new Txt({
      fontSize: 10,
      children: ['a ', child, ' b'],
      exclusions: [{kind: 'node', node: child}],
    });
    new Layout({layout: true, width: 200, children: [txt]});

    expect(() => txt.textLines()).toThrow(
      /placed by the text flow\. Move test\/Rect\[\d+\] out of the text's children/,
    );
  });
});
