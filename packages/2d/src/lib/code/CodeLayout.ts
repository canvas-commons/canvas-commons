import {Vector2} from '@canvas-commons/core';
import {ContentLayout, ContentMotion, ContentUnit, UnitKey} from '../content';
import {CodePiece, pieceText} from './CodeContent';
import {CodeHighlighter, HighlightResult} from './CodeHighlighter';

/** A run of text in one color. */
export interface CodeColorRun {
  readonly from: number;
  readonly to: number;
  readonly color: string | null;
}

/** How a unit looked before an edit. */
export interface CodeSnapshot {
  readonly text: string;
  /** The cell the text started at. */
  readonly column: number;
  readonly colors: readonly CodeColorRun[];
}

export interface CodeFragmentDrawingInfo {
  text: string;
  position: Vector2;
  characterSize: Vector2;
  cursor: Vector2;
  fill: string;
  time: number;
  alpha: number;
  scale: number;
}

/** The rows a change removes and inserts. */
export interface CodeChange {
  readonly removedRows: number;
  readonly insertedRows: number;
}

export type CodeMotion = ContentMotion<CodePiece, CodeSnapshot, CodeChange>;

/** The width of a text in cells of the monospace grid. */
export type CodeCells = (text: string) => number;

/** A nested code signal: its own units and motion. */
export interface NestedCode {
  readonly units: readonly ContentUnit<CodePiece>[];
  readonly motion: CodeMotion;
}

export type FindNestedCode = (piece: CodePiece) => NestedCode | null;

/** A unit of a code signal that the units of its value are nested in. */
export interface CodeEmbed {
  readonly key: UnitKey;
  readonly motion: CodeMotion;
}

export interface CodeLayoutUnit {
  readonly key: UnitKey;
  readonly motion: CodeMotion;
  readonly embeds: readonly CodeEmbed[];
  readonly from: number;
  readonly text: string;
  /** The cell and row the unit starts at. */
  readonly start: Vector2;
}

export interface CodeRegion {
  readonly from: number;
  readonly embeds: readonly CodeEmbed[];
}

/** Advance a grid cursor over `text`. */
export function advance(cells: CodeCells, at: Vector2, text: string): Vector2 {
  const lines = text.split('\n');
  if (lines.length === 1) {
    return new Vector2(at.x + cells(text), at.y);
  }
  return new Vector2(cells(lines[lines.length - 1]), at.y + lines.length - 1);
}

/** Units on a monospace grid, in cells and rows. */
export class CodeLayout implements ContentLayout {
  public readonly units: CodeLayoutUnit[] = [];
  public readonly regions = new Map<CodeMotion, CodeRegion>();
  public readonly text: string;
  public readonly size: Vector2;
  private readonly starts = new Map<UnitKey, Vector2>();
  private readonly lineStarts: number[] = [0];

  public constructor(
    units: readonly ContentUnit<CodePiece>[],
    motion: CodeMotion,
    private readonly cells: CodeCells,
    nested: FindNestedCode,
  ) {
    let text = '';
    let at = Vector2.zero;
    let width = 0;
    const walk = (
      units: readonly ContentUnit<CodePiece>[],
      motion: CodeMotion,
      embeds: readonly CodeEmbed[],
    ) => {
      for (const {key, piece} of units) {
        this.starts.set(key, at);
        const inner = nested(piece);
        if (inner) {
          const innerEmbeds = [...embeds, {key, motion}];
          if (!this.regions.has(inner.motion)) {
            this.regions.set(inner.motion, {
              from: text.length,
              embeds: innerEmbeds,
            });
          }
          walk(inner.units, inner.motion, innerEmbeds);
          continue;
        }
        const unitText = pieceText(piece);
        this.units.push({
          key,
          motion,
          embeds,
          from: text.length,
          text: unitText,
          start: at,
        });
        for (
          let i = unitText.indexOf('\n');
          i !== -1;
          i = unitText.indexOf('\n', i + 1)
        ) {
          this.lineStarts.push(text.length + i + 1);
        }
        text += unitText;
        const end = advance(cells, at, unitText);
        const lines = unitText.split('\n');
        width = Math.max(width, at.x + cells(lines[0]), end.x);
        for (let i = 1; i < lines.length - 1; i++) {
          width = Math.max(width, cells(lines[i]));
        }
        at = end;
      }
    };
    walk(units, motion, []);
    this.text = text;
    this.size = new Vector2(width, this.units.length > 0 ? at.y + 1 : 0);
  }

  public position(key: UnitKey): Vector2 | undefined {
    return this.starts.get(key);
  }

  public caret(offset: number): Vector2 {
    const units = this.units;
    let low = 0;
    let high = units.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (units[middle].from <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    const unit = units[low];
    if (!unit) {
      return Vector2.zero;
    }
    return advance(
      this.cells,
      unit.start,
      unit.text.slice(0, offset - unit.from),
    );
  }

  /** The row and the column, in characters, of an offset. */
  public point(offset: number): [number, number] {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.lineStarts[middle] <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return [low, offset - this.lineStarts[low]];
  }
}

export type CodeHighlight = (index: number) => HighlightResult;

/** A highlight of `code`, or `null` when the highlighter is not ready. */
export function highlightOf(
  highlighter: CodeHighlighter | null | undefined,
  code: string,
): CodeHighlight | null {
  if (!highlighter?.initialize()) {
    return null;
  }
  const cache = highlighter.prepare(code);
  return index => highlighter.highlight(index, cache);
}

/** The colors of `[from, to)` of a highlighted text, offset from `from`. */
export function colorRuns(
  highlight: CodeHighlight | null,
  from: number,
  to: number,
): CodeColorRun[] {
  const runs: CodeColorRun[] = [];
  for (let i = from; i < to;) {
    const {color, skipAhead} = highlight?.(i) ?? {
      color: null,
      skipAhead: to - i,
    };
    const end = Math.min(to, i + Math.max(1, skipAhead));
    const last = runs[runs.length - 1];
    if (last && last.color === color) {
      runs[runs.length - 1] = {...last, to: end - from};
    } else {
      runs.push({from: i - from, to: end - from, color});
    }
    i = end;
  }
  return runs;
}

export function colorAt(
  runs: readonly CodeColorRun[],
  offset: number,
): string | null {
  for (const run of runs) {
    if (offset < run.to) return run.color;
  }
  return null;
}
