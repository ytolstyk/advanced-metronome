import { useState, useEffect, type ReactNode } from 'react';
import { useAuthenticator, Authenticator } from '@aws-amplify/ui-react';
import { Lock } from 'lucide-react';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import './AuthGate.css';

interface AuthSignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthSignInDialog({ open, onOpenChange }: AuthSignInDialogProps) {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);

  // Close as soon as the user authenticates
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    onOpenChange(false);
  }, [authStatus, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="auth-dialog-content">
        <VisuallyHidden.Root>
          <DialogTitle>Sign in or create an account</DialogTitle>
        </VisuallyHidden.Root>
        {/* Mount Authenticator only when the dialog is open — avoids booting
            the Amplify state machine and hub subscription when not needed */}
        {open && <Authenticator />}
      </DialogContent>
    </Dialog>
  );
}

interface AuthGateProps {
  /** Message shown in the lock banner when not authenticated */
  message?: string;
  /** Content shown when authenticated. If omitted, the gate is purely a lock banner. */
  children?: ReactNode;
  /** Extra CSS class on the banner */
  className?: string;
  /** Use the compact inline variant (e.g. inside a toolbar row) */
  inline?: boolean;
}

/**
 * Renders children when authenticated. When not, shows a lock banner with a
 * "Sign In" button that opens an inline auth dialog.
 */
export function AuthGate({ message = 'Sign in to unlock this feature', children, className, inline }: AuthGateProps) {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const [open, setOpen] = useState(false);

  if (authStatus === 'authenticated') return <>{children}</>;

  return (
    <>
      <div className={cn('auth-gate-banner', inline && 'auth-gate-banner--inline', className)}>
        <Lock size={13} />
        <span className="auth-gate-banner-message">{message}</span>
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs border-[#505270] text-[#aab0d0] hover:bg-[#252540] hover:text-[#ccd6ff]" onClick={() => setOpen(true)}>
          Sign In
        </Button>
      </div>
      <AuthSignInDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
