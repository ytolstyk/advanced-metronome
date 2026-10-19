import { useState, useEffect, useId, type ReactNode } from 'react';
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
        {open && <Authenticator socialProviders={['google']} />}
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
  /** Use the large, centered banner for pages that are unusable without an account. */
  prominent?: boolean;
  /** Headline of the prominent banner. */
  title?: string;
}

/**
 * Renders children when authenticated. When not, shows a lock banner with a
 * "Sign In" button that opens an inline auth dialog.
 */
export function AuthGate({
  message = 'Sign in to unlock this feature',
  children,
  className,
  inline,
  prominent,
  title = 'Sign in required',
}: AuthGateProps) {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  if (authStatus === 'authenticated') return <>{children}</>;

  const dialog = <AuthSignInDialog open={open} onOpenChange={setOpen} />;

  if (prominent) {
    return (
      <>
        <section className={cn('auth-gate-hero', className)} aria-labelledby={titleId}>
          <Lock size={36} aria-hidden />
          <h2 id={titleId} className="auth-gate-hero-title">{title}</h2>
          <p className="auth-gate-hero-message">{message}</p>
          <Button size="lg" onClick={() => setOpen(true)}>
            Sign in or create an account
          </Button>
        </section>
        {dialog}
      </>
    );
  }

  return (
    <>
      <div className={cn('auth-gate-banner', inline && 'auth-gate-banner--inline', className)}>
        <Lock size={13} />
        <span className="auth-gate-banner-message">{message}</span>
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs border-[#505270] text-[#aab0d0] hover:bg-[#252540] hover:text-[#ccd6ff]" onClick={() => setOpen(true)}>
          Sign In
        </Button>
      </div>
      {dialog}
    </>
  );
}
