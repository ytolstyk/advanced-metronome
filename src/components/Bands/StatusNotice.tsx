import type { ReactNode } from 'react';

/** Centered card for a terminal page state ("Band not found", "You were removed ..."). */
export function StatusNotice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center">
      <h1 className="mb-2 text-xl font-semibold text-foreground">{title}</h1>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
