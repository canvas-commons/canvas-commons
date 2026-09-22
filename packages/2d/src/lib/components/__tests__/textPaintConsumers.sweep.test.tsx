import {Vector2} from '@canvas-commons/core';
import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {Code} from '../Code';
import {Layout} from '../Layout';
import {Node} from '../Node';
import {Rect} from '../Rect';
import {Txt, TxtProps} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {PaintCall, recordingTextContext} from './recordingTextContext';
import {add, lineTexts} from './sceneFixtures';
import {DrawProbe, fakeFont, fillCalls} from './textInvariants';
import {
  countOwnerLookups,
  countPlacements,
  layoutKeyOf,
  measureKeyOf,
  naturalPlacementOf,
  paintPlanOf,
} from './txtInternals';

/** Every text call a node paints, in draw order, in the node's own space. */
function painted(node: Node): PaintCall[] {
  const {calls, context} = recordingTextContext();
  node.render(context);
  return calls;
}

/** Baseline of every call a node paints, in the space the node sits in. */
function baselinesOf(node: Node): Map<string, number> {
  const at = node.position().y;
  return new Map(painted(node).map(call => [call.text, at + call.penY]));
}

describe('Txt layout cache keys', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  const props: TxtProps = {
    text: 'aaaa bbbb cccc dddd',
    fontSize: 20,
    lineHeight: '100%',
    width: 88,
    wrapMode: 'knuth-plass',
  };

  it('re-breaks when the alignment turns to justify', () => {
    const probe = new DrawProbe({...props, textAlign: 'left'});
    add(probe);
    // Read the left layout first, so a stale entry would be the one reused.
    expect(lineTexts(probe).length).toBeGreaterThan(0);
    probe.textAlign('justify');

    const fresh = new DrawProbe({...props, textAlign: 'justify'});
    add(fresh);

    expect(lineTexts(probe)).toEqual(lineTexts(fresh));
    expect(probe.textLines().height).toBeCloseTo(fresh.textLines().height, 5);
    expect(fillCalls(probe).map(call => [call.text, call.x])).toEqual(
      fillCalls(fresh).map(call => [call.text, call.x]),
    );
  });
});

/** Reads the layout and the paint plan a frame would, by identity. */
class CostProbe extends Txt {
  public lines() {
    return this.positionedLines();
  }

  public plan() {
    return paintPlanOf(this);
  }

  public natural() {
    return naturalPlacementOf(this, this.effectiveMaxWidth());
  }
}

describe('Txt frame cost', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  const build = () => {
    const probe = new CostProbe({
      width: 400,
      fontSize: 16,
      lineHeight: 20,
      textWrap: true,
      children: [
        'pack my ',
        new Txt({fill: 'red', text: 'box'}),
        ' with five dozen liquor jugs and more besides',
      ],
    });
    add(probe);
    return probe;
  };

  it('measures and paints from one placement', () => {
    const probe = build();
    expect(probe.size().x).toBeGreaterThan(0);
    expect(probe.natural()?.lines).toBe(probe.lines());
  });

  it('keeps the placement and the paint plan when nothing changes', () => {
    const probe = build();
    const lines = probe.lines();
    const plan = probe.plan();
    probe.size();
    expect(probe.lines()).toBe(lines);
    expect(probe.plan()).toBe(plan);
  });

  it("keeps both when a child's fill or opacity changes", () => {
    const probe = build();
    const lines = probe.lines();
    const plan = probe.plan();
    probe.childAs<Txt>(1)?.fill('blue');
    probe.childAs<Txt>(1)?.opacity(0.5);
    expect(probe.lines()).toBe(lines);
    expect(probe.plan()).toBe(plan);
  });

  it('keeps the layout key when a fill changes', () => {
    const probe = build();
    probe.render(recordingTextContext().context);
    const key = layoutKeyOf(probe);
    probe.childAs<Txt>(1)?.fill('blue');
    probe.fill('green');
    probe.render(recordingTextContext().context);
    expect(layoutKeyOf(probe)).toBe(key);
  });

  it('sets the canvas state only when a paint call changes it', () => {
    const probe = build();
    probe.width(120);
    const {calls, context} = recordingTextContext();
    const sets = new Map<PropertyKey, number>();
    const counting = new Proxy(context, {
      set(target, key, value) {
        sets.set(key, (sets.get(key) ?? 0) + 1);
        return Reflect.set(target, key, value);
      },
    });
    probe.render(counting);
    expect(calls.length).toBeGreaterThan(3);
    expect(sets.get('font')).toBe(1);
    expect(sets.get('letterSpacing')).toBe(1);
    expect(sets.get('fillStyle')).toBe(4);
  });

  it('keeps the paint plan when its parent lays out again', () => {
    const probe = build();
    const filler = new Rect({size: 40});
    add(
      new Layout({
        layout: true,
        direction: 'column',
        children: [probe, filler],
      }),
    );
    const plan = probe.plan();
    filler.width(200);
    expect(probe.size().x).toBe(400);
    expect(probe.plan()).toBe(plan);
  });
});

