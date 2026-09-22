import {createSignal} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import type {TextExclusion} from '../../partials/types';
import type {PlacedLine} from '../../text';
import {Line} from '../Line';
import {Rect} from '../Rect';
import {Txt} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {add} from './sceneFixtures';

/** Exposes the placed lines, which are the same array while the memo holds. */
class MemoProbe extends Txt {
  public placedLines(): readonly PlacedLine[] {
    return this.positionedLines();
  }
}

describe('Txt layout memo', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  it('lays out again when an exclusion moves inside its array', () => {
    const left = createSignal(0);
    // Center-origin (x, y): (-30, -40) puts the rect's top-left corner at the
    // block's own top-left, occupying its top-left 60x80 quadrant.
    const moving = {
      kind: 'rect' as const,
      x: -30,
      y: -40,
      width: 60,
      height: 80,
    };
    const exclusions: TextExclusion[] = [moving];
    const txt = new Txt({
      fontSize: 16,
      lineHeight: 20,
      width: 120,
      height: 120,
      textWrap: true,
      text: 'hello world here and more words to wrap',
      exclusions: () => {
        moving.x = left();
        return exclusions;
      },
    });
    add(txt);
    expect(txt.textLines().lines).toHaveLength(6);

    left(230);

    expect(txt.textLines().lines).toHaveLength(4);
  });

  function probeAround(blocker: Rect): MemoProbe {
    add(blocker);
    const probe = new MemoProbe({
      fontSize: 16,
      lineHeight: 20,
      width: 400,
      height: 200,
      textWrap: true,
      text: 'hello world here and more words to wrap around the blocker',
      exclusions: [{kind: 'node', node: blocker}],
    });
    add(probe);
    return probe;
  }

  /** A layout that changed once and then settles on its own memo. */
  function expectRelaidOut(probe: MemoProbe, before: readonly PlacedLine[]) {
    const after = probe.placedLines();
    expect(after).not.toBe(before);
    expect(probe.placedLines()).toBe(after);
  }

  it('lays out again when a node exclusion moves', () => {
    const blocker = new Rect({size: [100, 100], position: [-150, 0]});
    const probe = probeAround(blocker);
    const before = probe.placedLines();

    blocker.position.x(150);

    expectRelaidOut(probe, before);
  });

  it('lays out again when a node exclusion rotates', () => {
    const blocker = new Rect({size: [100, 100], position: [-150, 0]});
    const probe = probeAround(blocker);
    const before = probe.placedLines();

    blocker.rotation(45);

    expectRelaidOut(probe, before);
  });

  it('lays out again when a node exclusion scales', () => {
    const blocker = new Rect({size: [100, 100], position: [-150, 0]});
    const probe = probeAround(blocker);
    const before = probe.placedLines();

    blocker.scale(2.5);

    expectRelaidOut(probe, before);
  });

  it('lays out again when a node exclusion changes size', () => {
    const blocker = new Rect({size: [100, 100], position: [-150, 0]});
    const probe = probeAround(blocker);
    const before = probe.placedLines();

    blocker.size([300, 160]);

    expectRelaidOut(probe, before);
  });

  it('lays out again when a rect exclusion is mutated in place', () => {
    const left = createSignal(-30);
    const moving = {
      kind: 'rect' as const,
      x: -30,
      y: -40,
      width: 60,
      height: 80,
    };
    const probe = new MemoProbe({
      fontSize: 16,
      lineHeight: 20,
      width: 120,
      height: 120,
      textWrap: true,
      text: 'hello world here and more words to wrap',
      exclusions: () => {
        moving.x = left();
        return [moving];
      },
    });
    add(probe);
    const before = probe.placedLines();

    left(230);

    expectRelaidOut(probe, before);
  });

  it('lays out again when a curve exclusion changes shape inside its box', () => {
    const blocker = new Line({
      lineWidth: 0,
      points: [
        [-200, -100],
        [0, -100],
        [0, 0],
        [-200, 0],
        [-200, -100],
      ],
    });
    add(blocker);
    const probe = new MemoProbe({
      fontSize: 16,
      lineHeight: 20,
      width: 400,
      height: 200,
      textWrap: true,
      text:
        'hello world here and more words to wrap around the blocker and ' +
        'keep going for several more lines of text so the shape matters',
      exclusions: [{kind: 'node', node: blocker}],
    });
    add(probe);
    const leftEdges = () => probe.placedLines().map(line => line.segment.left);
    const before = leftEdges();
    const placed = probe.placedLines();

    // A triangle of the same bounding box, so only the profile can tell them
    // apart.
    blocker.points([
      [-200, -100],
      [0, -50],
      [-200, 0],
      [-200, -100],
    ]);

    expect(leftEdges()).not.toEqual(before);
    expectRelaidOut(probe, placed);
  });

  it('holds its layout when an unrelated node changes', () => {
    const blocker = new Rect({size: [100, 100], position: [-150, 0]});
    const probe = probeAround(blocker);
    const bystander = new Rect({size: [100, 100], position: [150, 0]});
    add(bystander);
    const before = probe.placedLines();

    bystander.position.x(0);
    bystander.rotation(30);
    bystander.size([50, 50]);

    expect(probe.placedLines()).toBe(before);
  });
});
