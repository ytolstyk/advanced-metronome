import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface BandsShellProps {
  /** Accessible name of the page's main landmark. */
  label: string;
  back?: { to: string; text: string };
  /** A page with a wide diagram: use more of the screen than the reading column. */
  wide?: boolean;
  children: ReactNode;
}

/** Page frame shared by the Bands pages. */
export function BandsShell({ label, back, wide, children }: BandsShellProps) {
  return (
    <main className={cn('mx-auto px-5 py-8', wide ? 'max-w-6xl' : 'max-w-3xl')} aria-label={label}>
      {back && (
        <Link to={back.to} className="mb-4 inline-block text-sm text-muted-foreground no-underline hover:text-foreground">
          {back.text}
        </Link>
      )}
      {children}
    </main>
  );
}
