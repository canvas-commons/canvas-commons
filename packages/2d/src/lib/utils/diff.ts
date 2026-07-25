interface TransformDiff<T> {
  inserted: TransformDiffItem<T>[];
  deleted: TransformDiffItem<T>[];
  transformed: TransformDiffItemTransformed<T>[];
}

interface TransformDiffItem<T> {
  before?: T;
  beforeIdIndex: number;
  current: T;
  currentIndex: number;
}

interface TransformDiffItemTransformed<T> {
  insert: boolean;
  remove: boolean;
  from: TransformDiffItem<T>;
  to: TransformDiffItem<T>;
}

interface ApplyTransformInserted<T> {
  item: TransformDiffItem<T>;
  order: number;
}

interface ApplyTransformResult<T> {
  inserted: ApplyTransformInserted<T>[];
}

interface Idable {
  id: string;
}

/**
 * A correspondence produced by {@link alignSequences}. A missing `to` means the
 * item was removed, and a missing `from` means it was added.
 */
export interface AlignedPair<TFrom, TTo> {
  from: TFrom | null;
  to: TTo | null;
}

// Equal items are worth more so that they anchor the alignment, and a pair of
// differing items is worth more than an unpaired removal plus an unpaired
// insertion so that items which merely changed stay paired.
const MATCHED_SCORE = 2;
const CHANGED_SCORE = 1;

/**
 * Align two sequences, pairing up equal items and pairing the items between them
 * in order.
 *
 * @example
 * ```ts
 * alignSequences(['a', 'b', 'c'], ['a', 'x'], (from, to) => from === to);
 * // a -> a, b -> x, c -> null
 * ```
 *
 * @param from - The initial sequence.
 * @param to - The final sequence.
 * @param matches - Whether two items should be considered equal.
 */
export function alignSequences<TFrom, TTo>(
  from: readonly TFrom[],
  to: readonly TTo[],
  matches: (from: TFrom, to: TTo) => boolean,
): AlignedPair<TFrom, TTo>[] {
  const pairScore = (i: number, j: number) =>
    matches(from[i], to[j]) ? MATCHED_SCORE : CHANGED_SCORE;

  const scores = Array.from({length: from.length + 1}, () =>
    new Array<number>(to.length + 1).fill(0),
  );
  for (let i = 1; i <= from.length; i++) {
    for (let j = 1; j <= to.length; j++) {
      scores[i][j] = Math.max(
        scores[i - 1][j - 1] + pairScore(i - 1, j - 1),
        scores[i - 1][j],
        scores[i][j - 1],
      );
    }
  }

  // Preferring unpaired items over pairs of equal score pairs items up as early
  // as possible, leaving the leftovers of a changed run at its tail.
  const pairs: AlignedPair<TFrom, TTo>[] = [];
  let i = from.length;
  let j = to.length;
  while (i > 0 || j > 0) {
    if (i === 0 || (j > 0 && scores[i][j] === scores[i][j - 1])) {
      j--;
      pairs.push({from: null, to: to[j]});
    } else if (j === 0 || scores[i][j] === scores[i - 1][j]) {
      i--;
      pairs.push({from: from[i], to: null});
    } else {
      i--;
      j--;
      pairs.push({from: from[i], to: to[j]});
    }
  }

  return pairs.reverse();
}

function getIdMap<T extends Idable>(list: T[]) {
  const map = new Map<string, TransformDiffItem<T>[]>();
  let before: T | undefined = undefined;
  for (const [index, current] of list.entries()) {
    const currentArray = map.get(current.id) ?? [];
    if (!map.has(current.id)) {
      map.set(current.id, currentArray);
    }

    currentArray.push({
      before,
      current,
      beforeIdIndex: before ? map.get(before.id)!.length - 1 : -1,
      currentIndex: index,
    });
    before = current;
  }
  return map;
}

export function getTransformDiff<T extends Idable>(
  from: T[],
  to: T[],
): TransformDiff<T> {
  const diff: TransformDiff<T> = {
    inserted: [],
    deleted: [],
    transformed: [],
  };

  const fromMap = getIdMap(from);
  const toMap = getIdMap(to);

  for (const [key, fromItem] of fromMap.entries()) {
    const toItem = toMap.get(key);
    if (toItem) {
      toMap.delete(key);
      for (let i = 0; i < Math.max(fromItem.length, toItem.length); i++) {
        const insert = i >= fromItem.length;
        const remove = i >= toItem.length;

        const fromNode = !insert ? fromItem[i] : fromItem[fromItem.length - 1];
        const toNode = !remove ? toItem[i] : toItem[toItem.length - 1];

        diff.transformed.push({
          insert,
          remove,
          from: fromNode,
          to: toNode,
        });
      }
    } else {
      for (const node of fromItem) {
        diff.deleted.push(node);
      }
    }
  }

  for (const toItem of toMap.values()) {
    for (const node of toItem) {
      diff.inserted.push(node);
    }
  }

  return diff;
}

export function applyTransformDiff<T extends Idable>(
  current: T[],
  diff: TransformDiff<T>,
  cloner: (original: T) => T,
): ApplyTransformResult<T> {
  function insert(item: TransformDiffItem<T>) {
    let idIndex = -1;
    const index = item.before
      ? current.findIndex(({id}) => {
          if (id === item.before?.id) {
            idIndex++;
            if (idIndex === item.beforeIdIndex) return true;
          }
          return false;
        })
      : 0;
    current.splice(index + 1, 0, item.current);
  }

  const result: ApplyTransformResult<T> = {
    inserted: diff.inserted.map(item => ({
      item,
      order: item.currentIndex,
    })),
  };

  for (const item of diff.transformed) {
    if (!item.insert) continue;

    const from = item.from;
    item.from = {
      ...item.to,
      current: cloner(from.current),
    };
    result.inserted.push({
      item: item.from,
      order: item.to.currentIndex,
    });
  }

  result.inserted.sort((a, b) => a.order - b.order);

  for (const item of result.inserted) {
    insert(item.item);
  }

  return result;
}
