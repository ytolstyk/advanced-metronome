import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface BandsShellProps {
  /** Accessible name of the page's main landmark. */
  label: string;
  back?: { to: string; text: string };
  children: ReactNode;
}

/** Page frame shared by the three Bands pages. */
export function BandsShell({ label, back, children }: BandsShellProps) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8" aria-label={label}>
      {back && (
        <Link to={back.to} className="mb-4 inline-block text-sm text-muted-foreground no-underline hover:text-foreground">
          {back.text}
        </Link>
      )}
      {children}
    </main>
  );
}
