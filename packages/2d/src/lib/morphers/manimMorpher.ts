import {PathMorpher} from './PathMorpher.js';

export interface ManimMorpherOptions {
  alignPoints?: boolean;
}

interface CubicSegment {
  p0: [number, number];
  p1: [number, number];
  p2: [number, number];
  p3: [number, number];
}

type Subpath = CubicSegment[];

function lineToCubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): CubicSegment {
  return {
    p0: [x0, y0],
    p1: [x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3],
    p2: [x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3],
    p3: [x1, y1],
  };
}

function quadToCubic(
  x0: number,
  y0: number,
  cpx: number,
  cpy: number,
  x1: number,
  y1: number,
): CubicSegment {
  return {
    p0: [x0, y0],
    p1: [x0 + (2 * (cpx - x0)) / 3, y0 + (2 * (cpy - y0)) / 3],
    p2: [x1 + (2 * (cpx - x1)) / 3, y1 + (2 * (cpy - y1)) / 3],
    p3: [x1, y1],
  };
}

function arcToCubic(
  x0: number,
  y0: number,
  rx: number,
  ry: number,
  xRotation: number,
  largeArc: number,
  sweep: number,
  x1: number,
  y1: number,
): CubicSegment[] {
  if (rx === 0 || ry === 0) return [lineToCubic(x0, y0, x1, y1)];

  const sinPhi = Math.sin((xRotation * Math.PI) / 180);
  const cosPhi = Math.cos((xRotation * Math.PI) / 180);

  const xp = (cosPhi * (x0 - x1)) / 2 + (sinPhi * (y0 - y1)) / 2;
  const yp = (-sinPhi * (x0 - x1)) / 2 + (cosPhi * (y0 - y1)) / 2;

  let rxSq = rx * rx;
  let rySq = ry * ry;
  const xpSq = xp * xp;
  const ypSq = yp * yp;

  const lambda = xpSq / rxSq + ypSq / rySq;
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  const denom = rxSq * ypSq + rySq * xpSq;
  if (denom === 0) return [lineToCubic(x0, y0, x1, y1)];

  let sq = Math.max(0, (rxSq * rySq - denom) / denom);
  sq = Math.sqrt(sq) * (largeArc === sweep ? -1 : 1);

  const cxp = (sq * rx * yp) / ry;
  const cyp = (-sq * ry * xp) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2;

  function angle(ux: number, uy: number, vx: number, vy: number): number {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let acos = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) acos = -acos;
    return acos;
  }

  const theta1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dtheta = angle(
    (xp - cxp) / rx,
    (yp - cyp) / ry,
    (-xp - cxp) / rx,
    (-yp - cyp) / ry,
  );

  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2)));
  const segAngle = dtheta / segments;
  const alpha = (4 / 3) * Math.tan(segAngle / 4);

  const result: CubicSegment[] = [];
  for (let i = 0; i < segments; i++) {
    const a1 = theta1 + i * segAngle;
    const a2 = theta1 + (i + 1) * segAngle;

    const cos1 = Math.cos(a1);
    const sin1 = Math.sin(a1);
    const cos2 = Math.cos(a2);
    const sin2 = Math.sin(a2);

    const ep1x = rx * cos1;
    const ep1y = ry * sin1;
    const ep2x = rx * cos2;
    const ep2y = ry * sin2;

    const cp1x = ep1x - alpha * rx * sin1;
    const cp1y = ep1y + alpha * ry * cos1;
    const cp2x = ep2x + alpha * rx * sin2;
    const cp2y = ep2y - alpha * ry * cos2;

    result.push({
      p0: [
        cosPhi * ep1x - sinPhi * ep1y + cx,
        sinPhi * ep1x + cosPhi * ep1y + cy,
      ],
      p1: [
        cosPhi * cp1x - sinPhi * cp1y + cx,
        sinPhi * cp1x + cosPhi * cp1y + cy,
      ],
      p2: [
        cosPhi * cp2x - sinPhi * cp2y + cx,
        sinPhi * cp2x + cosPhi * cp2y + cy,
      ],
      p3: [
        cosPhi * ep2x - sinPhi * ep2y + cx,
        sinPhi * ep2x + cosPhi * ep2y + cy,
      ],
    });
  }
  return result;
}

