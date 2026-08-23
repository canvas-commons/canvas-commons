import {NODE_INSPECTOR_KEY} from '@canvas-commons/core';
import {useState} from 'preact/hooks';
import {useApplication} from '../../contexts';
import {useScenes} from '../../hooks';
import {AudioClip} from './AudioTrack';
import {colorForKey, useMediaSounds} from './mediaSounds';
import styles from './Timeline.module.scss';
import {useTrackLayout, useWaveHeight} from './trackLayout';

/**
 * Timeline lane for audio embedded in media (`Video`) nodes.
 *
 * @remarks
 * Unlike project audio tracks, this lane is auto-populated from scene
 * content rather than user-organized, so all clips share a single lane.
 * Overlapping clips (e.g. two videos playing at once) are distinguished by a
 * per-source color and a hover-to-isolate interaction instead of being split
 * into separate generated lanes, which would make the timeline's layout
 * unstable.
 *
 * Renders nothing (not even an empty reserved lane) when the project has no
 * media audio, which is the common case - most projects only use the
 * project audio track below.
 */
export function MediaAudioTrack() {
  const scenes = useScenes();
  const {inspection} = useApplication();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const mediaSounds = useMediaSounds(scenes);
  const layoutRef = useTrackLayout<HTMLDivElement>('media');
  const {height} = useWaveHeight('media');

  const selectedKey =
    inspection.value.key === NODE_INSPECTOR_KEY
      ? ((inspection.value.payload as string | null) ?? null)
      : null;
  const activeKey = hoveredKey ?? selectedKey;

  if (mediaSounds.length === 0) {
    return null;
  }

  return (
    <div
      ref={layoutRef}
      className={styles.audioTrack}
      style={{height: `${height}px`}}
    >
      {mediaSounds.map(sound => (
        <AudioClip
          hoverable
          height={height}
          {...sound}
          color={colorForKey(sound.sourceKey)}
          faded={activeKey !== null && activeKey !== sound.sourceKey}
          onPointerEnter={() => setHoveredKey(sound.sourceKey)}
          onPointerLeave={() => setHoveredKey(null)}
          onClick={() => {
            inspection.value = {
              key: NODE_INSPECTOR_KEY,
              payload: sound.sourceKey,
            };
          }}
        />
      ))}
    </div>
  );
}
