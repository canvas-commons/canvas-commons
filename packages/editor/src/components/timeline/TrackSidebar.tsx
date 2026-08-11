import {
  MEDIA_AUDIO_TRACK_ID,
  PROJECT_AUDIO_TRACK_ID,
  type AudioTrackId,
} from '@canvas-commons/core';
import clsx from 'clsx';
import {useRef} from 'preact/hooks';
import {useApplication} from '../../contexts';
import {usePlayerState, useStorage} from '../../hooks';
import {MouseButton} from '../../utils';
import {VolumeOff, VolumeOn} from '../icons';
import {ChevronLeft} from '../icons/ChevronLeft';
import {ChevronRight} from '../icons/ChevronRight';
import styles from './Timeline.module.scss';
import {
  DEFAULT_WAVE_HEIGHT,
  TRACK_ORDER,
  TimelineTrackId,
  useTrackHeights,
  useTrackScrollTop,
  useWaveHeight,
} from './trackLayout';

const TRACK_LABELS: Record<TimelineTrackId, string> = {
  range: '',
  scene: 'Scenes',
  label: 'Labels',
  media: 'Media audio',
  audio: 'Audio',
};

const AUDIO_TRACK_IDS: Partial<Record<TimelineTrackId, AudioTrackId>> = {
  media: MEDIA_AUDIO_TRACK_ID,
  audio: PROJECT_AUDIO_TRACK_ID,
};

interface TrackHeaderProps {
  id: TimelineTrackId;
  name: string;
  color?: string;
  height: number;
  trackId?: AudioTrackId;
  resizable?: boolean;
}

/**
 * Drag the bottom edge of an audio row to grow or shrink its waveform.
 *
 * @remarks
 * Lives in the sidebar rather than on the lane so it can't be confused with
 * the timeline's own click-to-scrub, which owns the whole lane area.
 */
function TrackResizeHandle({id}: {id: TimelineTrackId}) {
  const {height, setHeight} = useWaveHeight(id);
  const dragRef = useRef<{y: number; height: number} | null>(null);

  return (
    <div
      className={styles.trackResize}
      data-track-resize={id}
      title={`Resize ${TRACK_LABELS[id]} (double-click to reset)`}
      onPointerDown={event => {
        if (event.button !== MouseButton.Left) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {y: event.clientY, height};
      }}
      onPointerMove={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const drag = dragRef.current;
        if (!drag) return;
        event.stopPropagation();
        setHeight(drag.height + (event.clientY - drag.y));
      }}
      onPointerUp={event => {
        if (event.button !== MouseButton.Left) return;
        event.stopPropagation();
        event.currentTarget.releasePointerCapture(event.pointerId);
        dragRef.current = null;
      }}
      onDblClick={() => setHeight(DEFAULT_WAVE_HEIGHT)}
    />
  );
}

/**
 * Left-hand header for a single timeline lane.
 *
 * @remarks
 * Audio lanes (those with a `trackId`) additionally get mute and solo
 * buttons. Like the player-wide mute, these only affect preview playback,
 * never exported output.
 */
function TrackHeader({
  id,
  name,
  color,
  height,
  trackId,
  resizable,
}: TrackHeaderProps) {
  const {player} = useApplication();
  const state = usePlayerState();
  const mix = trackId ? state.trackMix[trackId] : undefined;
  const muted = (mix?.volume ?? 1) === 0;
  const solo = mix?.solo ?? false;

  return (
    <div
      className={styles.trackHeader}
      data-track-header={id}
      style={{height: `${height}px`}}
    >
      <div
        className={styles.trackAccent}
        style={{backgroundColor: color ?? 'var(--surface-color-light)'}}
      />
      <div className={styles.trackHeaderBody}>
        <div className={styles.trackHeaderTop}>
          <div className={styles.trackName} title={name}>
            {name}
          </div>
          {trackId && (
            <div className={styles.trackButtons}>
              <button
                type="button"
                title={muted ? `Unmute ${name}` : `Mute ${name}`}
                className={clsx(
                  styles.trackButton,
                  styles.trackIconButton,
                  muted && styles.trackButtonActive,
                )}
                onClick={() => player.toggleTrackMuted(trackId)}
              >
                {muted ? <VolumeOff /> : <VolumeOn />}
              </button>
              <button
                type="button"
                title={solo ? `Unsolo ${name}` : `Solo ${name}`}
                className={clsx(
                  styles.trackButton,
                  solo && styles.trackButtonActive,
                )}
                onClick={() => player.toggleTrackSolo(trackId)}
              >
                S
              </button>
            </div>
          )}
        </div>
        {resizable && <TrackResizeHandle id={id} />}
      </div>
    </div>
  );
}

/**
 * Left-side column of the timeline listing every lane.
 *
 * @remarks
 * Rows mirror the measured heights of their lanes, so the column stays
 * aligned when a lane grows (nested slides) or disappears (no media audio).
 */
export function TrackSidebar({
  onWheel,
}: {
  onWheel?: (event: WheelEvent) => void;
}) {
  const heights = useTrackHeights();
  const scrollTop = useTrackScrollTop();
  const [collapsed, setCollapsed] = useStorage(
    'timeline-sidebar-collapsed',
    false,
  );

  return (
    <div
      className={clsx(styles.sidebar, collapsed && styles.collapsed)}
      data-track-sidebar
      onWheel={onWheel}
    >
      <button
        type="button"
        className={styles.sidebarToggle}
        data-sidebar-toggle
        title={collapsed ? 'Show track sidebar' : 'Hide track sidebar'}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight /> : <ChevronLeft />}
      </button>
      {!collapsed && (
        <div
          className={styles.sidebarRows}
          style={{transform: `translateY(${-scrollTop.value}px)`}}
        >
          {TRACK_ORDER.map(id => {
            const height = heights[id];
            if (height === undefined) return null;
            if (id === 'range') {
              return (
                <div
                  key={id}
                  data-track-header={id}
                  style={{height: `${height}px`}}
                />
              );
            }

            return (
              <TrackHeader
                key={id}
                id={id}
                name={TRACK_LABELS[id]}
                height={height}
                trackId={AUDIO_TRACK_IDS[id]}
                resizable={AUDIO_TRACK_IDS[id] !== undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
