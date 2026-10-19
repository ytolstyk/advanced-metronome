import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { VOTE_INDEX_LAG_GRACE_MS, type SetListView, type SongColorKey, type ValidSetList, type ValidSong } from '../bandTypes';

vi.mock('../api/songColorsApi', () => ({ setSongColor: vi.fn() }));

import { setSongColor } from '../api/songColorsApi';
import { useSongColors } from './useSongColors';

const song = { id: 's1', bandId: 'band-1', setListId: 'sl-1' } as unknown as ValidSong;
const other = { id: 's2', bandId: 'band-1', setListId: 'sl-1' } as unknown as ValidSong;

function makeList(colors: Array<[string, SongColorKey]> = [], mine: string[] = []): SetListView {
  return {
    setList: {} as ValidSetList,
    shared: false,
    songs: [song, other],
    tallies: new Map(),
    colors: new Map(colors),
    myColorSongIds: new Set(mine),
    colorLabels: new Map(),
    myLabelColors: new Set(),
    myVotes: new Map(),
    hiddenSongs: [],
    incomplete: false,
  };
}

const NOW = 1_000_000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

describe('useSongColors', () => {
  it('reads the server color when nothing is pending', () => {
    const { result } = renderHook(() => useSongColors(makeList([['s1', 'red']]), NOW));
    expect(result.current.colorFor('s1')).toBe('red');
    expect(result.current.colorFor('s2')).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it('shows the picked color at once, while the write is in flight, and keeps it after it settles', async () => {
    let finish!: () => void;
    vi.mocked(setSongColor).mockImplementation(() => new Promise<void>((r) => { finish = r; }));
    const { result } = renderHook(() => useSongColors(makeList(), NOW));

    let pending!: Promise<void>;
    act(() => { pending = result.current.setColor(song, 'blue'); });
    expect(result.current.colorFor('s1')).toBe('blue');

    await act(async () => { finish(); await pending; });
    expect(result.current.colorFor('s1')).toBe('blue');
    expect(result.current.error).toBeNull();
  });

  it('writes with the song and tells the API whether the caller already has a row of their own', async () => {
    vi.mocked(setSongColor).mockResolvedValue(undefined);
    const { result } = renderHook(() => useSongColors(makeList([['s1', 'red']], ['s1']), NOW));
    await act(async () => { await result.current.setColor(song, 'green'); });
    await act(async () => { await result.current.setColor(other, 'pink'); });
    expect(vi.mocked(setSongColor).mock.calls[0]).toEqual([song, 'green', true]);
    expect(vi.mocked(setSongColor).mock.calls[1]).toEqual([other, 'pink', false]);
  });

  describe('exists (does the caller already have a row for the song)', () => {
    it('is false when someone else colored the song but the caller has no row of their own', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      const { result } = renderHook(() => useSongColors(makeList([['s1', 'red']], []), NOW));
      await act(async () => { await result.current.setColor(song, 'green'); });
      expect(vi.mocked(setSongColor).mock.calls[0]).toEqual([song, 'green', false]);
    });

    it('is true when the loaded view has my row, even a cleared one with no visible color', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      const { result } = renderHook(() => useSongColors(makeList([], ['s1']), NOW));
      await act(async () => { await result.current.setColor(song, 'green'); });
      expect(vi.mocked(setSongColor).mock.calls[0]).toEqual([song, 'green', true]);
    });

    it('is true for the second pick after a first successful write, even if the view never refetched', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      const { result } = renderHook(() => useSongColors(makeList(), NOW));
      await act(async () => { await result.current.setColor(song, 'red'); });
      await act(async () => { await result.current.setColor(song, 'blue'); });
      expect(vi.mocked(setSongColor).mock.calls[0]).toEqual([song, 'red', false]);
      expect(vi.mocked(setSongColor).mock.calls[1]).toEqual([song, 'blue', true]);
    });

    it('stays true after the grace period ends and the view still lags without my row', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      const { result, rerender } = renderHook(({ at }) => useSongColors(makeList(), at), { initialProps: { at: NOW } });
      await act(async () => { await result.current.setColor(song, 'red'); });
      rerender({ at: NOW + VOTE_INDEX_LAG_GRACE_MS + 1 });
      await act(async () => { await result.current.setColor(song, 'blue'); });
      expect(vi.mocked(setSongColor).mock.calls[1]).toEqual([song, 'blue', true]);
    });

    it('is true while the first write is still in flight (the next pick queues behind it)', async () => {
      let finish!: () => void;
      vi.mocked(setSongColor)
        .mockImplementationOnce(() => new Promise<void>((r) => { finish = r; }))
        .mockResolvedValue(undefined);
      const { result } = renderHook(() => useSongColors(makeList(), NOW));
      let p1!: Promise<void>;
      act(() => { p1 = result.current.setColor(song, 'red'); });
      await act(async () => { await result.current.setColor(song, 'blue'); });
      expect(vi.mocked(setSongColor).mock.calls[1]).toEqual([song, 'blue', true]);
      await act(async () => { finish(); await p1; });
    });

    it('stays false after a failed first write (no row was created)', async () => {
      vi.mocked(setSongColor).mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useSongColors(makeList(), NOW));
      await act(async () => { await result.current.setColor(song, 'red'); });
      await act(async () => { await result.current.setColor(song, 'blue'); });
      expect(vi.mocked(setSongColor).mock.calls[1]).toEqual([song, 'blue', false]);
    });

    it('stays true after a failed later write when the first one succeeded', async () => {
      vi.mocked(setSongColor).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useSongColors(makeList(), NOW));
      await act(async () => { await result.current.setColor(song, 'red'); });
      await act(async () => { await result.current.setColor(song, 'blue'); });
      await act(async () => { await result.current.setColor(song, 'green'); });
      expect(vi.mocked(setSongColor).mock.calls[2]).toEqual([song, 'green', true]);
    });

    it('is tracked per song', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      const { result } = renderHook(() => useSongColors(makeList(), NOW));
      await act(async () => { await result.current.setColor(song, 'red'); });
      await act(async () => { await result.current.setColor(other, 'blue'); });
      expect(vi.mocked(setSongColor).mock.calls[1]).toEqual([other, 'blue', false]);
    });
  });

  it('clearing hides the server color immediately and passes null to the API', async () => {
    vi.mocked(setSongColor).mockResolvedValue(undefined);
    const { result } = renderHook(() => useSongColors(makeList([['s1', 'red']], ['s1']), NOW));
    await act(async () => { await result.current.setColor(song, null); });
    expect(result.current.colorFor('s1')).toBeUndefined();
    expect(vi.mocked(setSongColor).mock.calls[0]).toEqual([song, null, true]);
  });

  it('a pending color on one song does not affect another', async () => {
    vi.mocked(setSongColor).mockResolvedValue(undefined);
    const { result } = renderHook(() => useSongColors(makeList([['s2', 'teal']]), NOW));
    await act(async () => { await result.current.setColor(song, 'red'); });
    expect(result.current.colorFor('s1')).toBe('red');
    expect(result.current.colorFor('s2')).toBe('teal');
  });

  describe('grace period', () => {
    it('keeps trusting a settled color while the data was fetched before the grace period ended', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      const { result, rerender } = renderHook(({ list, at }) => useSongColors(list, at), {
        initialProps: { list: makeList(), at: NOW },
      });
      await act(async () => { await result.current.setColor(song, 'red'); });
      // a refetch that started within the grace window still shows the lagging (empty) server state
      rerender({ list: makeList(), at: NOW + VOTE_INDEX_LAG_GRACE_MS });
      expect(result.current.colorFor('s1')).toBe('red');
    });

    it('prefers the server once the data was fetched after the grace period', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      const { result, rerender } = renderHook(({ list, at }) => useSongColors(list, at), {
        initialProps: { list: makeList(), at: NOW },
      });
      await act(async () => { await result.current.setColor(song, 'red'); });
      rerender({ list: makeList([['s1', 'blue']]), at: NOW + VOTE_INDEX_LAG_GRACE_MS + 1 });
      expect(result.current.colorFor('s1')).toBe('blue');
    });

    it('a settled clear falls back to the server color after the grace period', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      const { result, rerender } = renderHook(({ list, at }) => useSongColors(list, at), {
        initialProps: { list: makeList([['s1', 'red']], ['s1']), at: NOW },
      });
      await act(async () => { await result.current.setColor(song, null); });
      expect(result.current.colorFor('s1')).toBeUndefined();
      rerender({ list: makeList([['s1', 'red']]), at: NOW + VOTE_INDEX_LAG_GRACE_MS + 1 });
      expect(result.current.colorFor('s1')).toBe('red');
    });

    it('an in-flight write is trusted over any fetch, however late', () => {
      vi.mocked(setSongColor).mockImplementation(() => new Promise<void>(() => {}));
      const { result } = renderHook(() => useSongColors(makeList([['s1', 'red']]), NOW + 10 * VOTE_INDEX_LAG_GRACE_MS));
      act(() => { void result.current.setColor(song, 'blue'); });
      expect(result.current.colorFor('s1')).toBe('blue');
    });
  });

  describe('failure', () => {
    it('rolls back to the server color and reports the error', async () => {
      vi.mocked(setSongColor).mockRejectedValue(new Error('Could not save the song color. Please try again.'));
      const { result } = renderHook(() => useSongColors(makeList([['s1', 'red']]), NOW));
      await act(async () => { await result.current.setColor(song, 'blue'); });
      expect(result.current.colorFor('s1')).toBe('red');
      expect(result.current.error).toBe('Could not save the song color. Please try again.');
    });

    it('a failed first color reverts to no color', async () => {
      vi.mocked(setSongColor).mockRejectedValue(new Error('nope'));
      const { result } = renderHook(() => useSongColors(makeList(), NOW));
      await act(async () => { await result.current.setColor(song, 'blue'); });
      expect(result.current.colorFor('s1')).toBeUndefined();
    });

    it('a failed clear brings the color back', async () => {
      vi.mocked(setSongColor).mockRejectedValue(new Error('nope'));
      const { result } = renderHook(() => useSongColors(makeList([['s1', 'red']]), NOW));
      await act(async () => { await result.current.setColor(song, null); });
      expect(result.current.colorFor('s1')).toBe('red');
    });

    it('restores the PREVIOUS pending color, not the stale server state', async () => {
      vi.mocked(setSongColor).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('network'));
      const { result } = renderHook(() => useSongColors(makeList(), NOW));
      await act(async () => { await result.current.setColor(song, 'red'); });
      expect(result.current.colorFor('s1')).toBe('red');
      await act(async () => { await result.current.setColor(song, 'blue'); }); // fails
      expect(result.current.colorFor('s1')).toBe('red');
      expect(result.current.error).toBe('network');
    });

    it('only rolls back the failing song; another song\'s pending color survives', async () => {
      vi.mocked(setSongColor).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'));
      const { result } = renderHook(() => useSongColors(makeList(), NOW));
      await act(async () => { await result.current.setColor(song, 'red'); });
      await act(async () => { await result.current.setColor(other, 'blue'); }); // fails
      expect(result.current.colorFor('s1')).toBe('red');
      expect(result.current.colorFor('s2')).toBeUndefined();
    });

    it('uses a generic message when a non-Error is thrown', async () => {
      vi.mocked(setSongColor).mockRejectedValue('weird');
      const { result } = renderHook(() => useSongColors(makeList(), NOW));
      await act(async () => { await result.current.setColor(song, 'red'); });
      expect(result.current.error).toBe('Could not save the song color');
    });

    it('clears the previous error when a new pick starts', async () => {
      vi.mocked(setSongColor).mockRejectedValueOnce(new Error('first failed')).mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useSongColors(makeList(), NOW));
      await act(async () => { await result.current.setColor(song, 'red'); });
      expect(result.current.error).toBe('first failed');
      await act(async () => { await result.current.setColor(song, 'blue'); });
      expect(result.current.error).toBeNull();
      expect(result.current.colorFor('s1')).toBe('blue');
    });
  });

  describe('overlapping picks on one song', () => {
    it('pick 1 failing while pick 2 is in flight keeps pick 2\'s color and still reports the error', async () => {
      const writes: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
      vi.mocked(setSongColor).mockImplementation(
        () => new Promise<void>((resolve, reject) => { writes.push({ resolve, reject }); }),
      );
      const { result } = renderHook(() => useSongColors(makeList([['s1', 'teal']], ['s1']), NOW));
      let p1!: Promise<void>;
      let p2!: Promise<void>;
      act(() => { p1 = result.current.setColor(song, 'red'); });
      act(() => { p2 = result.current.setColor(song, 'blue'); });
      expect(result.current.colorFor('s1')).toBe('blue');

      await act(async () => { writes[0].reject(new Error('first failed')); await p1; });
      expect(result.current.colorFor('s1')).toBe('blue');
      expect(result.current.error).toBe('first failed');

      await act(async () => { writes[1].resolve(); await p2; });
      expect(result.current.colorFor('s1')).toBe('blue');
    });

    it('pick 1 settling after pick 2 started does not overwrite pick 2', async () => {
      const writes: Array<() => void> = [];
      vi.mocked(setSongColor).mockImplementation(() => new Promise<void>((r) => { writes.push(r); }));
      const { result } = renderHook(() => useSongColors(makeList(), NOW));
      let p1!: Promise<void>;
      let p2!: Promise<void>;
      act(() => { p1 = result.current.setColor(song, 'red'); });
      act(() => { p2 = result.current.setColor(song, 'blue'); });

      await act(async () => { writes[0](); await p1; });
      expect(result.current.colorFor('s1')).toBe('blue');

      await act(async () => { writes[1](); await p2; });
      expect(result.current.colorFor('s1')).toBe('blue');
    });

    it('pick 2 failing while pick 1 is in flight shows pick 1 again', async () => {
      const writes: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
      vi.mocked(setSongColor).mockImplementation(
        () => new Promise<void>((resolve, reject) => { writes.push({ resolve, reject }); }),
      );
      const { result } = renderHook(() => useSongColors(makeList(), NOW));
      let p1!: Promise<void>;
      let p2!: Promise<void>;
      act(() => { p1 = result.current.setColor(song, 'red'); });
      act(() => { p2 = result.current.setColor(song, 'blue'); });
      await act(async () => { writes[1].reject(new Error('second failed')); await p2; });
      expect(result.current.colorFor('s1')).toBe('red');
      await act(async () => { writes[0].resolve(); await p1; });
      expect(result.current.colorFor('s1')).toBe('red');
    });
  });

  it('rapid picks: each is shown optimistically and the last one wins', async () => {
    const finishers: Array<() => void> = [];
    vi.mocked(setSongColor).mockImplementation(() => new Promise<void>((r) => { finishers.push(r); }));
    const { result } = renderHook(() => useSongColors(makeList(), NOW));
    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => { p1 = result.current.setColor(song, 'red'); });
    act(() => { p2 = result.current.setColor(song, 'blue'); });
    expect(result.current.colorFor('s1')).toBe('blue');
    await act(async () => { finishers.forEach((f) => f()); await Promise.all([p1, p2]); });
    expect(result.current.colorFor('s1')).toBe('blue');
  });
});
