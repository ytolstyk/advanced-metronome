import { Button } from '@/components/ui/button';
import type { DeadLinkReason } from '../../bandTypes';
import { StatusNotice } from './StatusNotice';

const COPY: Record<DeadLinkReason, { title: string; why: string }> = {
  expired: {
    title: 'This invite link has expired',
    why: 'Invite links only work for a limited time, so an old link can’t be used to get into a band.',
  },
  revoked: {
    title: 'This invite link is no longer valid',
    why: 'The band owner replaced this link with a newer one, or the band no longer exists.',
  },
};

/** Shown instead of the band list when someone opens a shared invite link that no longer works. */
export function ExpiredInviteNotice({
  reason,
  onEnterCode,
  onDismiss,
}: {
  reason: DeadLinkReason;
  onEnterCode: () => void;
  onDismiss: () => void;
}) {
  return (
    <StatusNotice title={COPY[reason].title} headingLevel="h2">
      <p className="mb-2">{COPY[reason].why}</p>
      <p className="mb-5">
        Ask the band owner to send you a new link. They can copy a fresh one from the Invite section on their
        band page. Then open it, or enter its code.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onEnterCode}>Enter a new code</Button>
        <Button variant="outline" onClick={onDismiss}>
          Back to my bands
        </Button>
      </div>
    </StatusNotice>
  );
}