describe('Txt nested span box', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  const build = () => {
    const span = new Txt({fill: 'red', text: 'dozen liquor jugs'});
    const root = new Txt({
      width: 100,
      fontSize: 16,
      lineHeight: 20,
      textWrap: true,
      children: ['pack my box with five ', span, ' and more'],
    });
    add(root);
    return {root, span};
  };

  it('reads its box from the root placement', () => {
    const {root, span} = build();
    const lines = root.textLines().lines;
    const owned = lines.flatMap(line =>
      line.fragments
        .filter(fragment => fragment.style.fill === span.fill())
        .map(fragment => ({line, fragment})),
    );
    expect(owned.length).toBeGreaterThan(1);
    const size = root.size();
    const box = span.cacheBBox();
    for (const {line, fragment} of owned) {
      expect(box.left).toBeLessThanOrEqual(fragment.x - size.x / 2 + 1e-6);
      expect(box.top).toBeLessThanOrEqual(line.top - size.y / 2 + 1e-6);
      expect(box.bottom).toBeGreaterThanOrEqual(
        line.top + line.height - size.y / 2 - 1e-6,
      );
    }
    expect(box.height).toBeLessThan(root.cacheBBox().height);
  });

  /** The union of the fragments the span paints, at 10px a character. */
  const paintedExtent = (root: Txt, span: Txt) => {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const line of root.textLines().lines) {
      for (const fragment of line.fragments) {
        if (fragment.style.fill !== span.fill()) continue;
        left = Math.min(left, fragment.x);
        right = Math.max(
          right,
          fragment.x + fragment.text.trimEnd().length * 10,
        );
        top = Math.min(top, line.top);
        bottom = Math.max(bottom, line.top + line.height);
      }
    }
    return {left, top, size: new Vector2(right - left, bottom - top)};
  };

  it('takes its size from its pieces on one line', () => {
    const span = new Txt({fill: 'red', text: 'bcd'});
    const root = new Txt({
      fontSize: 16,
      lineHeight: 20,
      children: ['a ', span, ' e'],
    });
    add(root);
    expect(span.size()).toEqual(new Vector2(30, 20));
    expect(paintedExtent(root, span).size).toEqual(span.size());
  });

  it('takes its size from its pieces across a wrap', () => {
    const {root, span} = build();
    expect(root.textLines().lines.length).toBeGreaterThan(2);
    const extent = paintedExtent(root, span);
    expect(extent.size.y).toBeGreaterThan(20);
    expect(span.size()).toEqual(extent.size);
  });

  it('agrees with its cache box', () => {
    const {root, span} = build();
    const box = span.cacheBBox();
    const rootBox = root.cacheBBox();
    const extent = paintedExtent(root, span);
    const padding = rootBox.size.sub(root.size());
    expect(box.size.sub(span.size())).toEqual(padding);
    expect(box.left).toBeCloseTo(
      extent.left - root.size().x / 2 - padding.x / 2,
    );
    expect(box.top).toBeCloseTo(extent.top - root.size().y / 2 - padding.y / 2);
  });

  it('has no size with no text', () => {
    const span = new Txt({fill: 'red', text: ''});
    const root = new Txt({children: ['a ', span, ' e']});
    add(root);
    expect(span.size()).toEqual(new Vector2(0, 0));
  });

  it('reads every box from one pass over the placement', () => {
    const spans = Array.from(
      {length: 20},
      (_, index) => new Txt({fill: 'red', text: `w${index} `}),
    );
    add(new Txt({width: 100, fontSize: 16, lineHeight: 20, children: spans}));
    const lookups = countOwnerLookups();
    spans[0].cacheBBox();
    const one = lookups();
    expect(one).toBeGreaterThan(0);
    spans.forEach(span => span.cacheBBox());
    expect(lookups()).toBe(one);
  });

  it('holds the pieces of the spans under it', () => {
    const inner = new Txt({text: 'dozen liquor'});
    const outer = new Txt({fill: 'red', children: ['box with five ', inner]});
    const root = new Txt({
      width: 120,
      fontSize: 16,
      lineHeight: 20,
      children: ['pack my ', outer, ' jugs'],
    });
    add(root);
    expect(lineTexts(root)).toEqual([
      'pack my box',
      'with five',
      'dozen liquor',
      'jugs',
    ]);
    expect(inner.size()).toEqual(new Vector2(120, 20));
    expect(outer.size()).toEqual(new Vector2(120, 60));
  });

  it('sizes itself in its own space', () => {
    const {span} = build();
    const size = span.size();
    const padding = span.cacheBBox().size.sub(size);
    span.scale(2);
    expect(span.size()).toEqual(size.scale(0.5));
    expect(span.cacheBBox().size.sub(span.size())).toEqual(padding);
  });

  it('warns once that it ignores its sizing props', () => {
    const {span} = build();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    onTestFinished(() => warn.mockRestore());
    span.size();
    expect(warn).not.toHaveBeenCalled();
    span.width(40);
    span.size();
    span.padding(10);
    span.size();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('lays out none of its own text', () => {
    const {root, span} = build();
    const placements = countPlacements(span);
    const yoga = vi.spyOn(span.yogaNode, 'calculateLayout');
    const frame = () => {
      root.render(recordingTextContext().context);
      span.size();
      span.cacheBBox();
    };
    frame();
    frame();
    span.text('a longer dozen liquor');
    frame();
    expect(placements()).toBe(0);
    expect(yoga).not.toHaveBeenCalled();
    expect(measureKeyOf(span)).toBeNull();
  });
});

