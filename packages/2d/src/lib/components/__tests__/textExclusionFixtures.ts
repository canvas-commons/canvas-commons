import {BBox, Vector2} from '@canvas-commons/core';
import {Curve} from '../Curve';
import {Layout} from '../Layout';
import {Txt, TxtProps} from '../Txt';
import {recordingTextContext} from './recordingTextContext';

export const TEXT =
  'text that flows around a badge placed beside it by the same layout, ' +
  'line after line, until the badge is behind it';

export const PROPS: TxtProps = {fontSize: 10, lineHeight: 20, text: TEXT};

/** What each line of a node shows and where it starts, in its own space. */
export function linesOf(txt: Txt): string[] {
  return txt
    .textLines()
    .lines.map(
      line =>
        `${line.top.toFixed(3)}:` +
        line.fragments
          .map(fragment => `${fragment.x.toFixed(3)}/${fragment.text}`)
          .join(''),
    );
}

/** The lines a node shows and the height they take. */
export function layoutOf(txt: Txt): {lines: string[]; height: number} {
  return {lines: linesOf(txt), height: txt.textLines().height};
}

/**
 * The layout a text of the same box takes when the badge is handed to it as a
 * polygon in its own space, read once the flex layout has settled.
 */
export function referenceLayout(
  txt: Txt,
  outline: Vector2[],
  badge: Layout,
  horizontalPadding = 0,
): {lines: string[]; height: number} {
  const toTxt = txt.worldToLocal().multiply(badge.localToWorld());
  const reference = new Txt({
    ...PROPS,
    width: txt.size().x,
    height: txt.size().y,
    exclusions: [
      {
        kind: 'polygon',
        points: outline.map(point => point.transformAsPoint(toTxt)),
        horizontalPadding,
      },
    ],
  });
  return layoutOf(reference);
}

/**
 * Each line's text and its start relative to the first line's, as the queries
 * report them and as the paint draws them.
 */
export function queriedRows(txt: Txt): string[] {
  const lines = txt.textLines().lines;
  const start = (index: number) =>
    Math.min(...lines[index].fragments.map(fragment => fragment.x));
  return lines.map(
    (line, index) =>
      `${(start(index) - start(0)).toFixed(3)}:` +
      [...line.fragments]
        .sort((a, b) => a.x - b.x)
        .map(fragment => fragment.text)
        .join(''),
  );
}

export function paintedRows(root: Layout): string[] {
  const {calls, context} = recordingTextContext();
  root.render(context);
  const rows = new Map<number, {x: number; text: string}[]>();
  for (const call of calls) {
    if (call.kind !== 'fill') continue;
    const y = Math.round(call.penY * 1000);
    rows.set(y, [...(rows.get(y) ?? []), {x: call.penX, text: call.text}]);
  }
  const ordered = [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, row]) => row.sort((a, b) => a.x - b.x));
  return ordered.map(
    row =>
      `${(row[0].x - ordered[0][0].x).toFixed(3)}:` +
      row.map(({text}) => text).join(''),
  );
}

export function boxOf(badge: Layout): Vector2[] {
  return BBox.fromSizeCentered(badge.size()).corners;
}

/** A curve's profile, sampled no more than 8px apart. */
export function profileOf(curve: Curve): Vector2[] {
  const points: Vector2[] = [];
  curve.profile().segments.forEach((segment, index) => {
    const steps = Math.max(1, Math.ceil(segment.arcLength / 8));
    for (let i = index === 0 ? 0 : 1; i <= steps; i++) {
      points.push(segment.getPoint(i / steps).position);
    }
  });
  return points;
}
