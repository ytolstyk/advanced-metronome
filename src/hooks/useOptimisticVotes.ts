import { useCallback, useEffect, useRef, useState } from 'react';
import { castVote } from '../api/songVotesApi';
import type { PendingVote, SetListView, SongRecord, SongTally, VoteValue } from '../bandTypes';
import { adjustTally, EMPTY_TALLY, resolveMyVote } from '../bandUtils';
import { errorMessage } from '../lib/errors';

/**
 * Optimistic voting on top of a loaded set list. A click shows its effect immediately; the pending
 * choice is trusted while the request is in flight and for a short grace period after (the vote
 * index can lag a refetch), then the server's answer wins. A failed request puts back whatever was
 * pending before it, so an earlier successful vote is never forgotten.
 *
 * `fetchedAt` is when the loaded list's fetch STARTED (see `resolveMyVote`).
 */
export function useOptimisticVotes(list: SetListView, fetchedAt: number) {
  const [pending, setPending] = useState<Record<string, PendingVote>>({});
  const [voting, setVoting] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const resolve = useCallback(
    (songId: string, from: Record<string, PendingVote>) =>
      resolveMyVote(from[songId], fetchedAt, list.myVotes.get(songId)),
    [fetchedAt, list.myVotes],
  );

  const myVoteFor = (songId: string): VoteValue | undefined => resolve(songId, pending).mine;

  const tallyFor = (songId: string): SongTally =>
    adjustTally(
      list.tallies.get(songId) ?? EMPTY_TALLY,
      list.myVotes.get(songId),
      resolve(songId, pending).pending,
    );

  const isVoting = (songId: string): boolean => voting.has(songId);

  const vote = useCallback(
    async (song: Pick<SongRecord, 'id' | 'bandId' | 'setListId'>, value: VoteValue) => {
      const before = pendingRef.current[song.id];
      const current = resolve(song.id, pendingRef.current).mine;
      const next = current === value ? null : value; // clicking the active arrow retracts

      setError(null);
      setVoting((prev) => new Set(prev).add(song.id));
      setPending((prev) => ({ ...prev, [song.id]: { value: next, settledAt: null } }));
      try {
        await castVote(song, next, current);
        setPending((prev) => ({ ...prev, [song.id]: { value: next, settledAt: Date.now() } }));
      } catch (e) {
        setPending((prev) => {
          const copy = { ...prev };
          if (before) copy[song.id] = before;
          else delete copy[song.id];
          return copy;
        });
        setError(errorMessage(e, 'Could not save your vote'));
      } finally {
        setVoting((prev) => {
          const copy = new Set(prev);
          copy.delete(song.id);
          return copy;
        });
      }
    },
    [resolve],
  );

  return { myVoteFor, tallyFor, isVoting, vote, error, clearError: () => setError(null) };
}
