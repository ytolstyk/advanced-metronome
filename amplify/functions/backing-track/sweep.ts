/**
 * Global orphan sweep, run by an operator (`scripts/backing-tracks-sweep.ts`), never inline in a request.
 * It walks every committed object and removes the ones no row can reach: an old object with no row, or
 * whose row names a different key. (Objects of departed members, deleted songs or dead bands are the
 * per-user reconcile's job: they still have a row, and removing that row is a product decision.)
 *
 * Dry run is the default. A run deletes at most `limit` objects, re-checks each object right before
 * deleting it, and only touches objects older than the grace period (an in-flight commit's copy is younger).
 */
import { parseCommittedKey } from '../../../src/backingTrackFormat';
import type { Deps } from './ports';
import { isReconcilableOrphan } from './rules';

export interface SweepOptions {
  /** When true nothing is deleted; the orphans are only reported. */
  dryRun: boolean;
  /** Stop after this many deletions (or, in a dry run, this many findings). */
  limit: number;
}

export interface SweepReport {
  scanned: number;
  /** Keys of orphans found; in a real run these are the keys deleted. */
  orphans: string[];
  /** True when `limit` stopped the run early: run it again. */
  truncated: boolean;
}

export async function sweepOrphans(deps: Pick<Deps, 's3' | 'db' | 'now'>, options: SweepOptions): Promise<SweepReport> {
  const now = deps.now();
  const objects = await deps.s3.list('bt/');
  const report: SweepReport = { scanned: 0, orphans: [], truncated: false };

  for (const object of objects) {
    report.scanned += 1;
    const parts = parseCommittedKey(object.key);
    // A key that does not even parse is not ours to interpret: leave it for a human.
    if (!parts) continue;
    const row = await deps.db.getTrack(parts.trackId);
    if (!isReconcilableOrphan(object, row, now)) continue;

    if (report.orphans.length >= options.limit) {
      report.truncated = true;
      break;
    }
    if (!options.dryRun) {
      // Re-check just before deleting: a retried commit may have re-copied this very key since the listing.
      const head = await deps.s3.head(object.key);
      if (!head || head.lastModified !== object.lastModified) continue;
      // ...and ask again whether a row has appeared since the first look (the commit creates it last).
      const recheck = await deps.db.getTrack(parts.trackId);
      if (!isReconcilableOrphan(object, recheck, now)) continue;
      await deps.s3.remove(object.key);
    }
    report.orphans.push(object.key);
  }
  return report;
}
