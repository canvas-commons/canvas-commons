/**
 * The autoSize search: the largest whole size at or below a sound ceiling that
 * fits its box.
 *
 * Sizes are walked downward one whole pixel at a time, because the predicate is
 * not monotone: a hyphen, an exclusion band and an optimal break pass all let a
 * smaller size fail where a larger one fits. An arithmetic probe may skip a
 * size only when it misses by more than the error the arithmetic can carry;
 * every size it accepts, and every near miss, is decided by a real layout. A
 * probe whose accepted size the real layout denies is not describing this
 * font, and the rest of the scan runs without it.
 */

/** What an arithmetic probe says about one size. */
export type ProbeVerdict = {
  readonly fits: boolean;
  /** True when a rejection is beyond doubt, so no real layout is needed. */
  readonly final: boolean;
};

/**
 * Find the size the search settles on. The answer is always one `verify`
 * accepted, or `1` when it accepted none.
 *
 * @example
 * ```ts
 * const size = searchFitSize(48, probe, size => reallyFits(size));
 * ```
 */
export function searchFitSize(
  ceiling: number,
  probe: ((size: number) => ProbeVerdict) | null,
  verify: (size: number) => boolean,
): number {
  let scaled = probe;
  for (let size = Math.floor(ceiling); size >= 1; size--) {
    if (scaled !== null) {
      const verdict = scaled(size);
      if (!verdict.fits && verdict.final) continue;
      if (verify(size)) return size;
      if (verdict.fits) scaled = null;
      continue;
    }
    if (verify(size)) return size;
  }
  return 1;
}
