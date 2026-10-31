import { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Button } from '@/components/ui/button';
import { AuthSignInDialog } from '@/components/AuthGate/AuthGate';

/** Shown instead of a broken share link; cloud saving is the way to keep a track this large. */
export function ShareTooLargeNotice() {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const [signInOpen, setSignInOpen] = useState(false);
  const signedIn = authStatus === 'authenticated';

  return (
    <div className="ct-warning-banner" role="status">
      <span>
        This track is too large for a share link.{' '}
        {signedIn ? 'Use Save to Cloud instead.' : 'Sign in to save it to the cloud instead.'}
      </span>
      {!signedIn && (
        <>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setSignInOpen(true)}>
            Sign In
          </Button>
          <AuthSignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
        </>
      )}
    </div>
  );
}
