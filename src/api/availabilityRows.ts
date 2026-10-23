import type { AvailabilityRead, AvailabilityRecord, BandRecord } from '../bandTypes';
import { classifyOwnRow, planSave, type SaveBlockReason } from '../availabilityUtils';
import { withTimeout } from '../lib/withTimeout';
import { getCurrentUserSub } from './authUtils';
import {
  bandsClient as client,
  deleteConfirmed,
  deleteQuietly,
  isConflict,
  isUnauthorized,
  requireAuth,
  throwOnError,
  withKeyLock,
} from './bandsShared';

/**
 * Reading, saving and deleting one member's availability row, by exact key. This is a LEAF module
 * (it imports only shared helpers and pure logic) so `bandsApi.dismissBand` can clean up after a
 * leaver without a cycle; page loading lives in `availabilityApi.ts`. Saves and deletes for a band
 * share one lock key, so a delete can never race a save started from the same tab.
 */

/** Longest a cleanup is allowed to hold up leaving a band. */
export const AVAILABILITY_CLEANUP_MS = 5_000;
/** Read-merge-write passes before a save gives up (a pass is lost to another tab, or a vanished row). */
const SAVE_ATTEMPTS = 3;

/** The backend predates this feature (frontend deployed ahead of the schema): availability can't be used yet. */
export class AvailabilityUnavailableError extends Error {
  constructor() {
    super('Availability is not available yet');
    this.name = 'AvailabilityUnavailableError';
  }
}

/** Saving is refused because overwriting the stored row would be wrong (see `planSave`). */
export class AvailabilityBlockedError extends Error {
  readonly reason: SaveBlockReason;
  constructor(reason: SaveBlockReason) {
    super(`Cannot save availability: ${reason}`);
    this.name = 'AvailabilityBlockedError';
    this.reason = reason;
  }
}

type AvailabilityModel = typeof client.models.Availability;

/** The model, or `undefined` when this backend doesn't have it (an older deployment). */
const availabilityModel = (): AvailabilityModel | undefined =>
  (client.models as { Availability?: AvailabilityModel }).Availability;

function requireModel(): AvailabilityModel {
  const model = availabilityModel();
  if (!model) throw new AvailabilityUnavailableError();
  return model;
}

type AvailabilityRowData = NonNullable<Awaited<ReturnType<AvailabilityModel['get']>>['data']>;

export function toAvailability(r: AvailabilityRowData): AvailabilityRecord {
  return {
    bandId: r.bandId,
    owner: r.owner,
    format: r.format,
    startDay: r.startDay,
    mask: r.mask,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/**
 * One member's row by key. A failed read is a result, not an exception, so one bad row can't take
 * down the whole group view. `isAvailabilityAvailable` is checked by the caller.
 */
export async function getAvailabilityRead(bandId: string, owner: string): Promise<AvailabilityRead> {
  try {
    const res = await requireModel().get({ bandId, owner });
    if (res.errors?.length) {
      console.warn('Could not read an availability row', res.errors);
      return { status: 'failed' };
    }
    return { status: 'ok', row: res.data ? toAvailability(res.data) : null };
  } catch (e) {
    if (e instanceof AvailabilityUnavailableError) throw e;
    console.warn('Could not read an availability row', e);
    return { status: 'failed' };
  }
}

export const isAvailabilityAvailable = (): boolean => availabilityModel() !== undefined;

export interface SavedAvailability {
  row: AvailabilityRecord;
  /** The stored row was unreadable and has been replaced (tell the user). */
  reset: boolean;
}

/**
 * Applies the caller's edits to their stored row and writes it. Each pass re-reads the row, so a
 * save never builds on a stale copy; `planSave` decides what to write (or refuses), this only
 * executes it. A create that finds the row already there, or an update that finds it gone (which
 * the API reports as Unauthorized), simply goes round again. Two devices saving within one round
 * trip can still overwrite each other (last write wins); that only ever affects the caller's own row.
 */
export function saveMyAvailability(
  band: BandRecord,
  edits: ReadonlyMap<number, boolean>,
  nowMs?: number,
): Promise<SavedAvailability> {
  return withKeyLock(`availability:${band.id}`, async () => {
    await requireAuth();
    const model = requireModel();
    const owner = await getCurrentUserSub();
    const key = { bandId: band.id, owner };
    for (let pass = 0; pass < SAVE_ATTEMPTS; pass++) {
      const read = await getAvailabilityRead(band.id, owner);
      const state = classifyOwnRow(read, band, owner);
      // The clock is read now, not when the call was queued behind another save or delete.
      const plan = planSave(state, edits, nowMs ?? Date.now());
      if (plan.kind === 'blocked') throw new AvailabilityBlockedError(plan.reason);
      const stored = read.status === 'ok' ? read.row : null;
      // Nothing to change (e.g. a mark that was switched on and off again): skip the write.
      if (stored && state.kind === 'ok' && plan.row.startDay === stored.startDay && plan.row.mask === stored.mask) {
        return { row: stored, reset: false };
      }
      const res =
        state.kind === 'none'
          ? await model.create({ ...key, ...plan.row })
          : await model.update({ ...key, ...plan.row });
      if (!res.errors?.length && res.data) return { row: toAvailability(res.data), reset: plan.reset };
      if (isConflict(res.errors) || isUnauthorized(res.errors)) continue;
      throwOnError(res, 'saveAvailability');
    }
    throw new Error('Could not save your availability. Please try again.');
  });
}

/**
 * Removes the caller's own row, if there is one (most leavers never used availability, so a missing
 * row is not an error). A no-op against a backend without the model. Serialised with saves.
 * `confirmed`: an Unauthorized reply only counts as success if a re-read shows the row is gone, so
 * a refused delete is never reported as done. `quiet` (best-effort cleanup) accepts it.
 */
async function removeMyRow(bandId: string, mode: 'confirmed' | 'quiet'): Promise<void> {
  await requireAuth();
  const model = availabilityModel();
  if (!model) return;
  const owner = await getCurrentUserSub();
  const isGone = async (): Promise<boolean> => {
    const res = await model.get({ bandId, owner });
    return !res.errors?.length && !res.data;
  };
  await withKeyLock(`availability:${bandId}`, async () => {
    if (await isGone()) return;
    const run = () => model.delete({ bandId, owner });
    if (mode === 'quiet') await deleteQuietly(run, 'deleteAvailability');
    else await deleteConfirmed(run, isGone, 'deleteAvailability');
  });
}

/** The user-initiated delete ("Delete my availability"): throws unless the row is really gone. */
export const deleteMyAvailability = (bandId: string): Promise<void> => removeMyRow(bandId, 'confirmed');

/** `deleteMyAvailability` that gives up after `ms`, so a stalled save can't hold a dialog on "Working…". */
export function deleteMyAvailabilityWithin(bandId: string, ms: number = AVAILABILITY_CLEANUP_MS): Promise<void> {
  return withTimeout(deleteMyAvailability(bandId), ms, 'deleteAvailability');
}

/**
 * Best-effort cleanup for paths with no UI to report to (dismissing a removed or deleted band): one
 * retry, bounded overall, and it never rejects or blocks leaving. A row that survives stays hidden
 * once the member is gone.
 */
export async function cleanupMyAvailability(bandId: string): Promise<void> {
  const attempt = async () => {
    try {
      await removeMyRow(bandId, 'quiet');
    } catch {
      await removeMyRow(bandId, 'quiet');
    }
  };
  try {
    await withTimeout(attempt(), AVAILABILITY_CLEANUP_MS, 'cleanupAvailability');
  } catch (e) {
    console.warn('Could not remove your availability', e);
  }
}
