import { useEffect, useState } from 'react';
import { getInviteIssuedAt } from '../api/bandsApi';
import { errorMessage } from '../lib/errors';
import type { LoaderState } from './useLoader';

/**
 * When the invite `code` was issued (see `getInviteIssuedAt`). Read once per code and never again
 * on tab focus: an invite's issue time cannot change, and the page's own reload brings a rotated
 * code, which starts a new read. A different code reads as loading until its own answer arrives.
 */
export function useInviteIssuedAt(code: string): LoaderState<string | null> {
  const [result, setResult] = useState<{ code: string; state: LoaderState<string | null> } | null>(null);
  useEffect(() => {
    let live = true;
    getInviteIssuedAt(code).then(
      (data) => live && setResult({ code, state: { status: 'ready', data } }),
      (e: unknown) => live && setResult({ code, state: { status: 'error', message: errorMessage(e) } }),
    );
    return () => {
      live = false;
    };
  }, [code]);
  return result?.code === code ? result.state : { status: 'loading' };
}
