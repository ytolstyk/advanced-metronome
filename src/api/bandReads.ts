import {
  BAND_LIMITS,
  LIST_PAGE_SIZE,
  PUBLIC_READ_PAGES,
  SONG_COLOR_KEYS,
  type ColorLabelRecord,
  type ListAllResult,
  type ReadAuthMode,
  type SetListRows,
  type SongColorRecord,
  type SongRecord,
  type VoteRecord,
} from '../bandTypes';
import { bandsClient as client, toColorLabel, toSong, toSongColor, toVote, unwrap } from './bandsShared';
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
