import type {Scene} from '@canvas-commons/core';
import type {EditableVariable} from '@canvas-commons/core/lib/scenes/editableVariables';
import {useMemo, useRef} from 'preact/hooks';
import {useApplication, useViewportContext} from '../../contexts';
import {useScenes, useViewportMatrix} from '../../hooks';
import type {PluginDrawFunction} from '../../plugin';
import {OverlayWrapper} from '../../plugin';
import {PROPERTY_INSPECTOR_KEY} from './PropertyInspector';

const HANDLE_RADIUS = 6;
const HANDLE_STROKE = 2;
const BBOX_HANDLE_SIZE = 8;
const HIT_SLOP = 8;

interface GizmoEntry {
  property: EditableVariable;
  scene: Scene;
}

type BBoxHandle =
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
  | 'body';

interface DragState {
  propertyName: string;
  scene: Scene;
  type: 'vector2' | 'bbox';
  handle: 'center' | BBoxHandle;
  startValue: Record<string, number>;
  startPointer: {x: number; y: number};
  startOffset: {x: number; y: number};
}

function getPropertyTransformMatrix(
  viewportMatrix: DOMMatrix,
  scene: Scene,
  transform?: () => DOMMatrix,
): DOMMatrix {
  if (!transform) {
    return viewportMatrix;
  }
  try {
    return viewportMatrix.multiply(transform());
  } catch (e) {
    scene.logger.warn(`Editable property transform failed: ${e}`);
    return viewportMatrix;
  }
}

function collectGizmoEntries(
  scenes: Scene[],
  currentScene: Scene | undefined,
  types: string[],
): GizmoEntry[] {
  const result: GizmoEntry[] = [];
  for (const scene of scenes) {
    if (scene !== currentScene) continue;
    const current: EditableVariable[] = scene.variables.onChanged.current ?? [];
    for (const property of current) {
      if (!types.includes(property.type)) continue;
      result.push({property, scene});
    }
  }
  return result;
}

function drawVector2Gizmo(ctx: CanvasRenderingContext2D, point: DOMPoint) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = HANDLE_STROKE;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(point.x - HANDLE_RADIUS * 1.5, point.y);
  ctx.lineTo(point.x + HANDLE_RADIUS * 1.5, point.y);
  ctx.moveTo(point.x, point.y - HANDLE_RADIUS * 1.5);
  ctx.lineTo(point.x, point.y + HANDLE_RADIUS * 1.5);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawBBoxCornerHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  const half = BBOX_HANDLE_SIZE / 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillRect(x - half, y - half, BBOX_HANDLE_SIZE, BBOX_HANDLE_SIZE);
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - half, y - half, BBOX_HANDLE_SIZE, BBOX_HANDLE_SIZE);
}

function drawBBoxGizmo(
  ctx: CanvasRenderingContext2D,
  topLeft: DOMPoint,
  topRight: DOMPoint,
  bottomRight: DOMPoint,
  bottomLeft: DOMPoint,
) {
  ctx.beginPath();
  ctx.moveTo(topLeft.x, topLeft.y);
  ctx.lineTo(topRight.x, topRight.y);
  ctx.lineTo(bottomRight.x, bottomRight.y);
  ctx.lineTo(bottomLeft.x, bottomLeft.y);
  ctx.closePath();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = HANDLE_STROKE;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fill();

  drawBBoxCornerHandle(ctx, topLeft.x, topLeft.y);
  drawBBoxCornerHandle(ctx, topRight.x, topRight.y);
  drawBBoxCornerHandle(ctx, bottomRight.x, bottomRight.y);
  drawBBoxCornerHandle(ctx, bottomLeft.x, bottomLeft.y);
}

