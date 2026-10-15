import { LIST_PAGE_SIZE, MAX_LIST_PAGES, type ListAllResult, type ReadAuthMode } from '../bandTypes';

export interface PageResult<T> {
  items: T[];
  nextToken?: string | null;
}

/** Options for one index/list query page (`authMode` only when the caller is a resolved guest/reader). */
export const pageOpts = (nextToken: string | undefined, authMode?: ReadAuthMode) => ({
  limit: LIST_PAGE_SIZE,
  nextToken,
  ...(authMode ? { authMode } : {}),
});

/**
 * Follows `nextToken` to the end. Stops at `maxPages` and reports `incomplete` so the UI can say
 * "some rows may be missing" (e.g. a junk flood against a known setListId).
 */
export async function listAll<T>(
  fetchPage: (nextToken: string | undefined) => Promise<PageResult<T>>,
  maxPages: number = MAX_LIST_PAGES,
): Promise<ListAllResult<T>> {
  const items: T[] = [];
  let token: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const res = await fetchPage(token);
    items.push(...res.items);
    token = res.nextToken ?? undefined;
    if (!token) return { items, incomplete: false };
  }
  return { items, incomplete: true };
}

/**
 * Runs `fn` over `items` with at most `limit` in flight (no unbounded request bursts). Every item
 * is attempted; the first failure is rethrown after all have settled.
 */
export async function runPool<T>(limit: number, items: readonly T[], fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let firstError: unknown;
  let failed = false;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (e) {
        if (!failed) {
          failed = true;
          firstError = e;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed) throw firstError;
}
