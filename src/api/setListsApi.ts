import {
  BAND_LIMITS,
  BAND_TEXT,
  type BandRecord,
  type ListAllResult,
  type SongColorRecord,
  type SetListRows,
  type SongRecord,
} from '../bandTypes';
import { parseSongInput, requireName, type RawSongInput } from '../bandUtils';
import { getCurrentUserSub } from './authUtils';
import type { BandView } from '../bandTypes';
import {
  bandsClient as client,
  deleteConfirmed,
  deleteQuietly,
  requireAuth,
  toSong,
  tombstoneSetList,
  unwrap,
  updateBand,
} from './bandsShared';
import { runPool } from './paginate';
import { listSongColors, listSongs } from './bandReads';
import { deleteMyColorRows } from './songColorsApi';
import { deleteVoteRow, listVotesByOwner, listVotesForSetList } from './songVotesApi';

/** Parallelism for leave-band cleanup: a few set lists at a time, a few deletes per list. */
const CLEANUP_LISTS_AT_ONCE = 3;
const CLEANUP_DELETES_AT_ONCE = 6;

/**
 * Raw (unvalidated) songs and votes for a set list. Independent of the band view, so pages fetch
 * both in parallel; pass the result to `assembleSetListView` (never render it directly). Signed in.
 */
export async function fetchSetListRows(setListId: string): Promise<SetListRows> {
  await requireAuth();
  const [songs, votes, colors] = await Promise.all([
    listSongs(setListId),
    listVotesForSetList(setListId),
    // Colors are cosmetic: if they can't be read, show the songs without them (flagged incomplete).
    listSongColors(setListId).catch((e): ListAllResult<SongColorRecord> => {
      console.warn('Could not load song colors', e);
      return { items: [], incomplete: true };
    }),
  ]);
  return { songs, votes, colors };
}

// ── Set lists (owner only; rows are never deleted, only archived) ──────────

/** Row first, then the id into `Band.setListIds` (an orphan row never validates). Starts private. */
export async function createSetList(bandId: string, nameInput: string): Promise<string> {
  await requireAuth();
  const name = requireName(nameInput);
  const id = crypto.randomUUID();
  unwrap(await client.models.SetList.create({ id, bandId, name }), 'createSetList');
  await updateBand(bandId, (band) => {
    if (band.setListIds.includes(id)) return null;
    if (band.setListIds.length >= BAND_LIMITS.maxSetLists) {
      throw new Error(`A band can have at most ${BAND_LIMITS.maxSetLists} set lists`);
    }
    return { setListIds: [...band.setListIds, id] };
  });
  return id;
}

/** Turns public sharing of a set list on or off (one owner-only Band write; idempotent). */
export async function setSetListShared(bandId: string, setListId: string, shared: boolean): Promise<void> {
  await requireAuth();
  await updateBand(bandId, (band) => {
    if (!band.setListIds.includes(setListId)) throw new Error('Set list not found');
    if (band.sharedSetListIds.includes(setListId) === shared) return null;
    return {
      sharedSetListIds: shared
        ? [...band.sharedSetListIds, setListId]
        : band.sharedSetListIds.filter((id) => id !== setListId),
    };
  });
}

export async function renameSetList(setListId: string, nameInput: string): Promise<void> {
  await requireAuth();
  unwrap(await client.models.SetList.update({ id: setListId, name: requireName(nameInput) }), 'renameSetList');
}

/** One Band write moves the id between arrays (never stranded), then the row is tombstoned. */
export async function archiveSetList(bandId: string, setListId: string): Promise<void> {
  await requireAuth();
  await updateBand(bandId, (band) => {
    if (!band.setListIds.includes(setListId)) return null;
    if (band.archivedSetListIds.length >= BAND_LIMITS.maxArchivedSetLists) {
      throw new Error('Archive limit reached; rename this set list instead');
    }
    return {
      setListIds: band.setListIds.filter((id) => id !== setListId),
      archivedSetListIds: [...band.archivedSetListIds, setListId],
      sharedSetListIds: band.sharedSetListIds.filter((id) => id !== setListId), // archived = no longer public
    };
  });
  await tombstoneSetList(setListId, BAND_TEXT.archivedSetListName);
}

// ── Songs ──────────────────────────────────────────────────────────────────

/** Suggests a song straight onto the set list (the cap is client-side only; races are tolerated). */
export async function suggestSong(
  view: BandView,
  setListId: string,
  raw: RawSongInput,
  currentSongCount: number,
): Promise<SongRecord> {
  await requireAuth();
  if (!view.isMember) throw new Error('Join the band to suggest songs');
  if (!view.setLists.some((s) => s.id === setListId)) throw new Error('Set list not found');
  if (currentSongCount >= BAND_LIMITS.maxSongsPerSetList) {
    throw new Error(`This set list is full (${BAND_LIMITS.maxSongsPerSetList} songs)`);
  }
  const parsed = parseSongInput(raw);
  if ('error' in parsed) throw new Error(parsed.error);
  const created = unwrap(
    await client.models.Song.create({ bandId: view.band.id, setListId, ...parsed.value }),
    'createSong',
  );
  return toSong(created);
}

export async function updateSong(songId: string, raw: RawSongInput): Promise<void> {
  await requireAuth();
  const parsed = parseSongInput(raw);
  if ('error' in parsed) throw new Error(parsed.error);
  unwrap(await client.models.Song.update({ id: songId, ...parsed.value }), 'updateSong');
}

/** Deletes the caller's own song. An already-deleted song reads as Unauthorized, so that is only success once re-read shows it gone. */
export async function deleteSong(songId: string): Promise<void> {
  await requireAuth();
  await deleteConfirmed(
    () => client.models.Song.delete({ id: songId }),
    async () => {
      const res = await client.models.Song.get({ id: songId });
      return !res.errors?.length && !res.data;
    },
    'deleteSong',
  );
}

/**
 * "Delete my data" for a band: the caller's own votes (exact owner sort-key query) and, if asked,
 * songs, across active + archived set lists. Bounded parallelism; every row is attempted and the
 * first failure is rethrown at the end so the caller can say something may remain.
 */
export async function deleteMyContent(band: BandRecord, includeSongs: boolean): Promise<void> {
  await requireAuth();
  const owner = await getCurrentUserSub();
  // A hostile owner can write unbounded id arrays; only the capped prefix is ever processed.
  const setListIds = [
    ...new Set([
      ...band.setListIds.slice(0, BAND_LIMITS.maxSetLists),
      ...band.archivedSetListIds.slice(0, BAND_LIMITS.maxArchivedSetLists),
    ]),
  ];
  await runPool(CLEANUP_LISTS_AT_ONCE, setListIds, async (setListId) => {
    const votes = await listVotesByOwner(setListId, owner);
    await runPool(CLEANUP_DELETES_AT_ONCE, votes.items, (v) => deleteVoteRow(v.songId, owner));
    if (includeSongs) {
      const songs = await listSongs(setListId);
      await runPool(
        CLEANUP_DELETES_AT_ONCE,
        songs.items.filter((s) => s.owner === owner),
        (s) => deleteQuietly(() => client.models.Song.delete({ id: s.id }), 'deleteSong'),
      );
    }
    // Last, so a failing colors read can't skip the votes and songs above.
    await deleteMyColorRows(setListId, owner);
  });
}
