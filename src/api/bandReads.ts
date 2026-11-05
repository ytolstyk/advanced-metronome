import { BACKING_TRACK_LIMITS } from '../backingTrackFormat';
import {
  BAND_LIMITS,
  LIST_PAGE_SIZE,
  PUBLIC_READ_PAGES,
  SONG_COLOR_KEYS,
  type BackingTrackRecord,
  type ColorLabelRecord,
  type ListAllResult,
  type ReadAuthMode,
  type SetListRows,
  type SongColorRecord,
  type SongRecord,
  type SongTrackMetaRecord,
  type VoteRecord,
} from '../bandTypes';
import {
  bandsClient as client,
  SONG_TRACK_INDEX_FIELDS,
  toBackingTrack,
  toColorLabel,
  toSong,
  toSongColor,
  toSongTrackMeta,
  toVote,
  unwrap,
} from './bandsShared';
import { listAll, pageOpts } from './paginate';

/**
 * Raw (unvalidated) song and vote queries by set list. Read-only, and the one place those two
 * index queries are written, so the signed-in pages and the public shared page can't drift.
 *
 * `authMode` selects the signed-out guest role and exists for the public page only. The
 * functions here do NOT check sign-in: signed-in callers go through `fetchSetListRows` /
 * `listVotesForSetList`, which do, and the public loader through `fetchPublicSetListRows`.
 */

export async function listSongs(
  setListId: string,
  authMode?: ReadAuthMode,
  maxPages?: number,
): Promise<ListAllResult<SongRecord>> {
  return listAll(async (token) => {
    const res = await client.models.Song.listSongBySetList({ setListId }, pageOpts(token, authMode));
    return { items: unwrap(res, 'listSongs').map(toSong), nextToken: res.nextToken };
  }, maxPages);
}

export async function listVotes(
  setListId: string,
  authMode?: ReadAuthMode,
  maxPages?: number,
): Promise<ListAllResult<VoteRecord>> {
  return listAll(async (token) => {
    const res = await client.models.Vote.listVoteBySetList({ setListId }, pageOpts(token, authMode));
    return { items: unwrap(res, 'listVotes').map(toVote), nextToken: res.nextToken };
  }, maxPages);
}

/** A valid list has at most members x songs color rows; one page more is slack, beyond that is a junk flood. */
const COLOR_READ_PAGES = Math.ceil((BAND_LIMITS.maxMembers * BAND_LIMITS.maxSongsPerSetList) / LIST_PAGE_SIZE) + 1;

/** Raw (unvalidated) color rows by set list; pass them to `resolveSongColors`. Signed in only (no guest read rule). */
export async function listSongColors(setListId: string): Promise<ListAllResult<SongColorRecord>> {
  return listAll(async (token) => {
    const res = await client.models.SongColor.listSongColorBySetList({ setListId }, pageOpts(token));
    return { items: unwrap(res, 'listSongColors').map(toSongColor), nextToken: res.nextToken };
  }, COLOR_READ_PAGES);
}

/** A valid list has at most members x songs track rows (cleared ones included); the index rows are tiny. */
const TRACK_READ_PAGES = Math.ceil((BAND_LIMITS.maxMembers * BAND_LIMITS.maxSongsPerSetList) / LIST_PAGE_SIZE) + 1;

/** Whether this backend has the click track model yet (the frontend can go live a moment before the schema). */
export const hasSongTrackModel = (): boolean =>
  (client.models as { SongClickTrack?: unknown }).SongClickTrack !== undefined;

/**
 * Raw (unvalidated) click track METADATA by set list; pass it to `resolveSongTracks`. The index
 * projects only these fields and omits `bandId`/`track`, so the selection set is explicit: a default
 * one would ask for non-null fields the index doesn't have. Signed in only (no guest read rule).
 * Empty (and complete) when the backend predates the model.
 */
export async function listSongTrackMeta(setListId: string): Promise<ListAllResult<SongTrackMetaRecord>> {
  if (!hasSongTrackModel()) return { items: [], incomplete: false };
  return listAll(async (token) => {
    const res = await client.models.SongClickTrack.listSongClickTrackBySetList(
      { setListId },
      { ...pageOpts(token), selectionSet: [...SONG_TRACK_INDEX_FIELDS] },
    );
    return { items: unwrap(res, 'listSongTrackMeta').map(toSongTrackMeta), nextToken: res.nextToken };
  }, TRACK_READ_PAGES);
}

/** The Lambda caps a band at 100 tracks, so a set list has at most that many; one page more is slack. */
const BACKING_TRACK_READ_PAGES = Math.ceil(BACKING_TRACK_LIMITS.maxPerBand / LIST_PAGE_SIZE) + 1;

/** Whether this backend has the backing-track model and mutations yet (the frontend can go live first). */
export const hasBackingTrackModel = (): boolean =>
  (client.models as { BackingTrack?: unknown }).BackingTrack !== undefined &&
  typeof (client.mutations as { requestBackingTrackUpload?: unknown } | undefined)?.requestBackingTrackUpload === 'function';

/**
 * Raw (unvalidated) backing track rows by set list; pass them to `resolveBackingTracks`. Signed in
 * only (no guest read rule). Empty (and complete) when the backend predates the model.
 */
export async function listBackingTracks(setListId: string): Promise<ListAllResult<BackingTrackRecord>> {
  if (!hasBackingTrackModel()) return { items: [], incomplete: false };
  return listAll(async (token) => {
    const res = await client.models.BackingTrack.listBackingTrackBySetList({ setListId }, pageOpts(token));
    return { items: unwrap(res, 'listBackingTracks').map(toBackingTrack), nextToken: res.nextToken };
  }, BACKING_TRACK_READ_PAGES);
}

/**
 * Whether a song visibly has backing tracks: true / false, or null when it could not be read. One cheap
 * index read (limit 1) so ordinary song deletes need not call the Lambda. The index is eventually
 * consistent: a track committed in the last moment can read as "none".
 */
export async function songHasBackingTracks(songId: string): Promise<boolean | null> {
  try {
    const res = await client.models.BackingTrack.listBackingTrackBySong({ songId }, { limit: 1 });
    if (res.errors?.length) return null;
    return res.data.length > 0;
  } catch {
    return null;
  }
}

/** A valid band has at most members x palette colors label rows; one page more is slack, beyond that is a junk flood. */
const LABEL_READ_PAGES = Math.ceil((BAND_LIMITS.maxMembers * SONG_COLOR_KEYS.length) / LIST_PAGE_SIZE) + 1;

/** Raw (unvalidated) color label rows by band; pass them to `resolveColorLabels`. Signed in only (no guest read rule). */
export async function listColorLabels(bandId: string): Promise<ListAllResult<ColorLabelRecord>> {
  return listAll(async (token) => {
    const res = await client.models.ColorLabel.listColorLabelByBand({ bandId }, pageOpts(token));
    return { items: unwrap(res, 'listColorLabels').map(toColorLabel), nextToken: res.nextToken };
  }, LABEL_READ_PAGES);
}

/**
 * Songs and votes for the PUBLIC shared set list page: readable signed out, with tight page caps (a
 * valid list is tiny; more pages means a junk flood). Only `loadSharedSetList` should call this.
 */
export async function fetchPublicSetListRows(setListId: string, authMode: ReadAuthMode): Promise<SetListRows> {
  const [songs, votes] = await Promise.all([
    listSongs(setListId, authMode, PUBLIC_READ_PAGES.songs),
    listVotes(setListId, authMode, PUBLIC_READ_PAGES.votes),
  ]);
  return { songs, votes };
}
