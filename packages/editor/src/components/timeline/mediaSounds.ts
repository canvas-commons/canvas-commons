import type {Scene, Sound} from '@canvas-commons/core';
import {useEffect, useState} from 'preact/hooks';

export type MediaSound = Sound & {sourceKey: string};

/**
 * Deterministic color for a media clip, hashed from its source node's key so
 * the same `Video` always gets the same waveform color.
 */
export function colorForKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 65%)`;
}

/**
 * Subscribes to every scene's sound list and returns just the media-derived
 * ones (i.e. those with a `sourceKey`), combined across all scenes.
 */
export function useMediaSounds(scenes: readonly Scene[]): MediaSound[] {
  const [sounds, setSounds] = useState<MediaSound[]>([]);

  useEffect(() => {
    const recompute = () => {
      const combined: MediaSound[] = [];
      for (const scene of scenes) {
        for (const sound of scene.sounds.onChanged.current) {
          const origin = sound.origin ?? (sound.sourceKey ? 'media' : 'audio');
          if (sound.sourceKey && origin === 'media') {
            combined.push(sound as MediaSound);
          }
        }
      }
      setSounds(combined);
    };

    recompute();
    const unsubscribes = scenes.map(scene =>
      scene.sounds.onChanged.subscribe(recompute),
    );
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [scenes]);

  return sounds;
}
