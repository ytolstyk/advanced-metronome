import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/errors';

/** One remote read that may still be loading, failed, or ready. */
export type Remote<T> = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; value: T };

const IDLE = { status: 'idle' } as const;

/** Runs `load` whenever `key` changes (and is non-null), ignoring answers that arrive after a newer request. */
export function useRemote<T>(key: string | null, load: () => Promise<T>): Remote<T> {
  const [state, setState] = useState<{ key: string | null; remote: Remote<T> }>({ key: null, remote: IDLE });
  const loadRef = useRef(load);
  // Keep the latest loader without re-running the load on every render (declared first, so it runs before the load effect).
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (key === null) return;
    let stale = false;
    loadRef.current().then(
      (value) => !stale && setState({ key, remote: { status: 'ready', value } }),
      (e: unknown) => !stale && setState({ key, remote: { status: 'error', message: errorMessage(e, 'Could not load this') } }),
    );
    return () => {
      stale = true;
    };
  }, [key]);

  if (key === null) return IDLE;
  // Until the first answer for this key arrives, it is loading (never show the previous key's data).
  return state.key === key ? state.remote : { status: 'loading' };
}
