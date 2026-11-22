/** Splits `items` into chunks of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Removes duplicates, keeping first occurrences in order. */
export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/**
 * Orders `found` by `keys`. Returns the found item for each key in key order, plus the keys
 * with no match. Items whose key isn't in `keys` are dropped.
 */
export function orderBy<T>(
  keys: readonly string[],
  found: readonly T[],
  keyOf: (item: T) => string | undefined,
): { ordered: T[]; missing: string[] } {
  const byKey = new Map<string, T>();
  for (const item of found) {
    const key = keyOf(item);
    if (key !== undefined && !byKey.has(key)) byKey.set(key, item);
  }
  const ordered: T[] = [];
  const missing: string[] = [];
  for (const key of keys) {
    const item = byKey.get(key);
    if (item === undefined) missing.push(key);
    else ordered.push(item);
  }
  return { ordered, missing };
}
