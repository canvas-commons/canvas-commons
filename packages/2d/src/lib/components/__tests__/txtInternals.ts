import {onTestFinished} from 'vitest';
import {Txt} from '../Txt';

// The members read here are private so they stay out of the published types;
// element access reaches them with their types intact.

/** The prepared paragraph of the current state. */
export function paragraphOf(txt: Txt) {
  return txt['paragraph']();
}

/** The narrowest width the paragraph's lines fit in. */
export function contentFloorOf(txt: Txt) {
  return txt['contentFloor']();
}

/** The placement at a width, as layout and paint read it. */
export function naturalPlacementOf(txt: Txt, maxWidth: number) {
  return txt['naturalPlacement'](maxWidth);
}

/** Every draw the placed layout makes. */
export function paintPlanOf(txt: Txt) {
  return txt['paintPlan']();
}

/** The layout inputs the last yoga measurement was marked against. */
export function measureKeyOf(txt: Txt) {
  return txt['lastMeasureKey'];
}

/** Every input a break and a placement depend on. */
export function layoutKeyOf(txt: Txt) {
  return txt['paragraphLayoutKey']();
}

/** Count the placements `txt` makes of its own paragraph from now on. */
export function countPlacements(txt: Txt): () => number {
  const place = txt['placeWith'];
  let count = 0;
  txt['placeWith'] = function (this: Txt, ...args: Parameters<typeof place>) {
    count++;
    return place.apply(this, args);
  };
  return () => count;
}

/** Count the owner span lookups every `Txt` makes until the test ends. */
export function countOwnerLookups(): () => number {
  const lookup = Txt['ownerIndexAt'];
  let count = 0;
  Txt['ownerIndexAt'] = (...args: Parameters<typeof lookup>) => {
    count++;
    return lookup(...args);
  };
  onTestFinished(() => {
    Txt['ownerIndexAt'] = lookup;
  });
  return () => count;
}
