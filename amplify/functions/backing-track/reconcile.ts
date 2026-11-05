/**
 * Per-user orphan reconcile. It runs only when a user hits their file quota, so there is no scheduled
 * infrastructure: it lists the caller's own committed objects (at most about 22) and removes the ones
 * nothing can reach any more, then the caller counts again.
 *
 * A committed object is reachable when a row owns its exact key AND its band is alive, the owner still
 * belongs to it, and its song still exists. Everything is read consistently, objects younger than the
 * grace period are never touched (an in-flight commit's copy), and the object is re-checked right before
 * each delete so a concurrent retry that just re-copied the same key survives.
 */
import { BACKING_TRACK_LIMITS, parseCommittedKey, userPrefix } from '../../../src/backingTrackFormat';
import type { Deps } from './ports';
import { isReconcilableOrphan } from './rules';

export async function reconcileUser(deps: Deps, sub: string): Promise<number> {
  const objects = await deps.s3.list(userPrefix(sub));
  const now = deps.now();

  // At most ~20 distinct bands / songs, each looked up once.
  const bandOk = new Map<string, Promise<boolean>>();
  const songOk = new Map<string, Promise<boolean>>();
  const bandStillMine = (bandId: string) => {
    let hit = bandOk.get(bandId);
    if (!hit) {
      hit = (async () => {
        const band = await deps.db.getBand(bandId);
        return !!band && !band.deletedAt && !!(await deps.db.getMember(bandId, sub));
      })();
      bandOk.set(bandId, hit);
    }
    return hit;
  };
  const songExists = (songId: string) => {
    let hit = songOk.get(songId);
    if (!hit) {
      hit = deps.db.getSong(songId).then((song) => !!song);
      songOk.set(songId, hit);
    }
    return hit;
  };

  let removed = 0;
  for (const object of objects) {
    // Anything younger than the grace period may belong to a commit that is still running.
    if (now - object.lastModified < BACKING_TRACK_LIMITS.orphanGraceMs) continue;

    const parts = parseCommittedKey(object.key);
    const row = parts ? await deps.db.getTrack(parts.trackId) : null;

    // No row, or a row that names another key: an orphan. A row that owns this exact key only goes when
    // its band, membership or song is gone (`parts` is non-null whenever a row was found).
    const orphan = isReconcilableOrphan(object, row, now);
    if (!orphan && parts && (await bandStillMine(parts.bandId)) && (await songExists(parts.songId))) continue;
    const rowToDelete = orphan ? null : row;

    const head = await deps.s3.head(object.key);
    if (!head || head.lastModified !== object.lastModified) continue;
    await deps.s3.remove(object.key);
    if (rowToDelete) await deps.db.deleteTrack(rowToDelete.id, rowToDelete.owner);
    removed += 1;
  }
  return removed;
}
