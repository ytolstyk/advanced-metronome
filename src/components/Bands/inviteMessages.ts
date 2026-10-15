import { BAND_LIMITS, type InviteFailure } from '../../bandTypes';
import { errorMessage } from '../../lib/errors';

const INVITE_MESSAGES: Record<InviteFailure, string> = {
  'invalid-code': 'That code doesn’t look right. It has 10 letters and numbers.',
  'not-found': 'No band found for that code.',
  revoked: 'That invite code is no longer valid. Ask for a new one.',
  deleted: 'That band has been deleted.',
  banned: 'You were removed from this band.',
  full: `This band is full (${BAND_LIMITS.maxMembers} members).`,
};

/** Runs an invite/join call and rethrows any failure with its friendly, user-facing message. */
export async function withInviteErrors<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    throw new Error(inviteErrorMessage(e));
  }
}

/** User-facing text for a thrown error from the invite/join API. */
export function inviteErrorMessage(e: unknown): string {
  const reason = (e as { reason?: InviteFailure } | null)?.reason;
  // hasOwn, not `in`: inherited names like 'toString' must not be treated as known reasons.
  if (reason && Object.hasOwn(INVITE_MESSAGES, reason)) return INVITE_MESSAGES[reason];
  return errorMessage(e);
}
