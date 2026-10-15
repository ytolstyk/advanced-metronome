import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Inline message: `error` interrupts screen readers (role=alert), `warning` is polite (role=status). */
export function InlineAlert({
  tone,
  className,
  children,
}: {
  tone: 'error' | 'warning';
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-md border p-3 text-sm',
        tone === 'error'
          ? 'border-red-900/50 bg-red-950/20 text-red-300'
          : 'border-amber-900/50 bg-amber-950/20 text-amber-300',
        className,
      )}
    >
      {children}
    </p>
  );
}
