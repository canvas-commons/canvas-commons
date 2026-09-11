import type {Scene} from '@canvas-commons/core';
import clsx from 'clsx';
import type {JSX} from 'preact';
import {useLayoutEffect, useMemo, useRef, useState} from 'preact/hooks';
import {useApplication, useModifiers, useTimelineContext} from '../../contexts';
import {useScenes, useSharedSettings, useSubscribableValue} from '../../hooks';
import {MouseButton} from '../../utils';
import styles from './Timeline.module.scss';
import {DEFAULT_WAVE_HEIGHT, useTrackLayout} from './trackLayout';

export function AudioTrack() {
  const scenes = useScenes();
  const layoutRef = useTrackLayout<HTMLDivElement>('audio');
  const height = DEFAULT_WAVE_HEIGHT;
  return (
    <div
      ref={layoutRef}
      className={styles.projectAudioTrack}
      style={{height: `${height}px`}}
    >
      <MainAudioClip height={height} />
      {scenes.map(scene => (
        <AudioGroup scene={scene} height={height} />
      ))}
    </div>
  );
}

interface AudioGroupProps {
  scene: Scene;
  height: number;
}

export function AudioGroup({scene, height}: AudioGroupProps) {
  const sounds = useSubscribableValue(scene.sounds.onChanged);
  return (
    <>
      {sounds.map(sound => (
        <AudioClip hoverable height={height} {...sound} />
      ))}
    </>
  );
}

function MainAudioClip({height}: {height: number}) {
  const {player, meta} = useApplication();
  const source = player.audio.getSource();
  const {audioOffset} = useSharedSettings();
  const modifiers = useModifiers();
  const [editingOffset, setEditingOffset] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const {pixelsToSeconds} = useTimelineContext();
  const fullOffset = audioOffset + editingOffset;

  useLayoutEffect(() => {
    setEditingOffset(0);
  }, [audioOffset]);

  const active = modifiers.value.shift;

  return (
    source && (
      <AudioClip
        editable={active || isEditing}
        audio={source}
        offset={fullOffset}
        height={height}
        disabled
        onPointerDown={e => {
          if (active && e.button === MouseButton.Left) {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            setIsEditing(true);
          }
        }}
        onPointerMove={e => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            setEditingOffset(editingOffset + pixelsToSeconds(e.movementX));
          }
        }}
        onPointerUp={e => {
          if (e.button === MouseButton.Left) {
            e.currentTarget.releasePointerCapture(e.pointerId);
            meta.shared.audioOffset.set(fullOffset);
            setEditingOffset(0);
            setIsEditing(false);
          }
        }}
      />
    )
  );
}
export interface AudioClipProps extends JSX.HTMLAttributes<HTMLDivElement> {
  audio: string;
  offset: number;
  start?: number;
  end?: number;
  realPlaybackRate?: number;
  hoverable?: boolean;
  editable?: boolean;
  disabled?: boolean;
  /** Overrides the waveform color (defaults to white). */
  color?: string;
  /** Dims the clip, used to de-emphasize non-hovered overlapping clips. */
  faded?: boolean;
  /** Height of the waveform area, set by the lane's resize handle. */
  height?: number;
  /**
   * Stable clip id, enabling drag-to-another-track. When set the clip becomes
   * draggable and carries this key so the drop target can reassign it.
   */
  draggableKey?: string;
  // Extra `Sound` fields callers spread in via `{...sound}`; consumed here so
  // they don't leak onto the DOM element.
  gain?: number;
  detune?: number;
  playbackRate?: number;
  sourceKey?: string;
  origin?: 'media' | 'audio';
}

