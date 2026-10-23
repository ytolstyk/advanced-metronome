import { useState } from 'react';
import { archiveSetList, deleteMyContent } from '../../api/setListsApi';
import { deleteMyAvailabilityWithin } from '../../api/availabilityApi';
import { banMember, deleteBand, dismissBand, resetInviteCode, type DeleteStep } from '../../api/bandsApi';
import type { BandRecord } from '../../bandTypes';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * One small component per destructive band action. Each is mounted only while it is active and
 * owns its own state (checkbox, progress), so the band page keeps a single `dialog` value.
 */

interface BaseProps {
  onClose: () => void;
  /** Runs after every attempt (reload the page, so a half-applied write is never shown stale). */
  onSettled?: () => void;
}

export function RemoveMemberDialog({ bandId, sub, name, onClose, onSettled }: BaseProps & { bandId: string; sub: string; name: string }) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Remove ${name}?`}
      description="They disappear from the band and their songs and votes stop showing. You can restore them later. Someone who already has the band link could still read it."
      confirmLabel="Remove"
      destructive
      onConfirm={async () => void (await banMember(bandId, sub))}
      onSettled={onSettled}
    />
  );
}

export function ArchiveSetListDialog({ bandId, setListId, name, onClose, onSettled }: BaseProps & { bandId: string; setListId: string; name: string }) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Archive “${name}”?`}
      description="The set list and its songs disappear from the band. This can’t be undone."
      confirmLabel="Archive"
      destructive
      onConfirm={() => archiveSetList(bandId, setListId)}
      onSettled={onSettled}
    />
  );
}

export function ResetInviteDialog({ bandId, onClose, onSettled }: BaseProps & { bandId: string }) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Reset the invite code?"
      description="A new code is created (with a fresh expiry) and the old one stops working. This only stops people who don’t already have the old code or this page’s link; existing members keep access."
      confirmLabel="Reset code"
      onConfirm={async () => void (await resetInviteCode(bandId))}
      onSettled={onSettled}
    />
  );
}

export function LeaveBandDialog({ band, onClose, onLeft }: Pick<BaseProps, 'onClose'> & { band: BandRecord; onLeft: () => void }) {
  const [alsoDeleteSongs, setAlsoDeleteSongs] = useState(true);
  const [cleanupFailed, setCleanupFailed] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Leave this band?"
      description="Your votes and availability are removed. You can rejoin later with an invite code."
      confirmLabel={cleanupFailed ? 'Leave anyway' : 'Leave band'}
      destructive
      onConfirm={async () => {
        if (!cleanupFailed) {
          // Both run to the end, so a failure in one can't skip the other.
          const results = await Promise.allSettled([
            deleteMyContent(band, alsoDeleteSongs),
            deleteMyAvailabilityWithin(band.id),
          ]);
          if (results.some((r) => r.status === 'rejected')) {
            // Offer to leave without the cleanup instead of silently leaving data behind.
            setCleanupFailed(true);
            throw new Error('Couldn’t remove all of your content. Leave anyway, or cancel and try again later.');
          }
        }
        await dismissBand(band.id);
        onLeft();
      }}
    >
      <label className="flex items-center gap-2 text-sm text-foreground/80">
        <input
          type="checkbox"
          checked={alsoDeleteSongs}
          disabled={cleanupFailed}
          onChange={(e) => setAlsoDeleteSongs(e.target.checked)}
        />
        Also delete the songs I suggested
      </label>
    </ConfirmDialog>
  );
}

const DELETE_STEP_TEXT: Record<DeleteStep, string> = {
  'set-lists': 'Archiving set lists…',
  tombstone: 'Closing the band and clearing its details…',
  invite: 'Retiring the invite code…',
  done: 'Done.',
};

export function DeleteBandDialog({ bandId, onClose, onSettled, onDeleted }: BaseProps & { bandId: string; onDeleted: () => void }) {
  const [step, setStep] = useState<DeleteStep | null>(null);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Delete this band?"
      description={step ? DELETE_STEP_TEXT[step] : 'The band closes for everyone and its invite stops working. This can’t be undone.'}
      confirmLabel="Delete band"
      destructive
      onConfirm={async () => {
        try {
          await deleteBand(bandId, setStep);
        } finally {
          setStep(null);
        }
        await dismissBand(bandId).catch(() => undefined);
        onDeleted();
      }}
      // After a failed attempt the page must show what actually happened (e.g. an already-closed band).
      onSettled={onSettled}
    />
  );
}
