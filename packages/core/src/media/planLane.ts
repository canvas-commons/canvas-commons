import type {Sound} from '../scenes';

export interface LanePlan {
  // timeline time at which the lane begins
  begin: number;
  // timeline time at which the lane ends
  end: number;
  // buffer seconds already consumed when the lane begins
  bufferOffset: number;
  // buffer seconds at which the lane must stop
  endOffset: number;
  // buffer seconds consumed per render clock second
  rate: number;
}

// a lane that begins after its window opened can only start from where the clock currently is
export function planLane(
  sound: Sound,
  clockTime: number,
  speed: number,
  duration: number,
): LanePlan {
  const start = sound.start ?? 0;
  const endOffset = Math.min(duration, sound.end ?? Infinity);
  const rate = sound.realPlaybackRate * speed;
  const begin = Math.max(clockTime, sound.offset);
  const end = sound.offset + (endOffset - start) / sound.realPlaybackRate;
  return {
    begin,
    end,
    bufferOffset: start + (begin - sound.offset) * sound.realPlaybackRate,
    endOffset,
    rate,
  };
}
