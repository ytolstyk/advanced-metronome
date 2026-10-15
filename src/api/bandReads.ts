import {
  PUBLIC_READ_PAGES,
  type ListAllResult,
  type ReadAuthMode,
  type SetListRows,
  type SongRecord,
  type VoteRecord,
} from '../bandTypes';
import { bandsClient as client, toSong, toVote, unwrap } from './bandsShared';
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
