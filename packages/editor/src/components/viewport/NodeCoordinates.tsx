import {isInspectable, Vector2} from '@canvas-commons/core';
import {useEffect, useState} from 'preact/hooks';
import {
  useApplication,
  useShortcut,
  useViewportContext,
  VIEWPORT_SHORTCUTS,
} from '../../contexts';
import {useCurrentScene, useViewportMatrix} from '../../hooks';
import {ReadOnlyInput} from '../controls';
import styles from './Viewport.module.scss';

/**
 * Shows the mouse position expressed in the selected node's local coordinate
 * system, so a location stays pinned to the node as it moves, scales, or
 * rotates. Only rendered while a node is selected and the scene can report the
 * node's local-to-scene matrix.
 */
export function NodeCoordinates() {
  const [nodePos, setNodePos] = useState<{x: number; y: number} | null>(null);
  const {inspection} = useApplication();
  const state = useViewportContext();
  const scene = useCurrentScene();
  const matrix = useViewportMatrix();

  useEffect(() => {
    const handleMouseMove = (event: {x: number; y: number}) => {
      if (!isInspectable(scene) || !scene.inspectElementMatrix) {
        setNodePos(null);
        return;
      }

      const element = scene.validateInspection(inspection.value.payload);
      if (element === null) {
        setNodePos(null);
        return;
      }

      const localToScene = scene.inspectElementMatrix(element);
      if (!localToScene) {
        setNodePos(null);
        return;
      }

      let point = new Vector2(
        event.x - state.rect.x,
        event.y - state.rect.y,
      ).transformAsPoint(matrix.inverse());
      point = scene.transformMousePosition(point.x, point.y);
      if (!point) {
        setNodePos(null);
        return;
      }

      const local = point.transformAsPoint(localToScene.inverse());
      setNodePos({
        x: Math.round(local.x),
        y: Math.round(local.y),
      });
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [state, matrix, scene, inspection.value.payload]);

  useShortcut(VIEWPORT_SHORTCUTS, 'copyNodeCoordinates', async () => {
    if (!nodePos) return;
    const positionString = `${nodePos.x}, ${nodePos.y}`;
    await window.navigator.clipboard.writeText(positionString);
  });

  if (!nodePos) {
    return null;
  }

  return (
    <ReadOnlyInput className={styles.coordinates} title={'Node coordinates'}>
      ({nodePos.x}, {nodePos.y})
    </ReadOnlyInput>
  );
}
