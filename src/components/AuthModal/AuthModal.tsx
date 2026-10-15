import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { Button } from '@/components/ui/button';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import './AuthModal.css';

const FEDERATED_LABEL_RETRY_MS = 1000;
const FEDERATED_LABEL_MAX_RETRIES = 3;

/** Shortens an email (local part) or a display name for the nav button. */
function shortenLabel(label: string): string {
  const [local] = label.split('@');
  return local.length > 10 ? local.slice(0, 10) + '…' : local;
}

export function AuthModal() {
  const { authStatus, user, signOut } = useAuthenticator((ctx) => [ctx.authStatus, ctx.user]);
  const [open, setOpen] = useState(false);

  const isAuthenticated = authStatus === 'authenticated';

  // Close modal after successful sign-in (async to satisfy react-hooks/set-state-in-effect)
  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(id);
  }, [isAuthenticated]);

  // Federated (Google) users have no signInDetails.loginId — read email/name from attributes.
  // Right after the OAuth redirect the tokens may not be stored yet, so retry a few times.
  // Keyed by user id so a previous user's label never shows for the next one.
  const [federated, setFederated] = useState<{ id: string; label: string } | null>(null);
  const userId = user?.userId;

  useEffect(() => {
    if (!isAuthenticated || !userId || user?.signInDetails?.loginId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const retry = (attempt: number) => {
      if (cancelled || attempt >= FEDERATED_LABEL_MAX_RETRIES) return;
      timer = setTimeout(() => load(attempt + 1), FEDERATED_LABEL_RETRY_MS);
    };
    const load = (attempt: number) => {
      fetchUserAttributes()
        .then((attrs) => {
          if (cancelled) return;
          const label = attrs.email ?? attrs.name ?? attrs.preferred_username ?? '';
          if (label) setFederated({ id: userId, label });
          else retry(attempt);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          console.warn(`[AuthModal] fetchUserAttributes failed (attempt ${attempt + 1}):`, err);
          retry(attempt);
        });
    };
    load(0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isAuthenticated, userId, user?.signInDetails?.loginId]);

  const federatedLabel = federated && federated.id === userId ? federated.label : '';
  // Never show the raw federated username (e.g. "google_1052…") — it is an opaque id, not a name.
  const displayName = user?.signInDetails?.loginId ?? federatedLabel;
  const triggerText = isAuthenticated ? (displayName ? shortenLabel(displayName) : 'Account') : 'Sign In';

  function handleSignOut() {
    signOut();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`auth-trigger${isAuthenticated ? ' auth-trigger-signed-in' : ''}`}
        >
          <User size={14} />
          {triggerText}
        </Button>
      </DialogTrigger>

      <DialogContent className={isAuthenticated ? 'sm:max-w-sm' : 'auth-dialog-content'}>
        {isAuthenticated ? (
          <>
            <DialogHeader>
              <DialogTitle>Account</DialogTitle>
              <DialogDescription>Signed in to your account.</DialogDescription>
            </DialogHeader>
            <div className="auth-signed-in">
              {displayName && <p className="auth-email">{displayName}</p>}
              <Button variant="outline" onClick={handleSignOut} className="w-full">
                Sign Out
              </Button>
            </div>
          </>
        ) : (
          <>
            <VisuallyHidden.Root>
              <DialogTitle>Sign in or create an account</DialogTitle>
            </VisuallyHidden.Root>
            {/* Mount only when the dialog is open — avoids booting the
                Amplify state machine and hub subscription when not needed */}
            {open && <Authenticator socialProviders={['google']} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
