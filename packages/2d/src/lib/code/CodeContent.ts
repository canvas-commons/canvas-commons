import {
  ContentChange,
  ContentPieces,
  ContentUnit,
  Replacement,
  UnitKey,
  createUnitKey,
  spliceContent,
} from '../content';
import {defaultDiffer} from './CodeDiffer';
import {PossibleCodeFragment} from './CodeFragment';
import {isCodeMetrics} from './CodeMetrics';
import {CodePoint, CodeRange} from './CodeRange';
import {
  CodeScope,
  CodeTag,
  PossibleCodeScope,
  isCodeScope,
  resolveCodeTag,
} from './CodeScope';
import {CodeTokenizer} from './CodeTokenizer';

/** A reactive tag; it stays one unit so it keeps reacting. */
export type ReactiveCodeTag = () =>
  PossibleCodeFragment | CodeScope | CodeTag[];

export type CodePiece = string | ReactiveCodeTag;

/** Lines keep their newline, so a unit never spans two lines. */
export function segmentCode(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (
    let end = text.indexOf('\n');
    end !== -1;
    end = text.indexOf('\n', start)
  ) {
    lines.push(text.slice(start, end + 1));
    start = end + 1;
  }
  if (start < text.length) {
    lines.push(text.slice(start));
  }
  return lines;
}

export function pieceText(piece: CodePiece): string {
  return typeof piece === 'string' ? piece : resolveCodeTag(piece, true);
}

export const CodePieces: ContentPieces<CodePiece> = {
  text: pieceText,
  slice(piece, from, to) {
    const text = pieceText(piece);
    return typeof piece !== 'string' && from === 0 && to === text.length
      ? [piece]
      : segmentCode(text.slice(from, to));
  },
  atomic: piece => typeof piece !== 'string',
  join: (first, second) =>
    typeof first === 'string' &&
    typeof second === 'string' &&
    !first.endsWith('\n')
      ? first + second
      : null,
};

function fragmentText(value: string | {content: string}): string {
  return typeof value === 'string' ? value : value.content;
}

interface TagVisitor {
  kept(text: string): void;
  replaced(before: string, after: string): void;
}

/** Walk tags as their target pieces, telling `visit` what each one was. */
function walkTags(
  tag: CodeTag | PossibleCodeScope,
  pieces: CodePiece[],
  visit?: TagVisitor,
) {
  if (typeof tag === 'string') {
    visit?.kept(tag);
    pieces.push(...segmentCode(tag));
  } else if (typeof tag === 'function') {
    visit?.kept(pieceText(tag));
    pieces.push(tag);
  } else if (Array.isArray(tag)) {
    for (const child of tag) walkTags(child, pieces, visit);
  } else if (isCodeScope(tag)) {
    for (const child of tag.fragments) walkTags(child, pieces, visit);
  } else if (isCodeMetrics(tag)) {
    visit?.kept(tag.content);
    pieces.push(...segmentCode(tag.content));
  } else {
    const before = fragmentText(tag.before);
    const after = fragmentText(tag.after);
    if (before === after) {
      visit?.kept(before);
    } else {
      visit?.replaced(before, after);
    }
    pieces.push(...segmentCode(after));
  }
}

export function codePieces(value: CodeTag | PossibleCodeScope): CodePiece[] {
  const pieces: CodePiece[] = [];
  walkTags(value, pieces);
  return pieces;
}

/** The keys of the units of one code value. */
export interface CodeKeys {
  readonly value: CodeScope;
  readonly keys: readonly UnitKey[];
}

/** The units of `value`, with the keys recorded for it. */
export function codeUnits(
  value: CodeScope,
  recorded: CodeKeys | null,
): ContentUnit<CodePiece>[] {
  const pieces = codePieces(value);
  const keys =
    recorded?.value === value && recorded.keys.length === pieces.length
      ? recorded.keys
      : null;
  return pieces.map((piece, i) => ({key: keys?.[i] ?? createUnitKey(), piece}));
}

/** The value that shows `units`, and the keys recorded for it. */
export function codeValue(units: readonly ContentUnit<CodePiece>[]): CodeKeys {
  return {
    value: {progress: 0, fragments: units.map(unit => unit.piece)},
    keys: units.map(unit => unit.key),
  };
}

function pointOffset(
  lines: readonly string[],
  [row, column]: CodePoint,
  end: boolean,
): {offset: number; padding: string} {
  let offset = 0;
  for (let i = 0; i < Math.min(row, lines.length); i++) {
    offset += lines[i].length + 1;
  }
  if (row >= lines.length) {
    return {
      offset: offset - 1,
      padding: end
        ? ''
        : '\n'.repeat(row - lines.length + 1) + ' '.repeat(column),
    };
  }
  const line = lines[row];
  if (column <= line.length) {
    return {offset: offset + column, padding: ''};
  }
  return end
    ? {
        offset: offset + line.length + (row < lines.length - 1 ? 1 : 0),
        padding: '',
      }
    : {offset: offset + line.length, padding: ' '.repeat(column - line.length)};
}

/** Replace `[from, to)` of the units with `inserted`. */
export function spliceUnits(
  units: readonly ContentUnit<CodePiece>[],
  from: number,
  to: number,
  inserted: readonly CodePiece[],
): ContentChange<CodePiece> {
  return spliceContent(CodePieces, units, [{from, to, inserted}]);
}

/** Replace `range` of the units with `tag`, padding a point past the end. */
export function replaceRange(
  units: readonly ContentUnit<CodePiece>[],
  range: CodeRange,
  tag: CodeTag,
): ContentChange<CodePiece> {
  const lines = units
    .map(({piece}) => pieceText(piece))
    .join('')
    .split('\n');
  let [from, to] = range;
  if (from[0] > to[0] || (from[0] === to[0] && from[1] > to[1])) {
    [from, to] = [to, from];
  }
  const start = pointOffset(lines, from, false);
  const end = Math.max(start.offset, pointOffset(lines, to, true).offset);
  return spliceUnits(
    units,
    start.offset,
    end,
    codePieces([start.padding, tag]),
  );
}

/** The edit that a diff of the two sources describes. */
export function pairCode(
  before: string,
  after: string,
  tokenize: CodeTokenizer,
): Replacement[] {
  const replacements: Replacement[] = [];
  let offset = 0;
  const scope = (code: string): CodeScope => ({progress: 0, fragments: [code]});
  for (const fragment of defaultDiffer(scope(before), scope(after), tokenize)) {
    if (typeof fragment === 'string') {
      offset += fragment.length;
    } else if (typeof fragment === 'object' && 'before' in fragment) {
      const removed = fragmentText(fragment.before);
      replacements.push({
        from: offset,
        to: offset + removed.length,
        length: fragmentText(fragment.after).length,
      });
      offset += removed.length;
    }
  }
  return replacements;
}

/** The edit of a template whose tags mark changes. */
export function templateChange(
  current: string,
  tags: CodeTag[],
  tokenize: CodeTokenizer,
): ContentChange<CodePiece> {
  const next: CodePiece[] = [];
  const replacements: Replacement[] = [];
  let before = '';
  walkTags(tags, next, {
    kept(text) {
      before += text;
    },
    replaced(removed, added) {
      replacements.push({
        from: before.length,
        to: before.length + removed.length,
        length: added.length,
      });
      before += removed;
    },
  });
  return before === current
    ? {next, replacements}
    : {
        next,
        replacements: pairCode(current, next.map(pieceText).join(''), tokenize),
      };
}
