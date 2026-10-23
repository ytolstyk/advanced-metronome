import type { ReactNode } from 'react';

/**
 * Centered card for a terminal page state ("Band not found", "You were removed ..."). Use
 * `headingLevel="h2"` where the page already has its own `<h1>`.
 */
export function StatusNotice({
  title,
  headingLevel: Heading = 'h1',
  children,
}: {
  title: string;
  headingLevel?: 'h1' | 'h2';
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center">
      <Heading className="mb-2 text-xl font-semibold text-foreground">{title}</Heading>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
