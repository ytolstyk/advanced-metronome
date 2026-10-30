import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/errors';
import { retryTransientAuth } from '../lib/transientAuth';

export type LoaderState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

/** Refetch on tab focus at most this often (no polling; GSI reads are cheap but not free). */
export const FOCUS_REFETCH_MS = 30_000;

/**
 * Loads data on mount, again on tab focus (throttled, never while a load is in flight) and on
 * `reload()`. Keeps the last good data on screen while refreshing and when a refresh fails (the
 * failure is reported in `refreshError`; `focusRefetchMs` raises the refetch throttle for public pages); a failed *first* load is an error state, never an
 * empty-looking page. A signed-in person's momentary "No current user" (token refresh race) is retried quietly first. Mount it with a `key` per resource so state resets by remount.
 */
export function useLoader<T>(load: () => Promise<T>, { focusRefetchMs = FOCUS_REFETCH_MS }: { focusRefetchMs?: number } = {}) {
  const [state, setState] = useState<LoaderState<T>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const loadRef = useRef(load);
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const lastStartedAt = useRef(0);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  /** Drops any in-flight load's result (unmount or superseded). */
  const invalidate = useCallback(() => {
    requestId.current++;
  }, []);

  const fetchData = useCallback(async (isRefresh: boolean) => {
    const id = ++requestId.current;
    inFlight.current = true;
    lastStartedAt.current = Date.now();
    if (isRefresh) setRefreshing(true);
    try {
      const data = await retryTransientAuth(() => loadRef.current());
      if (id !== requestId.current) return;
      setState({ status: 'ready', data });
      setRefreshError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      const message = errorMessage(e);
      setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', message }));
      setRefreshError(message);
    } finally {
      if (id === requestId.current) {
        inFlight.current = false;
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchData(false);
    return invalidate;
  }, [fetchData, invalidate]);

  useEffect(() => {
    // `focus` and `visibilitychange` both fire when returning to a tab: one refetch, not two.
    const onReturn = () => {
      if (document.visibilityState === 'hidden' || inFlight.current) return;
      if (Date.now() - lastStartedAt.current >= focusRefetchMs) void fetchData(true);
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [fetchData, focusRefetchMs]);

  const reload = useCallback(() => fetchData(true), [fetchData]);
  return { state, refreshing, refreshError, reload };
}
