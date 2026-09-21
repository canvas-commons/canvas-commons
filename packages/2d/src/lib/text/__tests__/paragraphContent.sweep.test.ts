import {describe, expect, it} from 'vitest';
import {TEXTS} from '../../components/__tests__/textInvariants';
import type {ContentRun, RunMetrics} from '../paragraphContent';
import {OBJECT_MARKER, buildParagraphContent} from '../paragraphContent';
import type {WhiteSpaceMode} from '../pretext-derived/normalizeWhitespace';

const MODES: WhiteSpaceMode[] = ['normal', 'pre-line', 'pre-wrap'];
const REGULAR: RunMetrics = {font: '16px sans-serif', letterSpacing: 0};
const BOLD: RunMetrics = {font: '700 16px sans-serif', letterSpacing: 0};

type Run = ContentRun<string, string>;

function text(value: string, owner = 'a', metrics = REGULAR): Run {
  return {kind: 'text', text: value, owner, paint: owner, metrics};
}

function object(owner = 'o', width = 20, height = 10): Run {
  return {kind: 'object', width, height, owner, paint: owner, metrics: REGULAR};
}

/** Every way of cutting `value` into `parts` runs, as separate owners. */
function partitions(value: string, parts: number): Run[][] {
  if (parts === 1) return [[text(value, 'r0')]];
  const out: Run[][] = [];
  for (let at = 0; at <= value.length; at++) {
    for (const rest of partitions(value.slice(at), parts - 1)) {
      out.push([
        text(value.slice(0, at), 'r0'),
        ...rest.map((run, index) =>
          run.kind === 'text' ? text(run.text, `r${index + 1}`) : run,
        ),
      ]);
    }
  }
  return out;
}

const CORPUS = [
  ...TEXTS.map(entry => entry.text),
  'a\r\nb',
  'a­b c',
  'é x',
  '  a \t\n b  ',
  '你好 a',
];