function parseToCubicSubpaths(d: string): Subpath[] {
  const commands = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g);
  if (!commands) return [];

  const subpaths: Subpath[] = [];
  let currentSubpath: CubicSegment[] = [];
  let currentX = 0;
  let currentY = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;
  let lastControlX = 0;
  let lastControlY = 0;

  function pushSegment(seg: CubicSegment) {
    currentSubpath.push(seg);
    currentX = seg.p3[0];
    currentY = seg.p3[1];
  }

  function flushSubpath() {
    if (currentSubpath.length > 0) {
      subpaths.push(currentSubpath);
      currentSubpath = [];
    }
  }

  for (const cmd of commands) {
    const type = cmd[0];
    const argStr = cmd.slice(1).trim();
    const args = (argStr.match(/-?[0-9]*\.?[0-9]+(?:e[-+]?\d+)?/gi) ?? []).map(
      Number,
    );

    switch (type) {
      case 'M':
        flushSubpath();
        currentX = args[0];
        currentY = args[1];
        subpathStartX = currentX;
        subpathStartY = currentY;
        for (let i = 2; i < args.length; i += 2) {
          pushSegment(lineToCubic(currentX, currentY, args[i], args[i + 1]));
        }
        break;
      case 'm':
        flushSubpath();
        currentX += args[0];
        currentY += args[1];
        subpathStartX = currentX;
        subpathStartY = currentY;
        for (let i = 2; i < args.length; i += 2) {
          pushSegment(
            lineToCubic(
              currentX,
              currentY,
              currentX + args[i],
              currentY + args[i + 1],
            ),
          );
        }
        break;
      case 'L':
        for (let i = 0; i < args.length; i += 2) {
          pushSegment(lineToCubic(currentX, currentY, args[i], args[i + 1]));
        }
        break;
      case 'l':
        for (let i = 0; i < args.length; i += 2) {
          pushSegment(
            lineToCubic(
              currentX,
              currentY,
              currentX + args[i],
              currentY + args[i + 1],
            ),
          );
        }
        break;
      case 'H':
        for (let i = 0; i < args.length; i++) {
          pushSegment(lineToCubic(currentX, currentY, args[i], currentY));
        }
        break;
      case 'h':
        for (let i = 0; i < args.length; i++) {
          pushSegment(
            lineToCubic(currentX, currentY, currentX + args[i], currentY),
          );
        }
        break;
      case 'V':
        for (let i = 0; i < args.length; i++) {
          pushSegment(lineToCubic(currentX, currentY, currentX, args[i]));
        }
        break;
      case 'v':
        for (let i = 0; i < args.length; i++) {
          pushSegment(
            lineToCubic(currentX, currentY, currentX, currentY + args[i]),
          );
        }
        break;
      case 'C':
        for (let i = 0; i < args.length; i += 6) {
          pushSegment({
            p0: [currentX, currentY],
            p1: [args[i], args[i + 1]],
            p2: [args[i + 2], args[i + 3]],
            p3: [args[i + 4], args[i + 5]],
          });
          lastControlX = args[i + 2];
          lastControlY = args[i + 3];
        }
        break;
      case 'c':
        for (let i = 0; i < args.length; i += 6) {
          const cp1x = currentX + args[i];
          const cp1y = currentY + args[i + 1];
          const cp2x = currentX + args[i + 2];
          const cp2y = currentY + args[i + 3];
          const endX = currentX + args[i + 4];
          const endY = currentY + args[i + 5];
          pushSegment({
            p0: [currentX, currentY],
            p1: [cp1x, cp1y],
            p2: [cp2x, cp2y],
            p3: [endX, endY],
          });
          lastControlX = cp2x;
          lastControlY = cp2y;
        }
        break;
      case 'S':
        for (let i = 0; i < args.length; i += 4) {
          const refX = 2 * currentX - lastControlX;
          const refY = 2 * currentY - lastControlY;
          pushSegment({
            p0: [currentX, currentY],
            p1: [refX, refY],
            p2: [args[i], args[i + 1]],
            p3: [args[i + 2], args[i + 3]],
          });
          lastControlX = args[i];
          lastControlY = args[i + 1];
        }
        break;
      case 's':
        for (let i = 0; i < args.length; i += 4) {
          const refX = 2 * currentX - lastControlX;
          const refY = 2 * currentY - lastControlY;
          const cp2x = currentX + args[i];
          const cp2y = currentY + args[i + 1];
          const endX = currentX + args[i + 2];
          const endY = currentY + args[i + 3];
          pushSegment({
            p0: [currentX, currentY],
            p1: [refX, refY],
            p2: [cp2x, cp2y],
            p3: [endX, endY],
          });
          lastControlX = cp2x;
          lastControlY = cp2y;
        }
        break;
      case 'Q':
        for (let i = 0; i < args.length; i += 4) {
          pushSegment(
            quadToCubic(
              currentX,
              currentY,
              args[i],
              args[i + 1],
              args[i + 2],
              args[i + 3],
            ),
          );
          lastControlX = args[i];
          lastControlY = args[i + 1];
        }
        break;
      case 'q':
        for (let i = 0; i < args.length; i += 4) {
          const cpx = currentX + args[i];
          const cpy = currentY + args[i + 1];
          const endX = currentX + args[i + 2];
          const endY = currentY + args[i + 3];
          pushSegment(quadToCubic(currentX, currentY, cpx, cpy, endX, endY));
          lastControlX = cpx;
          lastControlY = cpy;
        }
        break;
      case 'T':
        for (let i = 0; i < args.length; i += 2) {
          const cpx = 2 * currentX - lastControlX;
          const cpy = 2 * currentY - lastControlY;
          pushSegment(
            quadToCubic(currentX, currentY, cpx, cpy, args[i], args[i + 1]),
          );
          lastControlX = cpx;
          lastControlY = cpy;
        }
        break;
      case 't':
        for (let i = 0; i < args.length; i += 2) {
          const cpx = 2 * currentX - lastControlX;
          const cpy = 2 * currentY - lastControlY;
          const endX = currentX + args[i];
          const endY = currentY + args[i + 1];
          pushSegment(quadToCubic(currentX, currentY, cpx, cpy, endX, endY));
          lastControlX = cpx;
          lastControlY = cpy;
        }
        break;
      case 'A':
        for (let i = 0; i < args.length; i += 7) {
          const arcSegs = arcToCubic(
            currentX,
            currentY,
            args[i],
            args[i + 1],
            args[i + 2],
            args[i + 3],
            args[i + 4],
            args[i + 5],
            args[i + 6],
          );
          for (const seg of arcSegs) pushSegment(seg);
        }
        break;
      case 'a':
        for (let i = 0; i < args.length; i += 7) {
          const arcSegs = arcToCubic(
            currentX,
            currentY,
            args[i],
            args[i + 1],
            args[i + 2],
            args[i + 3],
            args[i + 4],
            currentX + args[i + 5],
            currentY + args[i + 6],
          );
          for (const seg of arcSegs) pushSegment(seg);
        }
        break;
      case 'Z':
      case 'z':
        if (currentX !== subpathStartX || currentY !== subpathStartY) {
          pushSegment(
            lineToCubic(currentX, currentY, subpathStartX, subpathStartY),
          );
        }
        flushSubpath();
        currentX = subpathStartX;
        currentY = subpathStartY;
        break;
    }
  }

  flushSubpath();
  return subpaths;
}

