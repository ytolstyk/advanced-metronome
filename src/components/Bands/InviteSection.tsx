import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ensureFreshInvite, setInviteTtlDays } from '../../api/bandsApi';
import { BAND_LIMITS, type BandView } from '../../bandTypes';
import { buildInviteLink, formatInviteCode, inviteStatus, type InviteStatus } from '../../bandUtils';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useClock } from '../../hooks/useClock';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { useInviteIssuedAt } from '../../hooks/useInviteIssuedAt';
import type { LoaderState } from '../../hooks/useLoader';
import { FIELD_LABEL_CLASS, SELECT_CLASS } from './cardStyles';
import { InlineAlert } from './InlineAlert';

const TTL_CHOICES = Array.from(
  { length: BAND_LIMITS.inviteTtlDaysMax - BAND_LIMITS.inviteTtlDaysMin + 1 },
  (_, i) => BAND_LIMITS.inviteTtlDaysMin + i,
);
const dayText = (days: number): string => `${days} ${days === 1 ? 'day' : 'days'}`;
const formatExpiry = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** `unknown` (the read failed) is neither blocked nor warned about: the join check is the authority. */
type LinkState = InviteStatus | { kind: 'checking' } | { kind: 'unknown' };

function linkState(issued: LoaderState<string | null>, ttlDays: number, now: number): LinkState {
  if (issued.status === 'loading') return { kind: 'checking' };
  if (issued.status === 'error') return { kind: 'unknown' };
  return inviteStatus(issued.data, ttlDays, now);
}

function statusText(state: LinkState, isOwner: boolean, ttlDays: number): string {
  if (state.kind === 'valid') return `This link works until ${formatExpiry(state.expiresAt)}.`;
  if (state.kind === 'expired') {
    return isOwner ? 'This link has expired; copying makes a new one.' : 'This link has expired. Ask the band owner for a new one.';
  }
  return isOwner ? '' : `Invite links work for ${dayText(ttlDays)}.`;
}

function copyButtonLabel(copied: boolean, busy: boolean, renewsOnCopy: boolean): string {
  if (copied) return 'Copied!';
  if (busy) return 'Working…';
  return renewsOnCopy ? 'New link & copy' : 'Copy invite link';
}

export function InviteSection({
  view,
  onReset,
  onChanged,
}: {
  view: BandView;
  onReset: () => void;
  /** The band row changed (new code or lifetime): reload the page. */
  onChanged: () => void;
}) {
  const { band, isOwner } = view;
  const [copied, copy] = useCopyToClipboard();
  const [copyFailed, setCopyFailed] = useState(false);
  const { run, busy, error } = useAsyncAction();
  const issuedAt = useInviteIssuedAt(band.inviteCode);
  const now = useClock();
  const state = linkState(issuedAt, band.inviteTtlDays, now);
  const expired = state.kind === 'expired';
  const link = buildInviteLink(window.location.origin, band.inviteCode);

  // The owner's copy is authoritative: it re-checks the invite and only renews a dead one. The
  // link is handed to the clipboard as a promise so the click's permission outlives that check.
  const onCopy = async () => {
    const fresh = isOwner ? ensureFreshInvite(band.id) : Promise.resolve(band);
    const url = fresh.then(
      (b) => buildInviteLink(window.location.origin, b.inviteCode) ?? Promise.reject(new Error('Invalid invite code')),
    );
    setCopyFailed(false);
    await run(async () => {
      const ok = await copy(url);
      setCopyFailed(!ok);
    });
    // Even if the clipboard refused early, the renewal may still be running: wait for it so the page
    // never keeps showing a code that was just replaced. After the copy, so "Copied!" survives.
    const settled = await fresh.then(
      (b) => b,
      () => null,
    );
    if (settled && settled.inviteCode !== band.inviteCode) onChanged();
  };

  // Reloads after a failure too (a half-applied write must not leave a stale page).
  const onTtlChange = async (days: number) => {
    await run(() => setInviteTtlDays(band.id, days));
    onChanged();
  };

  const copyLabel = copyButtonLabel(copied, busy, isOwner && expired);
  return (
    <section aria-labelledby="invite-heading" className="mb-8">
      <h2 id="invite-heading" className="mb-2 text-lg font-semibold text-foreground">Invite</h2>
      <p className="mb-2 text-sm text-muted-foreground">
        Anyone with this code or link can join instantly. Share it only with people you trust.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code
          className={cn(
            'rounded-md bg-card px-3 py-2 font-mono text-base tracking-wider',
            expired ? 'text-muted-foreground line-through' : 'text-foreground',
          )}
        >
          {link ? formatInviteCode(band.inviteCode) : '—'}
        </code>
        <Button
          variant="outline"
          size="sm"
          disabled={!link || busy || (!isOwner && expired)}
          onClick={() => void onCopy()}
        >
          {copyLabel}
        </Button>
        {isOwner && (
          <Button variant="ghost" size="sm" onClick={onReset} disabled={busy}>
            Reset code
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
        {statusText(state, isOwner, band.inviteTtlDays)}
      </p>
      {isOwner && (
        <label className={cn(FIELD_LABEL_CLASS, 'mt-2 max-w-48')}>
          Invite links work for
          <select
            className={SELECT_CLASS}
            disabled={busy}
            value={band.inviteTtlDays}
            onChange={(e) => void onTtlChange(Number(e.target.value))}
          >
            {TTL_CHOICES.map((days) => (
              <option key={days} value={days}>
                {dayText(days)}
              </option>
            ))}
          </select>
        </label>
      )}
      {copyFailed && (
        <InlineAlert tone="warning" className="mt-2">
          Couldn’t copy automatically. Select the code and copy it by hand.
        </InlineAlert>
      )}
      {error && (
        <InlineAlert tone="error" className="mt-2">
          {error}
        </InlineAlert>
      )}
    </section>
  );
}
