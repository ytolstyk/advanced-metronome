import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
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

function shortenEmail(email: string): string {
  const [local] = email.split('@');
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

  const displayName = user?.signInDetails?.loginId ?? user?.username ?? '';
  const triggerText = isAuthenticated ? shortenEmail(displayName) : 'Sign In';

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
              <p className="auth-email">{displayName}</p>
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
            <Authenticator />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
