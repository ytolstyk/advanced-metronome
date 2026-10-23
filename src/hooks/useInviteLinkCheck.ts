import { useEffect, useState } from 'react';
import { lookupInvite } from '../api/bandsApi';
import type { DeadLinkReason, InvitePreview } from '../bandTypes';
import { inviteErrorMessage, inviteFailureReason } from '../components/Bands/inviteMessages';

export type InviteLinkCheck =
  | { status: 'none' }
  | { status: 'checking' }
  | { status: 'good'; preview: InvitePreview }
  | { status: 'dead'; reason: DeadLinkReason }
  /** Banned, full, deleted, offline ...: the join dialog opens showing this message. */
  | { status: 'other'; message: string };

function classify(e: unknown): InviteLinkCheck {
  const reason = inviteFailureReason(e);
  if (reason === 'expired' || reason === 'revoked') return { status: 'dead', reason };
  return { status: 'other', message: inviteErrorMessage(e) };
}

/**
 * Looks a shared invite link's code up once, as soon as the page opens, so a dead link can get its
 * own page instead of an error inside a dialog. A different code is a new check; an empty code
 * (no link) is `none` and calls nothing.
 */
export function useInviteLinkCheck(code: string): InviteLinkCheck {
  const [result, setResult] = useState<{ code: string; check: InviteLinkCheck } | null>(null);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const settle = (check: InviteLinkCheck) => {
      if (!cancelled) setResult({ code, check });
    };
    lookupInvite(code).then(
      (preview) => settle({ status: 'good', preview }),
      (e: unknown) => settle(classify(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [code]);
  if (!code) return { status: 'none' };
  return result?.code === code ? result.check : { status: 'checking' };
}
