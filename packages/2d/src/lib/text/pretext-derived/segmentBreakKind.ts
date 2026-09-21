// Copied from @chenglou/pretext 0.0.9, src/analysis.ts (`SegmentBreakKind`,
// lines 4-12), commit 8460bf940c50d82be90a396fb0ea2c4e7a2dc6f3, under the MIT
// license in ./LICENSE. Pretext does not export the union, and copying it
// keeps the adapter the only module that imports the package.

export type SegmentBreakKind =
  | 'text'
  | 'space'
  | 'preserved-space'
  | 'tab'
  | 'glue'
  | 'zero-width-break'
  | 'soft-hyphen'
  | 'hard-break';

const KINDS: readonly string[] = [
  'text',
  'space',
  'preserved-space',
  'tab',
  'glue',
  'zero-width-break',
  'soft-hyphen',
  'hard-break',
];

export function isSegmentBreakKind(value: string): value is SegmentBreakKind {
  return KINDS.includes(value);
}
