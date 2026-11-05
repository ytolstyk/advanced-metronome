/**
 * Removing backing tracks in bulk: a song's, a member's, a whole band's, or the caller's own on leaving. The
 * part of the feature that `bandsApi` and `setListsApi` call from their delete / leave / ban flows, kept apart
 * from uploading and playback so those flows do not pull in the XHR upload, signed links or storage config.
 * None of these is blocked by the uploads switch. Every function is a quiet no-op on a backend that predates
 * backing tracks.
 */
import { withTimeout } from '../lib/withTimeout';
import { bandsClient as client, requireAuth } from './bandsShared';
import { hasBackingTrackModel, songHasBackingTracks } from './bandReads';
import { BackingTrackError, run } from './backingTrackProtocol';

interface BulkReply {
  done: boolean;
  removed: number;
}

/** Bulk calls report `done: false` when they ran out of time; ask again a few times before giving up. */
const BULK_ROUNDS = 5;

async function untilDone(call: () => Promise<BulkReply>): Promise<void> {
  for (let round = 0; round < BULK_ROUNDS; round += 1) {
    if ((await call()).done) return;
  }
  throw new BackingTrackError('retry');
}

/** Deletes every backing track on a song (before the song itself is deleted). Throws if it could not finish. */
export async function removeSongBackingTracks(songId: string): Promise<void> {
  await requireAuth();
  if (!hasBackingTrackModel()) return;
  await untilDone(() => run<BulkReply>(() => client.mutations.removeSongBackingTracks({ songId })));
}

/**
 * `removeSongBackingTracks`, but skipped when the song visibly has none (one cheap index read), so deleting
 * an ordinary song never depends on the Lambda. If that read fails the Lambda is asked anyway.
 */
export async function removeSongBackingTracksIfAny(songId: string): Promise<void> {
  await requireAuth();
  if (!hasBackingTrackModel()) return;
  if ((await songHasBackingTracks(songId)) === false) return;
  await removeSongBackingTracks(songId);
}

/** Deletes the caller's own backing tracks in a band (leaving it). Needs no membership. */
export async function leaveMyBackingTracks(bandId: string): Promise<void> {
  await requireAuth();
  if (!hasBackingTrackModel()) return;
  await untilDone(() => run<BulkReply>(() => client.mutations.leaveMyBackingTracks({ bandId })));
}

/** How long a dialog waits on file cleanup before it stops waiting (the work may still finish on the server). */
const CLEANUP_BOUND_MS = 8_000;

/** `leaveMyBackingTracks`, but a stalled call cannot hold the leave dialog on "Working…" (like `deleteMyRigWithin`). */
export function leaveMyBackingTracksWithin(bandId: string, ms: number = CLEANUP_BOUND_MS): Promise<void> {
  return withTimeout(leaveMyBackingTracks(bandId), ms, 'leaveBackingTracks');
}

/**
 * Best-effort `leaveMyBackingTracks` for places that must not block or fail (dismissing a band): bounded,
 * one retry, never rejects. Anything left behind is collected the next time the user hits their quota.
 */
export async function cleanupMyBackingTracks(bandId: string): Promise<void> {
  const attempt = async () => {
    try {
      await leaveMyBackingTracks(bandId);
    } catch {
      await leaveMyBackingTracks(bandId);
    }
  };
  try {
    await withTimeout(attempt(), CLEANUP_BOUND_MS, 'cleanupBackingTracks');
  } catch (e) {
    console.warn('Could not remove your backing tracks', e);
  }
}

/** Band owner only: removes one member's files (used when banning) or, with `all`, every file of the band. */
export async function removeMemberBackingTracks(bandId: string, target: { memberSub: string } | 'all'): Promise<void> {
  await requireAuth();
  if (!hasBackingTrackModel()) return;
  await untilDone(() =>
    run<BulkReply>(() =>
      client.mutations.removeMemberBackingTracks(
        target === 'all' ? { bandId, mode: 'all' } : { bandId, mode: 'member', memberSub: target.memberSub },
      ),
    ),
  );
}
