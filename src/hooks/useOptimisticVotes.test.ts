import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SetListView, SongTally, ValidSetList, ValidSong, VoteValue } from '../bandTypes';

vi.mock('../api/songVotesApi', () => ({ castVote: vi.fn() }));

import { castVote } from '../api/songVotesApi';
import { useOptimisticVotes } from './useOptimisticVotes';

const song = { id: 's1', bandId: 'band-1', setListId: 'sl-1' } as unknown as ValidSong;

function makeList(serverVote?: VoteValue, tally: SongTally = { up: serverVote === 'up' ? 1 : 0, down: serverVote === 'down' ? 1 : 0, score: 0 }): SetListView {
  return {
    setList: {} as ValidSetList,
    shared: false,
    songs: [song],
    tallies: new Map([['s1', { ...tally, score: tally.up - tally.down }]]),
    myVotes: new Map(serverVote ? [['s1', serverVote]] : []),
    colors: new Map(),
    myColorSongIds: new Set(),
    hiddenSongs: [],
    incomplete: false,
  };
}

const settleNow = 1_000_000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(settleNow);
});

describe('useOptimisticVotes', () => {
  it('shows the new vote and tally immediately, then keeps them after the request settles', async () => {
    let finish!: () => void;
    vi.mocked(castVote).mockImplementation(() => new Promise<void>((r) => { finish = r; }));
    const { result } = renderHook(() => useOptimisticVotes(makeList(), settleNow));

    let pending!: Promise<void>;
    act(() => { pending = result.current.vote(song, 'up'); });
    expect(result.current.myVoteFor('s1')).toBe('up');
    expect(result.current.tallyFor('s1')).toEqual({ up: 1, down: 0, score: 1 });
    expect(result.current.isVoting('s1')).toBe(true);

    await act(async () => { finish(); await pending; });
    expect(result.current.isVoting('s1')).toBe(false);
    expect(result.current.myVoteFor('s1')).toBe('up');
    expect(castVote).toHaveBeenCalledWith(song, 'up', undefined);
  });

  it('clicking the active arrow retracts; the other arrow switches (passing the previous vote)', async () => {
    vi.mocked(castVote).mockResolvedValue(undefined);
    const { result } = renderHook(() => useOptimisticVotes(makeList('up'), settleNow));
    await act(async () => { await result.current.vote(song, 'up'); });
    expect(vi.mocked(castVote).mock.calls[0].slice(1)).toEqual([null, 'up']);
    expect(result.current.myVoteFor('s1')).toBeUndefined();
    expect(result.current.tallyFor('s1')).toEqual({ up: 0, down: 0, score: 0 });

    await act(async () => { await result.current.vote(song, 'down'); });
    expect(vi.mocked(castVote).mock.calls[1].slice(1)).toEqual(['down', undefined]);
    expect(result.current.myVoteFor('s1')).toBe('down');
  });

  it('a failed first vote reverts to the server state and reports the error', async () => {
    vi.mocked(castVote).mockRejectedValue(new Error('Could not save your vote'));
    const { result } = renderHook(() => useOptimisticVotes(makeList(), settleNow));
    await act(async () => { await result.current.vote(song, 'up'); });
    expect(result.current.myVoteFor('s1')).toBeUndefined();
    expect(result.current.tallyFor('s1')).toEqual({ up: 0, down: 0, score: 0 });
    expect(result.current.error).toBe('Could not save your vote');
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('a failed vote restores the PREVIOUS pending vote, not the stale server state', async () => {
    // Server still says nothing (index lag); the user's earlier "up" succeeded moments ago.
    vi.mocked(castVote).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useOptimisticVotes(makeList(undefined), settleNow));
    await act(async () => { await result.current.vote(song, 'up'); });
    expect(result.current.myVoteFor('s1')).toBe('up');

    await act(async () => { await result.current.vote(song, 'down'); }); // fails
    expect(result.current.myVoteFor('s1')).toBe('up'); // still what the user last successfully set
    expect(result.current.tallyFor('s1')).toEqual({ up: 1, down: 0, score: 1 });
    expect(result.current.error).toBe('network');
  });

  it('prefers the server once the data was fetched after the grace period', async () => {
    vi.mocked(castVote).mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ list, at }) => useOptimisticVotes(list, at), {
      initialProps: { list: makeList(), at: settleNow },
    });
    await act(async () => { await result.current.vote(song, 'up'); });
    expect(result.current.myVoteFor('s1')).toBe('up');

    rerender({ list: makeList('down'), at: settleNow + 10_000 }); // a later fetch that says "down"
    expect(result.current.myVoteFor('s1')).toBe('down');
    expect(result.current.tallyFor('s1')).toEqual({ up: 0, down: 1, score: -1 });
  });

  it('votes on different songs do not block each other', async () => {
    vi.mocked(castVote).mockImplementation(() => new Promise<void>(() => {}));
    const other = { id: 's2', bandId: 'band-1', setListId: 'sl-1' } as unknown as ValidSong;
    const { result } = renderHook(() => useOptimisticVotes(makeList(), settleNow));
    act(() => { void result.current.vote(song, 'up'); });
    expect(result.current.isVoting('s1')).toBe(true);
    expect(result.current.isVoting(other.id)).toBe(false);
  });
});
