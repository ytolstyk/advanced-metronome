import type { ColorLabelRecord, ListAllResult, SongColorKey } from '../bandTypes';
import { sanitizeColorLabel } from '../bandUtils';
import { getCurrentUserSub } from './authUtils';
import { listColorLabels } from './bandReads';
import {
  bandsClient as client,
  createIdempotent,
  deleteQuietly,
  isConflict,
  isUnauthorized,
  requireAuth,
  throwOnError,
  unwrap,
  upsertRow,
  withKeyLock,
} from './bandsShared';
import { listAll, pageOpts, runPool } from './paginate';

const CLEANUP_DELETES_AT_ONCE = 6;

/**
 * Raw (unvalidated) label rows for a band; pass them to `resolveColorLabels` (via
 * `assembleSetListView`). Labels are cosmetic: if they can't be read, the page shows the colors
 * without names (flagged incomplete) rather than failing.
 */
export async function fetchColorLabelRows(bandId: string): Promise<ListAllResult<ColorLabelRecord>> {
  await requireAuth();
  return listColorLabels(bandId).catch((e): ListAllResult<ColorLabelRecord> => {
    console.warn('Could not load color labels', e);
    return { items: [], incomplete: true };
  });
}

/**
 * Sets the caller's label for one color in a band (`''` clears it). Each member has their own row,
 * keyed (band, color, member), and the band shows the newest valid one (see `resolveColorLabels`), so
 * any member can rename a color and bans still apply. `exists` is whether the caller already has a
 * row for this color (it only picks the first attempt); serialised per band color.
 */
export function setColorLabel(bandId: string, color: SongColorKey, labelInput: string, exists: boolean): Promise<void> {
  return withKeyLock(`color-label:${bandId}:${color}`, async () => {
    await requireAuth();
    const label = sanitizeColorLabel(labelInput);
    const owner = await getCurrentUserSub();
    const key = { bandId, color, owner };
    const create = async (): Promise<boolean> =>
      (await createIdempotent(() => client.models.ColorLabel.create({ ...key, label }), 'createColorLabel')) === 'created';
    const update = async (): Promise<boolean> => {
      const res = await client.models.ColorLabel.update({ ...key, label });
      if (!res.errors?.length) return true;
      if (isConflict(res.errors) || isUnauthorized(res.errors)) return false;
      throwOnError(res, 'updateColorLabel');
      return false;
    };
    await upsertRow({ create, update }, exists, 'Could not save the color label. Please try again.');
  });
}

/** Best-effort delete of the caller's own label rows in a band (cleanup after leaving it). */
export async function deleteMyLabelRows(bandId: string, owner: string): Promise<void> {
  await requireAuth();
  const rows = await listAll(async (token) => {
    const res = await client.models.ColorLabel.listColorLabelByBand({ bandId, owner: { eq: owner } }, pageOpts(token));
    return { items: unwrap(res, 'listMyLabels'), nextToken: res.nextToken };
  });
  await runPool(CLEANUP_DELETES_AT_ONCE, rows.items, (row) =>
    deleteQuietly(() => client.models.ColorLabel.delete({ bandId, color: row.color, owner }), 'deleteColorLabel'),
  );
}