export function usePropertyGizmoDrawHook(): PluginDrawFunction {
  const {player, inspection} = useApplication();
  const scenes = useScenes();

  const allEntries = useMemo(
    () =>
      collectGizmoEntries(scenes, player.playback.currentScene, [
        'vector2',
        'bbox',
      ]),
    [scenes, player.playback.currentScene],
  );

  const inspected = inspection.value;
  const activeEntries = useMemo(() => {
    if (inspected.key !== PROPERTY_INSPECTOR_KEY) return [];
    const payload = inspected.payload as {
      sceneName: string;
      propertyName: string;
    };
    return allEntries.filter(
      e =>
        e.scene.name === payload.sceneName &&
        e.property.name === payload.propertyName,
    );
  }, [allEntries, inspected]);

  return useMemo(
    () => (ctx: CanvasRenderingContext2D, matrix: DOMMatrix) => {
      for (const {property, scene} of activeEntries) {
        const transform = scene.variables.getTransform(property.name);
        const finalMatrix = getPropertyTransformMatrix(
          matrix,
          scene,
          transform,
        );
        const signalRef = scene.variables.getSignalRef(property.name);
        const rawValue = signalRef ? signalRef() : property.value;

        if (property.type === 'vector2') {
          const value = rawValue as {x: number; y: number};
          if (
            !value ||
            typeof value.x !== 'number' ||
            typeof value.y !== 'number'
          ) {
            continue;
          }
          const point = finalMatrix.transformPoint(
            new DOMPoint(value.x, value.y),
          );
          drawVector2Gizmo(ctx, point);
        } else if (property.type === 'bbox') {
          const value = rawValue as {
            x: number;
            y: number;
            width: number;
            height: number;
          };
          if (!value || typeof value.x !== 'number') {
            continue;
          }
          const offsetFn = scene.variables.getOffset(property.name);
          const off = offsetFn ? offsetFn(value) : {x: 0, y: 0};
          const cx = value.x + off.x;
          const cy = value.y + off.y;
          const topLeft = finalMatrix.transformPoint(new DOMPoint(cx, cy));
          const topRight = finalMatrix.transformPoint(
            new DOMPoint(cx + value.width, cy),
          );
          const bottomRight = finalMatrix.transformPoint(
            new DOMPoint(cx + value.width, cy + value.height),
          );
          const bottomLeft = finalMatrix.transformPoint(
            new DOMPoint(cx, cy + value.height),
          );
          drawBBoxGizmo(ctx, topLeft, topRight, bottomRight, bottomLeft);
        }
      }
    },
    [activeEntries],
  );
}

function hitTestVector2(
  pointerX: number,
  pointerY: number,
  value: {x: number; y: number},
  matrix: DOMMatrix,
): boolean {
  const point = matrix.transformPoint(new DOMPoint(value.x, value.y));
  const dx = pointerX - point.x;
  const dy = pointerY - point.y;
  return dx * dx + dy * dy <= (HANDLE_RADIUS + HIT_SLOP) ** 2;
}

function isPointInQuad(
  px: number,
  py: number,
  a: DOMPoint,
  b: DOMPoint,
  c: DOMPoint,
  d: DOMPoint,
): boolean {
  const cross = (ax: number, ay: number, bx: number, by: number) =>
    ax * by - ay * bx;
  const sides = [
    cross(b.x - a.x, b.y - a.y, px - a.x, py - a.y),
    cross(c.x - b.x, c.y - b.y, px - b.x, py - b.y),
    cross(d.x - c.x, d.y - c.y, px - c.x, py - c.y),
    cross(a.x - d.x, a.y - d.y, px - d.x, py - d.y),
  ];
  return sides.every(s => s >= 0) || sides.every(s => s <= 0);
}

function hitTestBBox(
  pointerX: number,
  pointerY: number,
  value: {x: number; y: number; width: number; height: number},
  matrix: DOMMatrix,
  offset?: {x: number; y: number},
): BBoxHandle | null {
  const off = offset ?? {x: 0, y: 0};
  const cx = value.x + off.x;
  const cy = value.y + off.y;
  const corners: [BBoxHandle, DOMPoint][] = [
    ['topLeft', matrix.transformPoint(new DOMPoint(cx, cy))],
    ['topRight', matrix.transformPoint(new DOMPoint(cx + value.width, cy))],
    [
      'bottomRight',
      matrix.transformPoint(new DOMPoint(cx + value.width, cy + value.height)),
    ],
    ['bottomLeft', matrix.transformPoint(new DOMPoint(cx, cy + value.height))],
  ];

  const threshold = BBOX_HANDLE_SIZE / 2 + HIT_SLOP;
  for (const [handle, point] of corners) {
    if (
      Math.abs(pointerX - point.x) <= threshold &&
      Math.abs(pointerY - point.y) <= threshold
    ) {
      return handle;
    }
  }

  if (
    isPointInQuad(
      pointerX,
      pointerY,
      corners[0][1],
      corners[1][1],
      corners[2][1],
      corners[3][1],
    )
  ) {
    return 'body';
  }

  return null;
}

function screenToProperty(
  dx: number,
  dy: number,
  viewportMatrix: DOMMatrix,
  transform?: () => DOMMatrix,
): {x: number; y: number} {
  let inverseMatrix = viewportMatrix.inverse();
  if (transform) {
    try {
      inverseMatrix = transform().inverse().multiply(inverseMatrix);
    } catch {
      // Fall through with viewport-only inverse
    }
  }
  const origin = inverseMatrix.transformPoint(new DOMPoint(0, 0));
  const delta = inverseMatrix.transformPoint(new DOMPoint(dx, dy));
  return {x: delta.x - origin.x, y: delta.y - origin.y};
}

