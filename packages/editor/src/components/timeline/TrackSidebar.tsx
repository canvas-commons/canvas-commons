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
  TRACK_ORDER_HEAD,
  TRACK_ORDER_TAIL,
  TimelineTrackId,
  useTrackHeights,
  useTrackScrollTop,
  useWaveHeight,
} from './trackLayout';

const FIXED_TRACK_LABELS: Record<string, string> = {
  range: '',
  scene: 'Scenes',
  label: 'Labels',
  audio: 'Audio',
  media: 'Media audio',
};

function labelFor(id: TimelineTrackId): string {
  return FIXED_TRACK_LABELS[id] ?? '';
}

function TrackResizeHandle({id, label}: {id: TimelineTrackId; label: string}) {
  const {height, setHeight} = useWaveHeight(id);
  const dragRef = useRef<{y: number; height: number} | null>(null);

  return (
    <div
      className={styles.trackResize}
      data-track-resize={id}
      title={`Resize ${label} (double-click to reset)`}
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

function MixButtons({name}: {name: string}) {
  const {player} = useApplication();
  const state = usePlayerState();
  const muted = state.projectAudioMuted;
  const solo = state.projectAudioSolo;

  return (
    <div className={styles.trackButtons}>
      <button
        type="button"
        title={muted ? `Unmute ${name}` : `Mute ${name}`}
        className={clsx(
          styles.trackButton,
          styles.trackIconButton,
          muted && styles.trackButtonActive,
        )}
        onClick={() => player.toggleProjectAudioMuted()}
      >
        {muted ? <VolumeOff /> : <VolumeOn />}
      </button>
      <button
        type="button"
        title={solo ? `Unsolo ${name}` : `Solo ${name}`}
        className={clsx(styles.trackButton, solo && styles.trackButtonActive)}
        onClick={() => player.toggleProjectAudioSolo()}
      >
        S
      </button>
    </div>
  );
}

interface FixedTrackHeaderProps {
  id: TimelineTrackId;
  name: string;
  height: number;
  resizable?: boolean;
  mixable?: boolean;
}

function FixedTrackHeader({
  id,
  name,
  height,
  resizable,
  mixable,
}: FixedTrackHeaderProps) {
  return (
    <div
      className={styles.trackHeader}
      data-track-header={id}
      style={{height: `${height}px`}}
    >
      <div className={styles.trackAccent} />
      <div className={styles.trackHeaderBody}>
        <div className={styles.trackHeaderTop}>
          <div className={styles.trackName} title={name}>
            {name}
          </div>
          {mixable && <MixButtons name={name} />}
        </div>
        {resizable && <TrackResizeHandle id={id} label={name} />}
      </div>
    </div>
  );
}

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
          {TRACK_ORDER_HEAD.map(id => {
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
              <FixedTrackHeader
                key={id}
                id={id}
                name={labelFor(id)}
                height={height}
              />
            );
          })}

          {TRACK_ORDER_TAIL.map(id => {
            const height = heights[id];
            if (height === undefined) return null;
            return (
              <FixedTrackHeader
                key={id}
                id={id}
                name={labelFor(id)}
                height={height}
                resizable={id === 'media'}
                mixable={id === 'audio'}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
