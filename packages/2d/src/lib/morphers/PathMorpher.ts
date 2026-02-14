export interface PathMorpherInterpolator {
  (progress: number): string;
}

export interface PathMorpher {
  createInterpolator(fromPath: string, toPath: string): PathMorpherInterpolator;
  dispose?(): void;
}
