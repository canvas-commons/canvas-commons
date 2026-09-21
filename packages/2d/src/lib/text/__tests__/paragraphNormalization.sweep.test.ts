import {prepareWithSegments} from '@chenglou/pretext';
import {describe, expect, it} from 'vitest';
import {mockTextContext} from '../../components/__tests__/mockTextContext';
import {TEXTS} from '../../components/__tests__/textInvariants';
import type {WhiteSpaceMode} from '../pretext-derived/normalizeWhitespace';
import {
  normalizeWhitespace,
  normalizeWhitespaceNormal,
  normalizeWhitespacePreWrap,
  normalizeWhitespaceText,
} from '../pretext-derived/normalizeWhitespace';

mockTextContext(10);

const FONT = '16px sans-serif';
const MODES: WhiteSpaceMode[] = ['normal', 'pre-line', 'pre-wrap'];

/** The pretext mode our mode normalizes for. */
function pretextMode(mode: WhiteSpaceMode): 'normal' | 'pre-wrap' {
  return mode === 'normal' ? 'normal' : 'pre-wrap';
}

/** The text pretext itself holds for `text` under `mode`. */
function pretextText(text: string, mode: WhiteSpaceMode): string {
  return prepareWithSegments(text, FONT, {
    whiteSpace: pretextMode(mode),
  }).segments.join('');
}

const ALPHABET = [' ', '\t', '\n', '\r', '\f', 'a'];

function whitespaceStrings(length: number): string[] {
  if (length === 0) return [''];
  const shorter = whitespaceStrings(length - 1);
  const out: string[] = [];
  for (const head of ALPHABET) {
    for (const tail of shorter) out.push(head + tail);
  }
  return out;
}

const GENERATED = [1, 2, 3, 4].flatMap(whitespaceStrings);
const CORPUS = [...TEXTS.map(entry => entry.text), ...GENERATED];

describe('paragraph normalization', () => {
  it('holds the upstream rules', () => {
    const different: string[] = [];
    for (const text of CORPUS) {
      if (
        normalizeWhitespace(text, 'normal').text !==
        normalizeWhitespaceNormal(text)
      ) {
        different.push(`normal ${JSON.stringify(text)}`);
      }
      if (
        normalizeWhitespace(text, 'pre-wrap').text !==
        normalizeWhitespacePreWrap(text)
      ) {
        different.push(`pre-wrap ${JSON.stringify(text)}`);
      }
    }
    expect(different).toEqual([]);
  });

  it('gives the same text with and without the source map', () => {
    const different: string[] = [];
    for (const text of CORPUS) {
      for (const mode of MODES) {
        if (
          normalizeWhitespaceText(text, mode) !==
          normalizeWhitespace(text, mode).text
        ) {
          different.push(`${mode} ${JSON.stringify(text)}`);
        }
      }
    }
    expect(different).toEqual([]);
  });

  it('gives the text pretext gives', () => {
    const different: string[] = [];
    for (const text of CORPUS) {
      for (const mode of ['normal', 'pre-wrap'] as const) {
        const ours = normalizeWhitespace(text, mode).text;
        const theirs = pretextText(text, mode);
        if (ours !== theirs) {
          different.push(
            `${mode} ${JSON.stringify(text)}: ${JSON.stringify(ours)} vs ${JSON.stringify(theirs)}`,
          );
        }
      }
    }
    expect(different).toEqual([]);
  });

  it('drops a pre-line space or tab that touches a break', () => {
    const cases: [string, string][] = [
      ['a \r\n\tb', 'a\nb'],
      ['a \n b', 'a\nb'],
      ['a\t\t\n\t\tb', 'a\nb'],
      ['a \n\n b', 'a\n\nb'],
      [' \n a \n ', '\na\n'],
      ['a \t b', 'a b'],
    ];
    for (const [source, expected] of cases) {
      expect(
        `${JSON.stringify(source)} ${
          normalizeWhitespace(source, 'pre-line').text
        }`,
      ).toBe(`${JSON.stringify(source)} ${expected}`);
    }
  });

  it('gives a removed pre-line space the offset of its break', () => {
    const {text, offsets, sourceStarts, sourceEnds} = normalizeWhitespace(
      'a \r\n\tb',
      'pre-line',
    );

    expect(text).toBe('a\nb');
    // The space, the CRLF and the tab all land on the break they touch.
    expect([...offsets]).toEqual([0, 1, 1, 1, 1, 2, 3]);
    expect([...sourceStarts]).toEqual([0, 1, 5]);
    expect([...sourceEnds]).toEqual([1, 5, 6]);
  });

  it('normalizes once: pretext leaves our text as it is', () => {
    const changed: string[] = [];
    for (const text of CORPUS) {
      for (const mode of MODES) {
        const ours = normalizeWhitespace(text, mode).text;
        if (pretextText(ours, mode) !== ours) {
          changed.push(`${mode} ${JSON.stringify(text)}`);
        }
      }
    }
    expect(changed).toEqual([]);
  });
});