describe('Txt nested span queries', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  const build = (spanProps: TxtProps = {}) => {
    const span = new Txt({
      fill: 'red',
      text: 'box with five dozen',
      ...spanProps,
    });
    const root = new Txt({
      width: 120,
      fontSize: 16,
      lineHeight: 20,
      children: ['pack my ', span, ' liquor jugs'],
    });
    add(root);
    return {root, span};
  };

  const spanWords = ['box', 'with', 'five', 'dozen'];

  it('reads its lines from the root placement', () => {
    const {root, span} = build();
    const owned = root
      .textLines()
      .lines.map(line => ({
        top: line.top,
        fragments: line.fragments.filter(
          fragment => fragment.style.fill === span.fill(),
        ),
      }))
      .filter(line => line.fragments.length > 0);
    const lines = span.textLines().lines;
    expect(owned.length).toBeGreaterThan(1);
    expect(lines.map(line => line.fragments.map(one => one.text))).toEqual(
      owned.map(line => line.fragments.map(one => one.text)),
    );

    const corner = new Vector2(
      Math.min(...owned.flatMap(line => line.fragments.map(one => one.x))),
      owned[0].top,
    );
    lines.forEach((line, index) => {
      expect(line.top).toBeCloseTo(owned[index].top - corner.y, 6);
      line.fragments.forEach((fragment, at) => {
        expect(fragment.x).toBeCloseTo(
          owned[index].fragments[at].x - corner.x,
          6,
        );
      });
    });
    expect(span.textLines().height).toBe(span.size().y);
    expect(span.lineCount()).toBe(owned.length);
  });

  it('reports its units where the root paints them', () => {
    const {root, span} = build({x: 30, y: -10});
    const whole = root
      .textWords()
      .filter(unit => spanWords.includes(unit.text));
    const own = span.textWords();
    expect(own.map(unit => unit.text)).toEqual(spanWords);
    own.forEach((unit, index) => {
      expect(unit.x + span.x()).toBeCloseTo(whole[index].x, 6);
      expect(unit.y + span.y()).toBeCloseTo(whole[index].y, 6);
      expect(unit.width).toBeCloseTo(whole[index].width, 6);
    });
    expect(own[0].lineIndex).toBe(0);
    expect(own[own.length - 1].lineIndex).toBe(span.lineCount() - 1);
  });

  it('splits into pieces that paint where the root painted', () => {
    const {root, span} = build({x: 30});
    const whole = new Map(
      root.split('word').map(piece => [piece.text(), piece.position()]),
    );
    const pieces = span.split('word');
    expect(pieces.map(piece => piece.text().trim()).filter(Boolean)).toEqual(
      spanWords,
    );
    for (const piece of pieces) {
      const at = whole.get(piece.text());
      expect(at).toBeDefined();
      expect(piece.position().add(span.position()).x).toBeCloseTo(
        at?.x ?? NaN,
        6,
      );
      expect(piece.position().add(span.position()).y).toBeCloseTo(
        at?.y ?? NaN,
        6,
      );
    }
  });

  it('refuses a query only its root answers', () => {
    const {span} = build();
    expect(() => span.shrinkWrapWidth()).toThrow(/nested Txt/);
    expect(() => span.balancedWidth(2)).toThrow(/nested Txt/);
    expect(() => span.fitFontSize(100, 100)).toThrow(/nested Txt/);
  });

  it('refuses units it cannot map into its own space', () => {
    const {span} = build({scale: 2});
    expect(() => span.textWords()).toThrow(/scaled/);
  });
});

