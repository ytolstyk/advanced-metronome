import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SONG_COLOR_KEYS, VOTE_INDEX_LAG_GRACE_MS, type SetListView, type SongColorKey, type ValidSetList } from '../bandTypes';

vi.mock('../api/colorLabelsApi', () => ({ setColorLabel: vi.fn() }));

import { setColorLabel } from '../api/colorLabelsApi';
import { useColorLabels } from './useColorLabels';

function makeList(labels: Array<[SongColorKey, string]> = [], mine: SongColorKey[] = []): SetListView {
  return {
    setList: {} as ValidSetList,
    shared: false,
    songs: [],
    tallies: new Map(),
    colors: new Map(),
    myColorSongIds: new Set(),
    colorLabels: new Map(labels),
    myLabelColors: new Set(mine),
    myVotes: new Map(),
    hiddenSongs: [],
    incomplete: false,
  };
}

const NOW = 1_000_000;
const BAND = 'band-1';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setColorLabel).mockReset();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

describe('useColorLabels', () => {
  describe('labels', () => {
    it('exposes the server labels, leaving unlabeled colors absent', () => {
      const { result } = renderHook(() => useColorLabels(BAND, makeList([['red', 'Ballad'], ['blue', 'Thrash']]), NOW));
      expect(result.current.labels).toEqual(new Map([['red', 'Ballad'], ['blue', 'Thrash']]));
      expect(result.current.labels.has('green')).toBe(false);
    });

    it('is empty when the band named nothing', () => {
      const { result } = renderHook(() => useColorLabels(BAND, makeList(), NOW));
      expect(result.current.labels.size).toBe(0);
    });

    it('only ever contains palette colors', () => {
      const { result } = renderHook(() => useColorLabels(BAND, makeList([['red', 'x']]), NOW));
      for (const key of result.current.labels.keys()) expect(SONG_COLOR_KEYS).toContain(key);
    });
  });

  describe('saveLabels', () => {
    it('shows a new label at once, while the write is in flight, and keeps it after it settles', async () => {
      let finish!: () => void;
      vi.mocked(setColorLabel).mockImplementation(() => new Promise<void>((r) => { finish = r; }));
      const { result } = renderHook(() => useColorLabels(BAND, makeList(), NOW));

      let pending!: Promise<void>;
      act(() => { pending = result.current.saveLabels({ red: 'Ballad' }); });
      expect(result.current.labels.get('red')).toBe('Ballad');

      await act(async () => { finish(); await pending; });
      expect(result.current.labels.get('red')).toBe('Ballad');
    });

    it('writes with the band, the color and the sanitised label', async () => {
      vi.mocked(setColorLabel).mockResolvedValue(undefined);
      const { result } = renderHook(() => useColorLabels(BAND, makeList(), NOW));
      await act(async () => { await result.current.saveLabels({ red: '  Fast \t thrash  ' }); });
      expect(vi.mocked(setColorLabel).mock.calls).toEqual([[BAND, 'red', 'Fast thrash', false]]);
    });

    it('clamps an over-long label to 20 characters before writing', async () => {
      vi.mocked(setColorLabel).mockResolvedValue(undefined);
      const { result } = renderHook(() => useColorLabels(BAND, makeList(), NOW));
      await act(async () => { await result.current.saveLabels({ red: 'x'.repeat(50) }); });
      expect(vi.mocked(setColorLabel).mock.calls[0][2]).toBe('x'.repeat(20));
    });

    it('writes only the colors that changed, one call per color', async () => {
      vi.mocked(setColorLabel).mockResolvedValue(undefined);
      const { result } = renderHook(() => useColorLabels(BAND, makeList([['red', 'Ballad']]), NOW));
      await act(async () => { await result.current.saveLabels({ red: 'Ballad', blue: 'Thrash', green: 'Slow' }); });
      const calls = vi.mocked(setColorLabel).mock.calls.map((c) => [c[1], c[2]]);
      expect([...calls].sort()).toEqual([['blue', 'Thrash'], ['green', 'Slow']]);
    });

    it('skips a value that sanitises to the shown label', async () => {
      vi.mocked(setColorLabel).mockResolvedValue(undefined);
      const { result } = renderHook(() => useColorLabels(BAND, makeList([['red', 'Ballad']]), NOW));
      await act(async () => { await result.current.saveLabels({ red: '  Ballad  ' }); });
      expect(setColorLabel).not.toHaveBeenCalled();
    });

    it('does nothing for an empty request', async () => {
      const { result } = renderHook(() => useColorLabels(BAND, makeList([['red', 'Ballad']]), NOW));
      await act(async () => { await result.current.saveLabels({}); });
      expect(setColorLabel).not.toHaveBeenCalled();
    });

    it('does not write "" for a color that has no label and is cleared again', async () => {
      const { result } = renderHook(() => useColorLabels(BAND, makeList(), NOW));
      await act(async () => { await result.current.saveLabels({ red: '   ' }); });
      expect(setColorLabel).not.toHaveBeenCalled();
    });

    describe('colors absent from the request are never touched', () => {
      it('a stale value for an untouched color is NOT written (regression: stale dialog overwrote a rename)', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        // another member renamed blue after the dialog opened; the dialog only edited red
        const { result } = renderHook(() => useColorLabels(BAND, makeList([['blue', 'Renamed by Bob']]), NOW));
        await act(async () => { await result.current.saveLabels({ red: 'Ballad' }); });
        expect(vi.mocked(setColorLabel).mock.calls.map((c) => c[1])).toEqual(['red']);
        expect(result.current.labels.get('blue')).toBe('Renamed by Bob');
      });

      it('an untouched labeled color is not cleared by a request that omits it', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        const { result } = renderHook(() => useColorLabels(BAND, makeList([['red', 'Ballad'], ['blue', 'Thrash']]), NOW));
        await act(async () => { await result.current.saveLabels({ blue: 'Heavy' }); });
        expect(vi.mocked(setColorLabel).mock.calls.map((c) => [c[1], c[2]])).toEqual([['blue', 'Heavy']]);
        expect(result.current.labels.get('red')).toBe('Ballad');
      });

      it('an explicit "" for a shown label clears it (the only way to clear)', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        const { result } = renderHook(() => useColorLabels(BAND, makeList([['red', 'Ballad']], ['red']), NOW));
        await act(async () => { await result.current.saveLabels({ red: '' }); });
        expect(vi.mocked(setColorLabel).mock.calls).toEqual([[BAND, 'red', '', true]]);
        expect(result.current.labels.has('red')).toBe(false);
      });

      it('an explicit undefined value is treated as absent', async () => {
        const { result } = renderHook(() => useColorLabels(BAND, makeList([['red', 'Ballad']]), NOW));
        await act(async () => { await result.current.saveLabels({ red: undefined }); });
        expect(setColorLabel).not.toHaveBeenCalled();
      });
    });

    describe('exists (does the caller already have a row for the color)', () => {
      it('is false when someone else named the color but the caller has no row of their own', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        const { result } = renderHook(() => useColorLabels(BAND, makeList([['red', 'Theirs']], []), NOW));
        await act(async () => { await result.current.saveLabels({ red: 'Mine' }); });
        expect(vi.mocked(setColorLabel).mock.calls[0]).toEqual([BAND, 'red', 'Mine', false]);
      });

      it('is true when the loaded view has my row, even an empty one with no visible label', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        const { result } = renderHook(() => useColorLabels(BAND, makeList([], ['red']), NOW));
        await act(async () => { await result.current.saveLabels({ red: 'Ballad' }); });
        expect(vi.mocked(setColorLabel).mock.calls[0]).toEqual([BAND, 'red', 'Ballad', true]);
      });

      it('is true for the second save after a first successful write, even if the view never refetched', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        const { result } = renderHook(() => useColorLabels(BAND, makeList(), NOW));
        await act(async () => { await result.current.saveLabels({ red: 'One' }); });
        await act(async () => { await result.current.saveLabels({ red: 'Two' }); });
        expect(vi.mocked(setColorLabel).mock.calls[0]).toEqual([BAND, 'red', 'One', false]);
        expect(vi.mocked(setColorLabel).mock.calls[1]).toEqual([BAND, 'red', 'Two', true]);
      });

      it('stays false after a failed first write (no row was created)', async () => {
        vi.mocked(setColorLabel).mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce(undefined);
        const { result } = renderHook(() => useColorLabels(BAND, makeList(), NOW));
        await act(async () => { await result.current.saveLabels({ red: 'One' }).catch(() => {}); });
        await act(async () => { await result.current.saveLabels({ red: 'Two' }); });
        expect(vi.mocked(setColorLabel).mock.calls[1]).toEqual([BAND, 'red', 'Two', false]);
      });

      it('is tracked per color', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        const { result } = renderHook(() => useColorLabels(BAND, makeList([], ['red']), NOW));
        await act(async () => { await result.current.saveLabels({ red: 'A', blue: 'B' }); });
        const byColor = Object.fromEntries(vi.mocked(setColorLabel).mock.calls.map((c) => [c[1], c[3]]));
        expect(byColor).toEqual({ red: true, blue: false });
      });
    });

    describe('failure', () => {
      it('rolls the label back to the server one and rejects with the error message', async () => {
        vi.mocked(setColorLabel).mockRejectedValue(new Error('Could not save the color label. Please try again.'));
        const { result } = renderHook(() => useColorLabels(BAND, makeList([['red', 'Ballad']]), NOW));
        let caught: unknown;
        await act(async () => { caught = await result.current.saveLabels({ red: 'Other' }).catch((e: unknown) => e); });
        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toBe('Could not save the color label. Please try again.');
        expect(result.current.labels.get('red')).toBe('Ballad');
      });

      it('a failed first label reverts to no label', async () => {
        vi.mocked(setColorLabel).mockRejectedValue(new Error('nope'));
        const { result } = renderHook(() => useColorLabels(BAND, makeList(), NOW));
        await act(async () => { await result.current.saveLabels({ red: 'x' }).catch(() => {}); });
        expect(result.current.labels.has('red')).toBe(false);
      });

      it('a failed clear brings the label back', async () => {
        vi.mocked(setColorLabel).mockRejectedValue(new Error('nope'));
        const { result } = renderHook(() => useColorLabels(BAND, makeList([['red', 'Ballad']]), NOW));
        await act(async () => { await result.current.saveLabels({ red: '' }).catch(() => {}); });
        expect(result.current.labels.get('red')).toBe('Ballad');
      });

      it('uses a generic message when a non-Error is thrown', async () => {
        vi.mocked(setColorLabel).mockRejectedValue('weird');
        const { result } = renderHook(() => useColorLabels(BAND, makeList(), NOW));
        let caught: unknown;
        await act(async () => { caught = await result.current.saveLabels({ red: 'x' }).catch((e: unknown) => e); });
        expect((caught as Error).message).toBe('Could not save the color labels');
      });

      it('attempts every changed label even if one fails, then rejects once with the first failure (in palette order)', async () => {
        vi.mocked(setColorLabel).mockImplementation(async (_band, color) => {
          if (color === 'blue') throw new Error('blue failed');
          if (color === 'green') throw new Error('green failed');
        });
        const { result } = renderHook(() => useColorLabels(BAND, makeList(), NOW));
        let caught: unknown;
        await act(async () => {
          caught = await result.current.saveLabels({ red: 'A', blue: 'B', green: 'C', teal: 'D' }).catch((e: unknown) => e);
        });
        expect(setColorLabel).toHaveBeenCalledTimes(4);
        // green precedes blue in the palette, so its failure is the first one
        expect((caught as Error).message).toBe('green failed');
        // the successful ones stay, the failed ones are rolled back
        expect(result.current.labels.get('red')).toBe('A');
        expect(result.current.labels.get('teal')).toBe('D');
        expect(result.current.labels.has('blue')).toBe(false);
        expect(result.current.labels.has('green')).toBe(false);
      });

      it('resolves when everything succeeds', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        const { result } = renderHook(() => useColorLabels(BAND, makeList(), NOW));
        await act(async () => {
          await expect(result.current.saveLabels({ red: 'A', blue: 'B' })).resolves.toBeUndefined();
        });
      });
    });
  });

  describe('grace period', () => {
    it('keeps trusting a settled label while the data was fetched before the grace period ended', async () => {
      vi.mocked(setColorLabel).mockResolvedValue(undefined);
      const { result, rerender } = renderHook(({ list, at }) => useColorLabels(BAND, list, at), {
        initialProps: { list: makeList(), at: NOW },
      });
      await act(async () => { await result.current.saveLabels({ red: 'Ballad' }); });
      rerender({ list: makeList(), at: NOW + VOTE_INDEX_LAG_GRACE_MS });
      expect(result.current.labels.get('red')).toBe('Ballad');
    });

    it('prefers the server once the data was fetched after the grace period', async () => {
      vi.mocked(setColorLabel).mockResolvedValue(undefined);
      const { result, rerender } = renderHook(({ list, at }) => useColorLabels(BAND, list, at), {
        initialProps: { list: makeList(), at: NOW },
      });
      await act(async () => { await result.current.saveLabels({ red: 'Ballad' }); });
      rerender({ list: makeList([['red', 'Newer from Bob']]), at: NOW + VOTE_INDEX_LAG_GRACE_MS + 1 });
      expect(result.current.labels.get('red')).toBe('Newer from Bob');
    });

    it('a settled clear falls back to the server label after the grace period', async () => {
      vi.mocked(setColorLabel).mockResolvedValue(undefined);
      const { result, rerender } = renderHook(({ list, at }) => useColorLabels(BAND, list, at), {
        initialProps: { list: makeList([['red', 'Ballad']], ['red']), at: NOW },
      });
      await act(async () => { await result.current.saveLabels({ red: '' }); });
      expect(result.current.labels.has('red')).toBe(false);
      rerender({ list: makeList([['red', 'Ballad']]), at: NOW + VOTE_INDEX_LAG_GRACE_MS + 1 });
      expect(result.current.labels.get('red')).toBe('Ballad');
    });

    it('an in-flight write is trusted over any fetch, however late', () => {
      vi.mocked(setColorLabel).mockImplementation(() => new Promise<void>(() => {}));
      const { result } = renderHook(() => useColorLabels(BAND, makeList([['red', 'Ballad']]), NOW + 10 * VOTE_INDEX_LAG_GRACE_MS));
      act(() => { void result.current.saveLabels({ red: 'Other' }).catch(() => {}); });
      expect(result.current.labels.get('red')).toBe('Other');
    });
  });
});
