import { useCallback, useState } from 'react';
import { errorMessage } from '../lib/errors';

/**
 * Busy + error state for one user action (submit a form, confirm a dialog). `run` resolves `true`
 * when the action succeeded and `false` when it threw (the message is then in `error`), so callers
 * never need their own try/catch/finally.
 */
export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<unknown>, fallback?: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(errorMessage(e, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { run, busy, error, setError, clearError };
}

/**
 * For page-level actions (ban, hide, rename ...): runs the action and ALWAYS reloads afterwards,
 * even when it failed, so a half-applied write can never leave stale data on screen.
 */
export function useActionThenReload(reload: () => Promise<void>) {
  const { run, busy, error, clearError } = useAsyncAction();
  const act = useCallback(
    (action: () => Promise<unknown>) =>
      run(async () => {
        try {
          await action();
        } finally {
          await reload();
        }
      }),
    [run, reload],
  );
  return { act, busy, error, clearError };
}
