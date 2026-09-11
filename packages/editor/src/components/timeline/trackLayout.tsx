import {Signal, useSignal} from '@preact/signals';
import {ComponentChildren, createContext} from 'preact';
import {useCallback, useContext, useLayoutEffect, useState} from 'preact/hooks';
import {useStorage} from '../../hooks';
import {clamp} from '../../utils';

export type FixedTrackId = 'range' | 'scene' | 'label' | 'audio' | 'media';

export type TimelineTrackId = FixedTrackId;

export type TrackHeights = Partial<Record<string, number>>;

export const TRACK_ORDER_HEAD: FixedTrackId[] = ['range', 'scene', 'label'];
export const TRACK_ORDER_TAIL: FixedTrackId[] = ['audio', 'media'];

/** Waveform fills the whole lane, so this is the lane height too. */
export const DEFAULT_WAVE_HEIGHT = 32;
export const MIN_WAVE_HEIGHT = 16;
export const MAX_WAVE_HEIGHT = 256;

export type WaveHeights = Partial<Record<string, number>>;

interface TrackLayout {
  heights: Signal<TrackHeights>;
  /**
   * Vertical scroll of the lane area, mirrored by the sidebar so its rows
   * stay next to the lanes they label.
   */
  scrollTop: Signal<number>;
  waveHeights: WaveHeights;
  setWaveHeight: (id: TimelineTrackId, height: number) => void;
}

const TrackLayoutContext = createContext<TrackLayout>(null);

export function TrackLayoutProvider({children}: {children: ComponentChildren}) {
  const heights = useSignal<TrackHeights>({});
  const scrollTop = useSignal(0);
  const [waveHeights, setWaveHeights] = useStorage<WaveHeights>(
    'timeline-wave-heights',
    {},
  );

  const setWaveHeight = useCallback(
    (id: TimelineTrackId, height: number) => {
      setWaveHeights({
        ...waveHeights,
        [id]: clamp(MIN_WAVE_HEIGHT, MAX_WAVE_HEIGHT, Math.round(height)),
      });
    },
    [waveHeights, setWaveHeights],
  );

  return (
    <TrackLayoutContext.Provider
      value={{heights, scrollTop, waveHeights, setWaveHeight}}
    >
      {children}
    </TrackLayoutContext.Provider>
  );
}

export function useTrackHeights(): TrackHeights {
  return useContext(TrackLayoutContext).heights.value;
}

export function useTrackScrollTop(): Signal<number> {
  return useContext(TrackLayoutContext).scrollTop;
}

/**
 * Waveform height of an audio lane, and a setter used by the sidebar's
 * resize handle.
 */
export function useWaveHeight(id: TimelineTrackId) {
  const {waveHeights, setWaveHeight} = useContext(TrackLayoutContext);

  return {
    height: waveHeights[id] ?? DEFAULT_WAVE_HEIGHT,
    setHeight: useCallback(
      (height: number) => setWaveHeight(id, height),
      [id, setWaveHeight],
    ),
  };
}

/**
 * Report a lane's rendered height so the sidebar can mirror it.
 *
 * @remarks
 * Lane heights are content-driven (the scene track grows with nested slides,
 * the media lane disappears entirely without media audio), so the sidebar
 * measures them instead of duplicating the layout rules. Returns a callback
 * ref, so lanes that render conditionally drop their row as they unmount.
 */
export function useTrackLayout<T extends HTMLElement>(id: TimelineTrackId) {
  const layout = useContext(TrackLayoutContext);
  const heights = layout?.heights;
  const [element, setElement] = useState<T | null>(null);

  useLayoutEffect(() => {
    if (!heights) return;

    const forget = () => {
      if (heights.value[id] === undefined) return;
      const {[id]: _, ...rest} = heights.value;
      heights.value = rest;
    };

    if (!element) {
      forget();
      return;
    }

    element.dataset.track = id;
    const measure = () => {
      const height = element.getBoundingClientRect().height;
      if (heights.value[id] !== height) {
        heights.value = {...heights.value, [id]: height};
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      forget();
    };
  }, [id, element, heights]);

  return useCallback((node: T | null) => setElement(node), []);
}
