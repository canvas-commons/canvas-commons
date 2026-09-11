/**
 * Convert a decibel value to a linear amplitude gain factor.
 */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}
/**
 * Convert a linear amplitude gain factor to decibels.
 *
 * @remarks
 * The inverse of {@link dbToGain}. `gain <= 0` maps to `-Infinity` (silence).
 */
export function gainToDb(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}
