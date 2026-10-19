import type { ListAllResult, SongRecord, VoteRecord, VoteValue } from '../bandTypes';
import { getCurrentUserSub } from './authUtils';
import { listVotes } from './bandReads';
import {
  bandsClient as client,
  createIdempotent,
  deleteConfirmed,
  deleteQuietly,
  isConflict,
  isUnauthorized,
  requireAuth,
  throwOnError,
  toVote,
  unwrap,
  upsertRow,
  withKeyLock,
} from './bandsShared';
import { listAll, pageOpts } from './paginate';

/** All vote rows for a set list (unvalidated: pass through `filterCountedVotes` before showing). Signed in. */
export async function listVotesForSetList(setListId: string): Promise<ListAllResult<VoteRecord>> {
  await requireAuth();
  return listVotes(setListId);
}

/** One voter's rows in a set list via the exact owner sort-key query (no flood to page through). */
export async function listVotesByOwner(setListId: string, owner: string): Promise<ListAllResult<VoteRecord>> {
  await requireAuth();
  return listAll(async (token) => {
    const res = await client.models.Vote.listVoteBySetList({ setListId, owner: { eq: owner } }, pageOpts(token));
    return { items: unwrap(res, 'listMyVotes').map(toVote), nextToken: res.nextToken };
  });
}

/** Best-effort delete of one of the caller's own vote rows (cleanup after leaving a band). */
export async function deleteVoteRow(songId: string, owner: string): Promise<void> {
  await requireAuth();
  return deleteQuietly(() => client.models.Vote.delete({ songId, owner }), 'deleteVote');
}

/**
 * Sets the caller's vote on a song: `value` null retracts. One row per (song, voter) is guaranteed
 * by the table key, so "vote" is an upsert (`upsertRow`). `current` is the vote the UI believes
 * exists. Serialised per song so rapid clicks can't interleave.
 */
export function castVote(
  song: Pick<SongRecord, 'id' | 'bandId' | 'setListId'>,
  value: VoteValue | null,
  current: VoteValue | undefined,
): Promise<void> {
  return withKeyLock(`vote:${song.id}`, async () => {
    await requireAuth();
    const owner = await getCurrentUserSub();
    const key = { songId: song.id, owner };

    if (value === null) {
      await deleteConfirmed(
        () => client.models.Vote.delete(key),
        async () => {
          const res = await client.models.Vote.get(key);
          return !res.errors?.length && !res.data;
        },
        'deleteVote',
      );
      return;
    }

    /** true = the vote now has the wanted value. */
    const create = async (): Promise<boolean> =>
      (await createIdempotent(
        () => client.models.Vote.create({ ...key, value, bandId: song.bandId, setListId: song.setListId }),
        'createVote',
      )) === 'created';
    const update = async (): Promise<boolean> => {
      const res = await client.models.Vote.update({ ...key, value });
      if (!res.errors?.length) return true;
      // A missing row surfaces as a failed condition or Unauthorized; anything else is real.
      if (isConflict(res.errors) || isUnauthorized(res.errors)) return false;
      throwOnError(res, 'updateVote');
      return false;
    };

    await upsertRow({ create, update }, current !== undefined, 'Could not save your vote. Please try again.');
  });
}