export function AudioClip({
  audio,
  offset,
  start = 0,
  end = Infinity,
  realPlaybackRate = 1,
  hoverable,
  editable,
  color = '#fff',
  faded,
  height = DEFAULT_WAVE_HEIGHT,
  draggableKey,
  // Discard non-DOM `Sound` fields spread in via `{...sound}`.
  gain: _gain,
  detune: _detune,
  playbackRate: _playbackRate,
  sourceKey: _sourceKey,
  origin: _origin,
  style,
  className,
  onPointerDown,
  ...props
}: AudioClipProps) {
  // The waveform is drawn symmetrically around a center line, so the canvas
  // works in half-height units.
  const halfHeight = height / 2;
  const {player} = useApplication();
  const audioData = useSubscribableValue(
    player.audioResources.get(audio).onData,
  );

  const ref = useRef<HTMLCanvasElement>();
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const {
    viewLength,
    firstVisibleTime,
    lastVisibleTime,
    density,
    secondsToPercents,
    secondsToPixels,
  } = useTimelineContext();

  const {
    waveformWidth,
    waveformStart,
    waveformEnd,
    clipStart,
    clipDuration,
    waveformVisible,
  } = useMemo(() => {
    // A non-finite `end` (e.g. a clip still playing, or one whose stop time
    // could not be resolved) means "until the source ends", so fall back to
    // the decoded duration instead of letting NaN collapse the waveform.
    const clipEndTime = isFinite(end) ? end : audioData.duration;
    const endOffset =
      (Math.min(audioData.duration, clipEndTime) - start) / realPlaybackRate;

    const clipStart = offset;
    const clipEnd = offset + endOffset;

    const waveformStart = Math.max(firstVisibleTime, clipStart);
    const waveformEnd = Math.min(lastVisibleTime, clipEnd);

    const duration = waveformEnd - waveformStart;
    const waveformVisible =
      waveformStart < waveformEnd &&
      waveformEnd > firstVisibleTime &&
      waveformStart < lastVisibleTime;

    return {
      waveformWidth: secondsToPixels(duration),
      waveformStart,
      waveformEnd,
      clipStart,
      clipDuration: clipEnd - clipStart,
      waveformVisible,
    };
  }, [
    audioData,
    end,
    start,
    firstVisibleTime,
    lastVisibleTime,
    secondsToPixels,
    realPlaybackRate,
    offset,
  ]);

  useLayoutEffect(() => {
    if (!waveformVisible || !ref.current) return;
    if (!contextRef.current || contextRef.current?.canvas !== ref.current) {
      contextRef.current = ref.current?.getContext('2d');
    }

    const context = contextRef.current;
    if (!context) return;
    context.clearRect(0, 0, viewLength, height);
    context.beginPath();
    context.moveTo(0, halfHeight);

    const relativeStartTime =
      (waveformStart - offset) * realPlaybackRate + start;
    const relativeEndTime = (waveformEnd - offset) * realPlaybackRate + start;

    const startSample = relativeStartTime * audioData.sampleRate;
    const endSample = relativeEndTime * audioData.sampleRate;

    const step = Math.ceil(density * 4);
    const flooredStart = Math.floor(startSample / step / 2) * step * 2;
    const padding = flooredStart - startSample;
    const length = endSample - startSample;

    for (let index = startSample; index <= endSample; index += step * 2) {
      const offset = index - startSample;
      const sample = Math.floor(flooredStart + offset);
      if (sample >= audioData.peaks.length) break;

      context.lineTo(
        ((padding + offset) / length) * waveformWidth,
        (audioData.peaks[sample] / audioData.absoluteMax) * halfHeight +
          halfHeight,
      );
      context.lineTo(
        ((padding + offset + step) / length) * waveformWidth,
        (audioData.peaks[sample + 1] / audioData.absoluteMax) * halfHeight +
          halfHeight,
      );
    }

    context.lineWidth = 1;
    context.lineJoin = 'round';
    context.strokeStyle = color;
    context.stroke();
  }, [
    waveformStart,
    waveformEnd,
    waveformWidth,
    waveformVisible,
    offset,
    density,
    viewLength,
    start,
    audioData,
    realPlaybackRate,
    color,
    halfHeight,
  ]);

  const [wrapperStyle, canvasStyle] = useMemo(
    () => [
      {
        left: `${secondsToPercents(clipStart)}%`,
        width: `${secondsToPercents(clipDuration)}%`,
        height: `${height}px`,
        opacity: faded ? 0.35 : 1,
        transition: 'opacity 0.15s ease',
        ...(typeof style === 'object' ? style : {}),
      },
      {
        left: `${((waveformStart - clipStart) / clipDuration) * 100}%`,
      },
    ],
    [
      waveformStart,
      clipDuration,
      clipStart,
      secondsToPercents,
      faded,
      style,
      height,
    ],
  );

  return (
    <div
      className={clsx(
        styles.audioClip,
        hoverable && styles.hoverable,
        editable && styles.editable,
        draggableKey && styles.draggable,
        className,
      )}
      style={wrapperStyle}
      draggable={draggableKey !== undefined}
      onPointerDown={event => {
        // Keep the press from reaching the timeline surface, which would
        // otherwise capture the pointer and scrub the playhead - stealing the
        // gesture before the native drag-and-drop can start. Mirrors how the
        // timeline Label swallows its own pointerdown. `preventDefault` is
        // intentionally omitted for draggable clips: it would suppress the
        // element's `dragstart`. Editable (offset-dragging) clips still get
        // their own handler via `onPointerDown` below.
        if (draggableKey !== undefined) {
          event.stopPropagation();
        }
        onPointerDown?.(event);
      }}
      onDragStart={
        draggableKey
          ? event => {
              event.dataTransfer?.setData(
                'application/x-audio-clip',
                draggableKey,
              );
              event.dataTransfer!.effectAllowed = 'move';
            }
          : undefined
      }
      {...props}
    >
      {waveformVisible && waveformWidth > 8 && (
        <canvas
          ref={ref}
          style={canvasStyle}
          className={styles.audioCanvas}
          width={Math.round(waveformWidth)}
          height={height}
        />
      )}
    </div>
  );
}
