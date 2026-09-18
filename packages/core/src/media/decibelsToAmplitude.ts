export function decibelsToAmplitude(decibels: number): number {
  return Math.pow(10, decibels / 20);
}