describe('Txt split pieces', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('paints a piece of mixed sizes on the line it was placed on', () => {
    const probe = new DrawProbe({
      lineHeight: '150%',
      fontSize: 20,
      children: ['a', new Txt({fontSize: 40, text: 'B'})],
    });
    add(probe);

    const whole = baselinesOf(probe);
    expect([...whole.values()]).toEqual([whole.get('a'), whole.get('a')]);
    for (const piece of probe.split('grapheme')) {
      add(piece);
      const own = [...baselinesOf(piece)];
      expect(own.length).toBe(1);
      expect(own[0][1]).toBeCloseTo(whole.get(own[0][0]) ?? NaN, 5);
    }
  });

  it('carries both owners of a word a colour seam cuts', () => {
    const probe = new Txt({
      fontSize: 20,
      children: ['he', new Txt({fill: 'red', text: 'llo'})],
    });
    add(probe);

    const pieces = probe.split('word');
    expect(pieces.map(piece => piece.text())).toEqual(['hello']);
    add(pieces[0]);
    const calls = painted(pieces[0]);
    expect(calls.map(call => call.text)).toEqual(['he', 'llo']);
    expect(new Set(calls.map(call => call.fillStyle)).size).toBe(2);
  });

  it('carries the opacity of the span it came from', () => {
    const probe = new Txt({
      fontSize: 20,
      children: [new Txt({opacity: 0.2, fill: 'red', text: 'abc'})],
    });
    add(probe);

    const pieces = probe.split('word');
    expect(pieces.map(piece => piece.opacity())).toEqual([0.2]);
  });
});

describe('Txt path paint across a seam', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  it('paints both owners of a word a colour seam cuts', () => {
    const probe = new DrawProbe({
      fontSize: 10,
      lineHeight: 20,
      textPath: 'M -250 0 L 250 0',
      pathSplit: 'word',
      children: ['he', new Txt({fill: 'red', text: 'llo'})],
    });
    add(probe);

    const calls = painted(probe);
    expect(calls.map(call => call.text)).toEqual(['he', 'llo']);
    expect(new Set(calls.map(call => call.fillStyle)).size).toBe(2);
  });
});

describe('Txt tight letter spacing', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  it('paints a run whose spacing takes its advance below zero', () => {
    const probe = new DrawProbe({
      text: 'ab',
      fontSize: 20,
      letterSpacing: -20,
      textWrap: false,
    });
    add(probe);

    expect(painted(probe).map(call => call.text)).toEqual(['ab']);
  });
});

describe('Txt balanced width', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  const props = {text: 'Hello world. How are you?', fontSize: 10};

  it('probes a wrapping layout even when the node never wraps', () => {
    const wrapping = new Txt({...props, textWrap: true});
    const fixed = new Txt({...props, textWrap: false});
    add(wrapping);
    add(fixed);

    expect(fixed.balancedWidth(2)).toBe(wrapping.balancedWidth(2));
    expect(fixed.balancedWidth(2)).toBeGreaterThan(2);
  });
});

describe('Txt text units', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  it('reads a sentence across the pieces of its line', () => {
    const probe = new Txt({text: 'Hello world. How are you?', fontSize: 10});
    add(probe);

    expect(probe.textSentences().map(unit => unit.text.trim())).toEqual([
      'Hello world.',
      'How are you?',
    ]);
  });

  it('reports one fragment per owner of a line', () => {
    const probe = new Txt({
      fontSize: 10,
      width: 400,
      children: ['pack my ', new Txt({fill: 'red', text: 'box'}), ' with five'],
    });
    add(probe);

    expect(
      probe.textLines().lines.map(line => line.fragments.map(one => one.text)),
    ).toEqual([['pack my ', 'box', ' with five']]);
  });
});

