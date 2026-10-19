import { NO_SONG_COLOR, type SongColorKey, type SongRecord } from '../bandTypes';
import { getCurrentUserSub } from './authUtils';
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
 * Sets the caller's color for a song (`null` clears it). Each member has their own row, keyed
 * (song, member), and the song shows the newest valid one (see `resolveSongColors`), so any member
 * can recolor and bans still apply. Rows are never deleted: clearing writes `none`. `exists` is
 * whether the caller already has a row (it only picks the first attempt); serialised per song.
 */
export function setSongColor(
  song: Pick<SongRecord, 'id' | 'bandId' | 'setListId'>,
  color: SongColorKey | null,
  exists: boolean,
): Promise<void> {
  return withKeyLock(`song-color:${song.id}`, async () => {
    await requireAuth();
    const owner = await getCurrentUserSub();
    const key = { songId: song.id, owner };
    const fields = { bandId: song.bandId, setListId: song.setListId, color: color ?? NO_SONG_COLOR };
    const create = async (): Promise<boolean> =>
      (await createIdempotent(() => client.models.SongColor.create({ ...key, ...fields }), 'createSongColor')) ===
      'created';
    const update = async (): Promise<boolean> => {
      const res = await client.models.SongColor.update({ ...key, ...fields });
      if (!res.errors?.length) return true;
      if (isConflict(res.errors) || isUnauthorized(res.errors)) return false;
      throwOnError(res, 'updateSongColor');
      return false;
    };
    await upsertRow({ create, update }, exists, 'Could not save the song color. Please try again.');
  });
}

/** Best-effort delete of the caller's own color rows in a set list (cleanup after leaving a band). */
export async function deleteMyColorRows(setListId: string, owner: string): Promise<void> {
  await requireAuth();
  const rows = await listAll(async (token) => {
    const res = await client.models.SongColor.listSongColorBySetList({ setListId, owner: { eq: owner } }, pageOpts(token));
    return { items: unwrap(res, 'listMyColors'), nextToken: res.nextToken };
  });
  await runPool(CLEANUP_DELETES_AT_ONCE, rows.items, (row) =>
    deleteQuietly(() => client.models.SongColor.delete({ songId: row.songId, owner }), 'deleteSongColor'),
  );
}