export function PropertyGizmosOverlay() {
  const {player, inspection} = useApplication();
  const scenes = useScenes();
  const state = useViewportContext();
  const viewportMatrix = useViewportMatrix();
  const dragState = useRef<DragState | null>(null);

  const allEntries = useMemo(
    () =>
      collectGizmoEntries(scenes, player.playback.currentScene, [
        'vector2',
        'bbox',
      ]),
    [scenes, player.playback.currentScene],
  );

  const inspected = inspection.value;
  const activeEntries = useMemo(() => {
    if (inspected.key !== PROPERTY_INSPECTOR_KEY) return [];
    const payload = inspected.payload as {
      sceneName: string;
      propertyName: string;
    };
    return allEntries.filter(
      e =>
        e.scene.name === payload.sceneName &&
        e.property.name === payload.propertyName,
    );
  }, [allEntries, inspected]);

  return (
    <OverlayWrapper
      onPointerDown={event => {
        if (event.button !== 0 || event.shiftKey) return;

        const pointerX = event.x - state.rect.x;
        const pointerY = event.y - state.rect.y;

        for (const {property, scene} of activeEntries) {
          const transform = scene.variables.getTransform(property.name);
          const finalMatrix = getPropertyTransformMatrix(
            viewportMatrix,
            scene,
            transform,
          );

          if (property.type === 'vector2') {
            const value = property.value as {x: number; y: number};
            if (!value || typeof value.x !== 'number') continue;
            if (hitTestVector2(pointerX, pointerY, value, finalMatrix)) {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              dragState.current = {
                propertyName: property.name,
                scene,
                type: 'vector2',
                handle: 'center',
                startValue: {...value},
                startPointer: {x: event.x, y: event.y},
                startOffset: {x: 0, y: 0},
              };
              return;
            }
          } else if (property.type === 'bbox') {
            const value = property.value as {
              x: number;
              y: number;
              width: number;
              height: number;
            };
            if (!value || typeof value.x !== 'number') continue;
            const offsetFn = scene.variables.getOffset(property.name);
            const off = offsetFn ? offsetFn(value) : undefined;
            const handle = hitTestBBox(
              pointerX,
              pointerY,
              value,
              finalMatrix,
              off,
            );
            if (handle) {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              dragState.current = {
                propertyName: property.name,
                scene,
                type: 'bbox',
                handle,
                startValue: {...value},
                startPointer: {x: event.x, y: event.y},
                startOffset: off ?? {x: 0, y: 0},
              };
              return;
            }
          }
        }
      }}
      onPointerMove={event => {
        if (
          !dragState.current ||
          !event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          return;
        }
        event.stopPropagation();

        const drag = dragState.current;
        const totalDx = event.x - drag.startPointer.x;
        const totalDy = event.y - drag.startPointer.y;
        const transform = drag.scene.variables.getTransform(drag.propertyName);
        const delta = screenToProperty(
          totalDx,
          totalDy,
          viewportMatrix,
          transform,
        );

        const signal = drag.scene.variables.getSignalRef(drag.propertyName);
        if (!signal) return;

        if (drag.type === 'vector2') {
          signal({
            x: drag.startValue.x + delta.x,
            y: drag.startValue.y + delta.y,
          });
        } else if (drag.type === 'bbox') {
          const sv = drag.startValue;
          const so = drag.startOffset;
          const sdx = sv.x + so.x;
          const sdy = sv.y + so.y;

          let rx = sdx;
          let ry = sdy;
          let rw = sv.width;
          let rh = sv.height;
          switch (drag.handle) {
            case 'body':
              rx = sdx + delta.x;
              ry = sdy + delta.y;
              break;
            case 'topLeft':
              rx = sdx + delta.x;
              ry = sdy + delta.y;
              rw = sv.width - delta.x;
              rh = sv.height - delta.y;
              break;
            case 'topRight':
              ry = sdy + delta.y;
              rw = sv.width + delta.x;
              rh = sv.height - delta.y;
              break;
            case 'bottomLeft':
              rx = sdx + delta.x;
              rw = sv.width - delta.x;
              rh = sv.height + delta.y;
              break;
            case 'bottomRight':
              rw = sv.width + delta.x;
              rh = sv.height + delta.y;
              break;
          }

          const offsetFn = drag.scene.variables.getOffset(drag.propertyName);
          const newOff = offsetFn
            ? offsetFn({x: rx, y: ry, width: rw, height: rh})
            : {x: 0, y: 0};
          signal({
            x: rx - newOff.x,
            y: ry - newOff.y,
            width: rw,
            height: rh,
          });
        }

        player.requestRender();
      }}
      onPointerUp={event => {
        if (
          !dragState.current ||
          !event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          return;
        }

        event.currentTarget.releasePointerCapture(event.pointerId);
        const drag = dragState.current;
        dragState.current = null;

        const signal = drag.scene.variables.getSignalRef(drag.propertyName);
        if (!signal) return;

        const currentValue = signal();
        drag.scene.variables.set(drag.propertyName, currentValue);
      }}
    />
  );
}
