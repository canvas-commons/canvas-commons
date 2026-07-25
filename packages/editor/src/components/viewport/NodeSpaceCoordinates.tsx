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
import {MapMarkerRadius} from '../icons';
import styles from './Viewport.module.scss';

export function NodeSpaceCoordinates() {
  const [nodePos, setNodePos] = useState<{x: number; y: number} | null>(null);
  const {inspection} = useApplication();
  const viewport = useViewportContext();
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

      const viewportPoint = new Vector2(
        event.x - viewport.rect.x,
        event.y - viewport.rect.y,
      ).transformAsPoint(matrix.inverse());

      const scenePoint = scene.transformMousePosition(
        viewportPoint.x,
        viewportPoint.y,
      );
      if (!scenePoint) {
        setNodePos(null);
        return;
      }

      const local = scenePoint.transformAsPoint(localToScene.inverse());
      setNodePos({
        x: Math.round(local.x),
        y: Math.round(local.y),
      });
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [viewport, matrix, scene, inspection.value.payload]);

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
      <MapMarkerRadius /> ({nodePos.x}, {nodePos.y})
    </ReadOnlyInput>
  );
}