describe('paragraph content', () => {
  it('collapses a whitespace run that crosses a run boundary', () => {
    const content = buildParagraphContent(
      [text('a ', 'first'), text(' b', 'second')],
      'normal',
    );

    expect(content.text).toBe('a b');
    expect(content.ownerSpans).toEqual([
      {start: 0, end: 2, run: 0, owner: 'first', paint: 'first'},
      {start: 2, end: 3, run: 1, owner: 'second', paint: 'second'},
    ]);
    expect(content.source.toSource(1)).toEqual([
      {run: 0, offset: 1},
      {run: 1, offset: 0},
    ]);
  });

  it('joins a CRLF split across two runs', () => {
    const content = buildParagraphContent(
      [text('a\r', 'first'), text('\nb', 'second')],
      'pre-wrap',
    );

    expect(content.text).toBe('a\nb');
    expect(content.source.toSource(1)).toEqual([
      {run: 0, offset: 1},
      {run: 1, offset: 0},
    ]);
    expect(content.ownerSpans.map(span => span.owner)).toEqual([
      'first',
      'second',
    ]);
  });

  it('keeps every line break form', () => {
    for (const source of ['a\r\nb', 'a\rb', 'a\fb', 'a\nb']) {
      expect(buildParagraphContent([text(source)], 'pre-wrap').text).toBe(
        'a\nb',
      );
      expect(buildParagraphContent([text(source)], 'pre-line').text).toBe(
        'a\nb',
      );
      expect(buildParagraphContent([text(source)], 'normal').text).toBe('a b');
    }
  });

  it('keeps preserved whitespace and drops it around the paragraph', () => {
    expect(buildParagraphContent([text('  a  b  ')], 'normal').text).toBe(
      'a b',
    );
    expect(buildParagraphContent([text('  a\t\tb  ')], 'pre-line').text).toBe(
      ' a b ',
    );
    expect(buildParagraphContent([text('  a\t\tb  ')], 'pre-wrap').text).toBe(
      '  a\t\tb  ',
    );
  });

  it('spans metrics across a paint-only boundary', () => {
    const paintOnly = buildParagraphContent(
      [text('one ', 'first'), text('two', 'second')],
      'normal',
    );
    const mixed = buildParagraphContent(
      [text('one ', 'first'), text('two', 'second', BOLD)],
      'normal',
    );

    expect(paintOnly.metricSpans).toEqual([
      {start: 0, end: 7, metrics: REGULAR},
    ]);
    expect(mixed.metricSpans).toEqual([
      {start: 0, end: 4, metrics: REGULAR},
      {start: 4, end: 7, metrics: BOLD},
    ]);
    expect(mixed.ownerSpans.length).toBe(2);
  });

  it('keeps an empty run out of the text and maps it to its place', () => {
    const content = buildParagraphContent(
      [text('ab', 'first'), text('', 'empty'), text('cd', 'last')],
      'normal',
    );

    expect(content.text).toBe('abcd');
    expect(content.source.toParagraph(1, 0)).toBe(2);
    expect(content.ownerSpans.map(span => span.run)).toEqual([0, 2]);
  });

  it('stops collapsing and joining at an object', () => {
    const spaced = buildParagraphContent(
      [text('a '), object(), text(' b')],
      'normal',
    );
    const broken = buildParagraphContent(
      [text('a\r'), object(), text('\nb')],
      'pre-wrap',
    );

    expect(spaced.text).toBe(`a ${OBJECT_MARKER} b`);
    expect(broken.text).toBe(`a\n${OBJECT_MARKER}\nb`);
    expect(spaced.objects).toEqual([
      {at: 2, run: 1, owner: 'o', paint: 'o', width: 20, height: 10},
    ]);
  });

  it('keeps every object of a row of objects', () => {
    const content = buildParagraphContent(
      [object('x'), object('y'), object('z')],
      'normal',
    );

    expect(content.text).toBe(OBJECT_MARKER.repeat(3));
    expect(content.objects.map(entry => entry.owner)).toEqual(['x', 'y', 'z']);
  });

  it('tells a literal object marker from an inline object', () => {
    const content = buildParagraphContent(
      [text(`x${OBJECT_MARKER}y`, 'letters'), object('box')],
      'normal',
    );

    expect(content.text).toBe(`x${OBJECT_MARKER}y${OBJECT_MARKER}`);
    expect(content.objects).toEqual([
      {at: 3, run: 1, owner: 'box', paint: 'box', width: 20, height: 10},
    ]);
    expect(content.ownerSpans.map(span => span.owner)).toEqual([
      'letters',
      'box',
    ]);
  });

  it('gives the same paragraph however the runs are cut', () => {
    const different: string[] = [];
    for (const source of CORPUS) {
      for (const mode of MODES) {
        const whole = buildParagraphContent([text(source, 'r0')], mode);
        const parts = source.length <= 12 ? 3 : 2;
        for (const runs of partitions(source, parts)) {
          const cut = buildParagraphContent(runs, mode);
          if (cut.text !== whole.text) {
            different.push(
              `${mode} ${JSON.stringify(runs.map(run => (run.kind === 'text' ? run.text : '')))}`,
            );
          }
          if (
            JSON.stringify(cut.metricSpans) !==
            JSON.stringify(whole.metricSpans)
          ) {
            different.push(`${mode} metrics ${JSON.stringify(source)}`);
          }
        }
      }
    }
    expect(different).toEqual([]);
  });

  it('maps every paragraph offset back to the text it came from', () => {
    const broken: string[] = [];
    for (const source of CORPUS) {
      for (const mode of MODES) {
        const whole = buildParagraphContent([text(source, 'r0')], mode);
        for (const runs of partitions(source, 2)) {
          const content = buildParagraphContent(runs, mode);
          const starts = runs.map(() => 0);
          for (let run = 1; run < runs.length; run++) {
            const before = runs[run - 1];
            starts[run] =
              starts[run - 1] +
              (before.kind === 'text' ? before.text.length : 1);
          }
          for (let at = 0; at < content.text.length; at++) {
            const refs = content.source.toSource(at);
            if (refs.length === 0) broken.push(`${mode} empty at ${at}`);
            for (const ref of refs) {
              if (content.source.toParagraph(ref.run, ref.offset) !== at) {
                broken.push(`${mode} ${JSON.stringify(source)} at ${at}`);
              }
            }
            // Where a character comes from cannot depend on where the cut is.
            const absolute = refs.map(ref => starts[ref.run] + ref.offset);
            const base = whole.source.toSource(at).map(ref => ref.offset);
            if (JSON.stringify(absolute) !== JSON.stringify(base)) {
              broken.push(`${mode} ${JSON.stringify(source)} source ${at}`);
            }
            const span = content.ownerSpans.find(
              entry => entry.start <= at && at < entry.end,
            );
            const first = refs[0];
            if (span === undefined || first === undefined) {
              broken.push(`${mode} ${JSON.stringify(source)} owner ${at}`);
            } else if (span.run !== first.run) {
              broken.push(`${mode} ${JSON.stringify(source)} owner ${at}`);
            }
          }
          for (let run = 0; run < runs.length; run++) {
            const piece = runs[run];
            const length = piece.kind === 'text' ? piece.text.length : 1;
            let last = -1;
            for (let offset = 0; offset <= length; offset++) {
              const mapped = content.source.toParagraph(run, offset);
              if (mapped < last) {
                broken.push(`${mode} ${JSON.stringify(source)} run ${run}`);
              }
              last = mapped;
            }
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('covers the paragraph with owner spans exactly once', () => {
    const broken: string[] = [];
    for (const source of CORPUS) {
      for (const mode of MODES) {
        for (const runs of partitions(source, 2)) {
          const withObject = [...runs, object(), text('tail', 'tail')];
          const content = buildParagraphContent(withObject, mode);
          let at = 0;
          for (const span of content.ownerSpans) {
            if (span.start !== at || span.end <= span.start) {
              broken.push(`${mode} ${JSON.stringify(source)}`);
            }
            at = span.end;
          }
          if (at !== content.text.length) {
            broken.push(`${mode} short ${JSON.stringify(source)}`);
          }
          const objectRuns = withObject.filter(run => run.kind === 'object');
          if (content.objects.length !== objectRuns.length) {
            broken.push(`${mode} object count ${JSON.stringify(source)}`);
          }
          let previous = -1;
          for (const entry of content.objects) {
            if (
              entry.at <= previous ||
              content.text[entry.at] !== OBJECT_MARKER
            ) {
              broken.push(`${mode} object offset ${JSON.stringify(source)}`);
            }
            previous = entry.at;
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
