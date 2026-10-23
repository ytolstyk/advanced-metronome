import { Button } from '@/components/ui/button';

/** What saving availability shares, shown once before the first save (nothing is written until it is accepted). */
export function AvailabilityNotice({ hasUnsavedEdits, onAccept }: { hasUnsavedEdits: boolean; onAccept: () => void }) {
  return (
    <section aria-labelledby="availability-notice-heading" className="mb-4 rounded-lg border border-border bg-card p-3">
      <h2 id="availability-notice-heading" className="mb-1 text-base font-semibold text-foreground">Before you save</h2>
      <p className="mb-2 text-sm text-muted-foreground">
        Your free times are stored in the cloud and can be read by anyone with an account who has this band’s link
        (a shared set list link counts). That can show when you’re away. You can delete them at any time.
        {hasUnsavedEdits && ' Your changes are kept on this page and will save once you accept; leaving the page first discards them.'}
      </p>
      <Button className="min-h-11" onClick={onAccept}>I understand</Button>
    </section>
  );
}
