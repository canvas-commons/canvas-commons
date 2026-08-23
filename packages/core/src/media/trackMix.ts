import {clamp} from '../tweening';

/**
 * Identifier of the timeline track a sound belongs to.
 *
 * @remarks
 * Until multiple project audio tracks land, sounds are split into just two
 * tracks: the auto-populated media lane and the project audio track.
 */
export type AudioTrackId = string;

export const MEDIA_AUDIO_TRACK_ID: AudioTrackId = 'media';
export const PROJECT_AUDIO_TRACK_ID: AudioTrackId = 'project';

/**
 * Per-track preview mix.
 *
 * @remarks
 * There is deliberately no separate `muted` flag - a muted track is just one
 * at `volume: 0`, which keeps a single source of truth for "how loud is this
 * track" instead of two that can disagree.
 */
export interface AudioTrackMix {
  volume: number;
  solo: boolean;
}

export type AudioTrackMixMap = Record<AudioTrackId, AudioTrackMix>;

export interface ResolvedAudioMix {
  muted: boolean;
  volume: number;
}

export const DEFAULT_AUDIO_TRACK_MIX: AudioTrackMix = {
  volume: 1,
  solo: false,
};

/**
 * Sanitize a possibly-stale mix loaded from persisted player state.
 */
export function normalizeTrackMix(mix: unknown): AudioTrackMixMap {
  if (typeof mix !== 'object' || mix === null) {
    return {};
  }

  const normalized: AudioTrackMixMap = {};
  for (const [trackId, track] of Object.entries(
    mix as Record<string, unknown>,
  )) {
    if (typeof track !== 'object' || track === null) continue;
    const {volume, muted, solo} = track as Partial<AudioTrackMix> & {
      muted?: unknown;
    };
    const parsed =
      typeof volume === 'number' && !isNaN(volume) ? clamp(0, 1, volume) : 1;

    normalized[trackId] = {
      // Mixes persisted before `muted` was folded into `volume`.
      volume: muted === true ? 0 : parsed,
      solo: solo === true,
    };
  }

  return normalized;
}

export function audioTrackIdForSound(sound: {
  sourceKey?: string;
}): AudioTrackId {
  return sound.sourceKey ? MEDIA_AUDIO_TRACK_ID : PROJECT_AUDIO_TRACK_ID;
}

export function hasSoloedAudioTrack(mix: AudioTrackMixMap): boolean {
  return Object.values(mix).some(track => track.solo);
}

/**
 * Combine a track's own mix settings with the player-wide mute/volume.
 *
 * @remarks
 * Preview-only, same as the player-wide controls - exported output is
 * unaffected. Soloing any track silences every track that isn't soloed.
 */
export function resolveAudioMix(
  trackId: AudioTrackId,
  mix: AudioTrackMixMap,
  masterMuted: boolean,
  masterVolume: number,
): ResolvedAudioMix {
  const track = mix[trackId] ?? DEFAULT_AUDIO_TRACK_MIX;
  const silencedBySolo = hasSoloedAudioTrack(mix) && !track.solo;

  return {
    muted: masterMuted || silencedBySolo,
    volume: clamp(0, 1, masterVolume) * clamp(0, 1, track.volume),
  };
}