describe('Shape text anchoring', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext();

  it('leaves a Code run on the canvas anchor', () => {
    const code = new Code({code: 'abc', textDirection: 'rtl'});
    add(code);

    const {calls, context} = recordingTextContext();
    code.render(context);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].textAlign).toBe('start');
  });

  it('anchors every Txt run at its left edge', () => {
    const probe = new DrawProbe({text: 'abc', textDirection: 'rtl'});
    add(probe);

    const calls = painted(probe);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].textAlign).toBe('left');
  });
});

describe('Txt alignment box', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  const props: TxtProps = {
    text: 'aaaa bbbb cccc dddd eeee',
    fontSize: 20,
    lineHeight: '100%',
    textWrap: true,
  };

  it.each(['center', 'right', 'left'] as const)(
    'aligns a shrink-wrapped node in the box it fills (%s)',
    align => {
      const wrapped = new DrawProbe({
        ...props,
        maxWidth: 150,
        textAlign: align,
      });
      add(wrapped);
      const fixed = new DrawProbe({
        ...props,
        width: wrapped.size().x,
        textAlign: align,
      });
      add(fixed);

      expect(fillCalls(wrapped).map(call => call.x)).toEqual(
        fillCalls(fixed).map(call => call.x),
      );
    },
  );
});

describe('Txt paint plan', () => {
  mockScene2D();
  failOnSceneErrors();
  fakeFont();

  it('draws a line of one style in one call', () => {
    const probe = new DrawProbe({text: 'one two three', fontSize: 20});
    add(probe);

    expect(fillCalls(probe).map(call => call.text)).toEqual(['one two three']);
  });

  it('draws each wrapped line in one call', () => {
    const probe = new DrawProbe({
      text: 'aaaa bbbb cccc dddd',
      fontSize: 20,
      width: 100,
      textWrap: true,
    });
    add(probe);

    expect(fillCalls(probe).map(call => call.text)).toEqual([
      'aaaa bbbb',
      'cccc dddd',
    ]);
  });

  it('keeps a run of another colour out of its neighbours', () => {
    const probe = new DrawProbe({
      fontSize: 20,
      children: [
        new Txt({text: 'one '}),
        new Txt({text: 'two', fill: 'red'}),
        new Txt({text: ' three'}),
      ],
    });
    add(probe);

    expect(fillCalls(probe).map(call => call.text)).toEqual([
      'one ',
      'two',
      ' three',
    ]);
  });

  it('draws a justified word with the space it stretches', () => {
    const probe = new DrawProbe({
      text: 'aaaa bbbb cccc dddd eeee ffff',
      fontSize: 20,
      width: 150,
      textAlign: 'justify',
    });
    add(probe);

    expect(fillCalls(probe).map(call => [call.text, call.x])).toEqual([
      ['aaaa ', -75],
      ['bbbb ', -20],
      ['cccc', 35],
      ['dddd eeee ffff', -75],
    ]);
  });

  it('draws a line of one direction in one call in an rtl block', () => {
    for (const text of ['one two three four five six seven', 'שלום עולם טוב']) {
      const probe = new DrawProbe({text, fontSize: 20, textDirection: 'rtl'});
      add(probe);

      expect(fillCalls(probe).map(call => call.text)).toEqual([text]);
    }
  });

  it('draws the runs of a mixed rtl line in their visual order', () => {
    const probe = new DrawProbe({
      text: 'Hello world שלום',
      fontSize: 20,
      textDirection: 'rtl',
    });
    add(probe);

    const calls = fillCalls(probe);
    expect(calls.map(call => call.text)).toEqual(['Hello world', ' שלום']);
    expect(calls[1].x).toBeLessThan(calls[0].x);
  });

  it('draws the end spaces of a run against the block apart', () => {
    const probe = new DrawProbe({text: 'שלום 123 עולם', fontSize: 20});
    add(probe);

    const calls = fillCalls(probe);
    expect(calls.map(call => call.text)).toEqual([
      'שלום',
      ' ',
      '123',
      ' ',
      'עולם',
    ]);
    expect(calls[4].x).toBeLessThan(calls[2].x);
    expect(calls[2].x).toBeLessThan(calls[0].x);
  });
});