function degenerateSubpath(x: number, y: number): Subpath {
  return [
    {
      p0: [x, y],
      p1: [x, y],
      p2: [x, y],
      p3: [x, y],
    },
  ];
}

function subpathCenter(subpath: Subpath): [number, number] {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const seg of subpath) {
    sx += seg.p0[0] + seg.p3[0];
    sy += seg.p0[1] + seg.p3[1];
    count += 2;
  }
  return count > 0 ? [sx / count, sy / count] : [0, 0];
}

function alignSubpathCounts(
  a: Subpath[],
  b: Subpath[],
): [Subpath[], Subpath[]] {
  const maxLen = Math.max(a.length, b.length);
  const resultA: Subpath[] = [];
  const resultB: Subpath[] = [];

  for (let i = 0; i < maxLen; i++) {
    if (i < a.length && i < b.length) {
      resultA.push(a[i]);
      resultB.push(b[i]);
    } else if (i < a.length) {
      resultA.push(a[i]);
      const center = subpathCenter(a[i]);
      resultB.push(degenerateSubpath(center[0], center[1]));
    } else {
      const center = subpathCenter(b[i]);
      resultA.push(degenerateSubpath(center[0], center[1]));
      resultB.push(b[i]);
    }
  }

  return [resultA, resultB];
}

function splitCubicAt(
  seg: CubicSegment,
  t: number,
): [CubicSegment, CubicSegment] {
  const [x0, y0] = seg.p0;
  const [x1, y1] = seg.p1;
  const [x2, y2] = seg.p2;
  const [x3, y3] = seg.p3;

  const ax = x0 + (x1 - x0) * t;
  const ay = y0 + (y1 - y0) * t;
  const bx = x1 + (x2 - x1) * t;
  const by = y1 + (y2 - y1) * t;
  const cx = x2 + (x3 - x2) * t;
  const cy = y2 + (y3 - y2) * t;

  const dx = ax + (bx - ax) * t;
  const dy = ay + (by - ay) * t;
  const ex = bx + (cx - bx) * t;
  const ey = by + (cy - by) * t;

  const fx = dx + (ex - dx) * t;
  const fy = dy + (ey - dy) * t;

  return [
    {p0: [x0, y0], p1: [ax, ay], p2: [dx, dy], p3: [fx, fy]},
    {p0: [fx, fy], p1: [ex, ey], p2: [cx, cy], p3: [x3, y3]},
  ];
}

function subdivideSegment(seg: CubicSegment, n: number): CubicSegment[] {
  if (n <= 1) return [seg];

  const result: CubicSegment[] = [];
  let remaining = seg;
  for (let i = 0; i < n - 1; i++) {
    const t = 1 / (n - i);
    const [left, right] = splitCubicAt(remaining, t);
    result.push(left);
    remaining = right;
  }
  result.push(remaining);
  return result;
}

