import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hub } from 'aws-amplify/utils';
import { forgetReturnPath, takeReturnPath } from './returnPath';

/**
 * Decided once per page load. Only the OAuth callback landing (`/?code=…&state=…`) counts; any
 * other load of `/` just discards the remembered path.
 */
function getTarget(): string | null {
  const isOAuthReturn =
    window.location.pathname === '/' && new URLSearchParams(window.location.search).has('state');
  if (isOAuthReturn) return takeReturnPath();
  forgetReturnPath();
  return null;
}

/**
 * Amplify starts completing the OAuth flow when `./amplify` is imported, and a failure (the user
 * cancelled at Google) can dispatch before React renders anything. So the Hub subscription is made
 * at module load and the component only consumes the outcome. Resolves once, with the page to
 * return to, when the token exchange has finished.
 */
const returnTarget: Promise<string> | null = (() => {
  const target = getTarget();
  if (!target) return null;
  return new Promise<string>((resolve) => {
    const stop = Hub.listen('auth', ({ payload }) => {
      if (payload.event !== 'signInWithRedirect' && payload.event !== 'signInWithRedirect_failure') return;
      stop();
      resolve(target);
    });
  });
})();

/**
 * After the Google sign-in redirect lands on `/`, sends the user back to the page they left.
 * Waits for Amplify's token exchange to finish: it rewrites the URL to `/` at that point, which
 * would undo an earlier navigation.
 */
export function ReturnToPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    void returnTarget?.then((target) => {
      // The user may have clicked away while the token exchange ran; don't yank them back.
      if (!cancelled && window.location.pathname === '/') navigate(target, { replace: true });
    });
    return () => {
      cancelled = true;
    };
    // First mount only: `navigate` changes identity on every route change and must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
