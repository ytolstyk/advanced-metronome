import { useCallback, useState } from 'react';
import { loadFromStorage, saveToStorage } from '../api/storageUtils';

/**
 * State kept in localStorage. `parse` turns whatever is stored (anything, including garbage or
 * nothing) into a valid value, so a damaged entry can never crash a page. Writing is best-effort:
 * if storage is unavailable the value simply lasts for this visit.
 */
export function usePersistedState<T>(key: string, parse: (stored: unknown) => T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => parse(loadFromStorage<unknown>(key, null)));
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        saveToStorage(key, next);
      } catch {
        // Storage can be full or blocked; the page works without it.
      }
    },
    [key],
  );
  return [value, set];
}