function subdivideSubpath(subpath: Subpath, targetCount: number): Subpath {
  if (subpath.length >= targetCount) return subpath;

  const ratio = targetCount / subpath.length;
  const result: CubicSegment[] = [];
  let allocated = 0;

  for (let i = 0; i < subpath.length; i++) {
    const idealEnd = Math.round(ratio * (i + 1));
    const subdivisions = idealEnd - allocated;
    result.push(...subdivideSegment(subpath[i], subdivisions));
    allocated = idealEnd;
  }

  return result;
}

function alignSegmentCounts(a: Subpath, b: Subpath): [Subpath, Subpath] {
  if (a.length === b.length) return [a, b];

  const target = Math.max(a.length, b.length);
  return [subdivideSubpath(a, target), subdivideSubpath(b, target)];
}

function dist2(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function totalControlPointDistance(a: Subpath, b: Subpath): number {
  let total = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    total += dist2(a[i].p0, b[i].p0);
    total += dist2(a[i].p1, b[i].p1);
    total += dist2(a[i].p2, b[i].p2);
    total += dist2(a[i].p3, b[i].p3);
  }
  return total;
}

function rotateCurvesToMinimizeDistance(from: Subpath, to: Subpath): Subpath {
  if (from.length <= 1) return from;

  const first = from[0];
  const last = from[from.length - 1];
  const isClosed =
    Math.abs(first.p0[0] - last.p3[0]) < 0.5 &&
    Math.abs(first.p0[1] - last.p3[1]) < 0.5;

  if (!isClosed) return from;

  let bestRotation = 0;
  let bestDistance = totalControlPointDistance(from, to);

  for (let r = 1; r < from.length; r++) {
    const rotated = [...from.slice(r), ...from.slice(0, r)];
    const d = totalControlPointDistance(rotated, to);
    if (d < bestDistance) {
      bestDistance = d;
      bestRotation = r;
    }
  }

  if (bestRotation === 0) return from;
  return [...from.slice(bestRotation), ...from.slice(0, bestRotation)];
}

function subpathsToPathString(subpaths: Subpath[]): string {
  const parts: string[] = [];
  for (const subpath of subpaths) {
    if (subpath.length === 0) continue;
    parts.push(`M${subpath[0].p0[0]},${subpath[0].p0[1]}`);
    for (const seg of subpath) {
      parts.push(
        `C${seg.p1[0]},${seg.p1[1]} ${seg.p2[0]},${seg.p2[1]} ${seg.p3[0]},${seg.p3[1]}`,
      );
    }
  }
  return parts.join('');
}

function lerpPoint(
  a: [number, number],
  b: [number, number],
  t: number,
): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Create a path morpher that uses the Manim-inspired algorithm for
 * cubic-bezier-based path interpolation with intelligent subpath alignment,
 * segment equalization, and closed-path rotation optimization.
 */
export function manimMorpher(options: ManimMorpherOptions = {}): PathMorpher {
  const {alignPoints: doAlign = true} = options;

  return {
    createInterpolator(fromPath: string, toPath: string) {
      let fromSubpaths = parseToCubicSubpaths(fromPath);
      let toSubpaths = parseToCubicSubpaths(toPath);

      if (fromSubpaths.length === 0 || toSubpaths.length === 0) {
        return (progress: number) => (progress < 0.5 ? fromPath : toPath);
      }

      [fromSubpaths, toSubpaths] = alignSubpathCounts(fromSubpaths, toSubpaths);

      const alignedFrom: Subpath[] = [];
      const alignedTo: Subpath[] = [];

      for (let i = 0; i < fromSubpaths.length; i++) {
        const [af, at] = alignSegmentCounts(fromSubpaths[i], toSubpaths[i]);
        const rotated = doAlign ? rotateCurvesToMinimizeDistance(af, at) : af;
        alignedFrom.push(rotated);
        alignedTo.push(at);
      }

      return (progress: number): string => {
        if (progress <= 0) return fromPath;
        if (progress >= 1) return toPath;

        const result: Subpath[] = [];
        for (let i = 0; i < alignedFrom.length; i++) {
          const fromSp = alignedFrom[i];
          const toSp = alignedTo[i];
          const interpolated: CubicSegment[] = [];

          for (let j = 0; j < fromSp.length; j++) {
            interpolated.push({
              p0: lerpPoint(fromSp[j].p0, toSp[j].p0, progress),
              p1: lerpPoint(fromSp[j].p1, toSp[j].p1, progress),
              p2: lerpPoint(fromSp[j].p2, toSp[j].p2, progress),
              p3: lerpPoint(fromSp[j].p3, toSp[j].p3, progress),
            });
          }
          result.push(interpolated);
        }

        return subpathsToPathString(result);
      };
    },
  };
}
