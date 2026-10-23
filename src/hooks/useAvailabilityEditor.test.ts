import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';

vi.mock('../api/availabilityApi', () => {
  class AvailabilityBlockedError extends Error {
    reason: string;
    constructor(reason: string) {
      super(`blocked: ${reason}`);
      this.reason = reason;
    }
  }
  return { AvailabilityBlockedError, saveMyAvailability: vi.fn(), deleteMyAvailabilityWithin: vi.fn() };
});

import { AvailabilityBlockedError, deleteMyAvailabilityWithin, saveMyAvailability } from '../api/availabilityApi';
import type { AvailabilityRead, AvailabilityRecord } from '../bandTypes';
import { ME, NOW, NOW_SLOT, band, ok, row } from '../availabilityTestHelpers';
import { decodeMask } from '../availabilitySlots';
import { useAvailabilityEditor } from './useAvailabilityEditor';

const S = NOW_SLOT;
const b = band();
const none: AvailabilityRead = ok(null);
const saved = (free: number[]): AvailabilityRead => ok(row(ME, free));

interface Props {
  ownRead: AvailabilityRead;
  fetchedAt: number;
  disclosureAccepted: boolean;
  nowMs: number;
}
const base: Props = { ownRead: none, fetchedAt: NOW - 60_000, disclosureAccepted: true, nowMs: NOW };
const setup = (over: Partial<Props> = {}) =>
  renderHook((props: Props) => useAvailabilityEditor({ band: b, sub: ME, ...props }), { initialProps: { ...base, ...over } });

const sorted = (set: ReadonlySet<number>) => [...set].sort((x, y) => x - y);
/** A resolved save whose row has the given free slots. */
const savedWith = (free: number[], reset = false) => ({ row: row(ME, free) as AvailabilityRecord, reset });
const edits = (call: number) => [...(vi.mocked(saveMyAvailability).mock.calls[call][1] as Map<number, boolean>)];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // Tests that leave edits unsaved still trigger the unmount flush, which needs something to call.
  vi.mocked(saveMyAvailability).mockReset();
  vi.mocked(saveMyAvailability).mockResolvedValue(savedWith([]));
  vi.mocked(deleteMyAvailabilityWithin).mockReset();
  vi.mocked(deleteMyAvailabilityWithin).mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('what is shown', () => {
  it('is the stored marks with unsaved edits laid over them', () => {
    const { result } = setup({ ownRead: saved([S + 1, S + 2]) });
    expect(sorted(result.current.free)).toEqual([S + 1, S + 2]);
    act(() => result.current.setSlots([S + 3], true));
    act(() => result.current.setSlots([S + 1], false));
    expect(sorted(result.current.free)).toEqual([S + 2, S + 3]);
    expect(result.current.hasUnsavedEdits).toBe(true);
    expect(result.current.status).toBe('dirty');
  });

  it('ignores edits to slots that have already started', () => {
    const { result } = setup();
    act(() => result.current.setSlots([S, S - 3, S + 1], true));
    expect(sorted(result.current.free)).toEqual([S + 1]);
    // Ignored on the way in, so they can't count as unsaved changes either.
    act(() => result.current.setSlots([S, S - 3], true));
    expect(result.current.hasUnsavedEdits).toBe(true); // only S + 1
    expect(sorted(result.current.free)).toEqual([S + 1]);
  });

  it('drops an edit that matches what is stored, so switching a mark on and off sends nothing', async () => {
    const { result } = setup({ ownRead: saved([S + 1]) });
    act(() => result.current.setSlots([S + 1], true)); // already marked
    expect(result.current).toMatchObject({ hasUnsavedEdits: false, status: 'idle' });
    act(() => result.current.setSlots([S + 2], true));
    expect(result.current.hasUnsavedEdits).toBe(true);
    act(() => result.current.setSlots([S + 2], false)); // back to stored
    expect(result.current).toMatchObject({ hasUnsavedEdits: false, status: 'idle' });
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(saveMyAvailability).not.toHaveBeenCalled();
  });

  it('says whether the person has a row, and when it was last saved', () => {
    expect(setup().result.current).toMatchObject({ hasRow: false, lastSaved: null });
    const withRow = setup({ ownRead: saved([S + 1]) }).result.current;
    expect(withRow).toMatchObject({ hasRow: true, lastSaved: '2026-11-02T00:00:00Z' });
  });
});

describe('autosave', () => {
  it('saves what was edited after a pause, then shows it as saved', async () => {
    vi.mocked(saveMyAvailability).mockResolvedValue(savedWith([S + 3]));
    const { result } = setup();
    act(() => result.current.setSlots([S + 3], true));
    expect(saveMyAvailability).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(saveMyAvailability).toHaveBeenCalledTimes(1);
    expect(edits(0)).toEqual([[S + 3, true]]);
    expect(result.current.status).toBe('saved');
    expect(result.current.hasUnsavedEdits).toBe(false);
    expect(result.current.hasRow).toBe(true);
    expect(sorted(result.current.free)).toEqual([S + 3]);
  });

  it('coalesces a burst of edits into one save', async () => {
    vi.mocked(saveMyAvailability).mockResolvedValue(savedWith([S + 1, S + 2, S + 3]));
    const { result } = setup();
    for (const slot of [S + 1, S + 2, S + 3]) {
      act(() => result.current.setSlots([slot], true));
      await act(() => vi.advanceTimersByTimeAsync(300));
    }
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(saveMyAvailability).toHaveBeenCalledTimes(1);
    expect(edits(0).map(([slot]) => slot).sort()).toEqual([S + 1, S + 2, S + 3]);
  });

  it('keeps an edit made while a save is running, and saves it next', async () => {
    let finish!: () => void;
    vi.mocked(saveMyAvailability)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve(savedWith([S + 1]));
          }),
      )
      .mockResolvedValueOnce(savedWith([S + 1, S + 2]));
    const { result } = setup();
    act(() => result.current.setSlots([S + 1], true));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current.status).toBe('saving');
    act(() => result.current.setSlots([S + 2], true));
    await act(async () => finish());
    expect(result.current.hasUnsavedEdits).toBe(true);
    expect(result.current.status).toBe('dirty');
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(saveMyAvailability).toHaveBeenCalledTimes(2);
    expect(edits(1)).toEqual([[S + 2, true]]);
  });

  it('does not clear a slot that was toggled back while its save ran (compared by value)', async () => {
    let finish!: () => void;
    vi.mocked(saveMyAvailability).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(savedWith([S + 1]));
        }),
    );
    const { result } = setup();
    act(() => result.current.setSlots([S + 1], true));
    await act(() => vi.advanceTimersByTimeAsync(800));
    act(() => result.current.setSlots([S + 1], false)); // toggled off while the "on" save runs
    await act(async () => finish());
    expect(result.current.hasUnsavedEdits).toBe(true);
    expect(sorted(result.current.free)).toEqual([]);
  });

  it('stops after an error instead of looping, and retries on request', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(saveMyAvailability).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(savedWith([S + 1]));
    const { result } = setup();
    act(() => result.current.setSlots([S + 1], true));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current).toMatchObject({
      status: 'error',
      error: 'Could not save your availability. Please try again.',
      hasUnsavedEdits: true,
    });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(saveMyAvailability).toHaveBeenCalledTimes(1);
    await act(async () => result.current.retry());
    expect(saveMyAvailability).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ status: 'saved', error: null });
  });

  it('an edit after an error clears it and saves again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(saveMyAvailability).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(savedWith([S + 1, S + 2]));
    const { result } = setup();
    act(() => result.current.setSlots([S + 1], true));
    await act(() => vi.advanceTimersByTimeAsync(800));
    act(() => result.current.setSlots([S + 2], true));
    expect(result.current.error).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(saveMyAvailability).toHaveBeenCalledTimes(2);
  });

  it('tells the person when an unreadable stored row has been replaced', async () => {
    const broken = ok(row(ME, [], { mask: 'zz' }));
    vi.mocked(saveMyAvailability).mockResolvedValue({ ...savedWith([S + 1]), reset: true });
    const { result } = setup({ ownRead: broken });
    expect(result.current.willReplaceUnreadable).toBe(true);
    act(() => result.current.setSlots([S + 1], true));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current).toMatchObject({ replacedUnreadable: true, willReplaceUnreadable: false });
  });
});

describe('the disclosure gate', () => {
  it('writes nothing until the privacy notice is accepted, then saves what was kept', async () => {
    vi.mocked(saveMyAvailability).mockResolvedValue(savedWith([S + 1]));
    const { result, rerender } = setup({ disclosureAccepted: false });
    act(() => result.current.setSlots([S + 1], true));
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(saveMyAvailability).not.toHaveBeenCalled();
    expect(sorted(result.current.free)).toEqual([S + 1]); // the edit is kept, just not sent
    act(() => result.current.retry());
    expect(saveMyAvailability).not.toHaveBeenCalled();
    rerender({ ...base, disclosureAccepted: true });
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(saveMyAvailability).toHaveBeenCalledTimes(1);
  });

  it('does not flush on hide or unmount before the notice is accepted', async () => {
    const { result, unmount } = setup({ disclosureAccepted: false });
    act(() => result.current.setSlots([S + 1], true));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    unmount();
    expect(saveMyAvailability).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
});

describe('flushing and leaving', () => {
  it('saves right away when the tab is hidden', async () => {
    vi.mocked(saveMyAvailability).mockResolvedValue(savedWith([S + 1]));
    const { result } = setup();
    act(() => result.current.setSlots([S + 1], true));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    expect(saveMyAvailability).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('saves pending edits once on unmount', async () => {
    vi.mocked(saveMyAvailability).mockResolvedValue(savedWith([S + 1]));
    const { result, unmount } = setup();
    act(() => result.current.setSlots([S + 1], true));
    unmount();
    expect(saveMyAvailability).toHaveBeenCalledTimes(1);
    expect(edits(0)).toEqual([[S + 1, true]]);
  });

  it('also saves edits made after an in-flight save started, when the page is left meanwhile', async () => {
    let finish!: () => void;
    vi.mocked(saveMyAvailability)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve(savedWith([S + 1]));
          }),
      )
      .mockResolvedValue(savedWith([S + 1, S + 2]));
    const { result, unmount } = setup();
    act(() => result.current.setSlots([S + 1], true));
    await act(() => vi.advanceTimersByTimeAsync(800));
    act(() => result.current.setSlots([S + 2], true));
    unmount(); // the first save is still running; the unmount flush skips it
    await act(async () => finish());
    expect(saveMyAvailability).toHaveBeenCalledTimes(2);
    expect(edits(1)).toEqual([[S + 2, true]]);
  });

  it('does not save on unmount when nothing is pending', () => {
    setup().unmount();
    expect(saveMyAvailability).not.toHaveBeenCalled();
  });

  it('warns before the page goes away while edits are unsaved, and not otherwise', () => {
    const { result } = setup();
    const quiet = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);
    act(() => result.current.setSlots([S + 1], true));
    const guarded = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(guarded);
    expect(guarded.defaultPrevented).toBe(true);
  });
});

describe('loads while editing', () => {
  it('shows a newer load of the stored row', () => {
    const { result, rerender } = setup({ ownRead: saved([S + 1]), fetchedAt: NOW - 10_000 });
    rerender({ ...base, ownRead: saved([S + 1, S + 9]), fetchedAt: NOW - 1_000 });
    expect(sorted(result.current.free)).toEqual([S + 1, S + 9]);
  });

  it('ignores a load that began before the last save finished', async () => {
    vi.mocked(saveMyAvailability).mockResolvedValue(savedWith([S + 5]));
    const { result, rerender } = setup();
    act(() => result.current.setSlots([S + 5], true));
    await act(() => vi.advanceTimersByTimeAsync(800)); // the save finishes at NOW + 800
    rerender({ ...base, ownRead: none, fetchedAt: NOW + 400 }); // started before it finished
    expect(sorted(result.current.free)).toEqual([S + 5]);
    expect(result.current.hasRow).toBe(true);
  });

  it('uses a load that began after the last save finished', async () => {
    vi.mocked(saveMyAvailability).mockResolvedValue(savedWith([S + 5]));
    const { result, rerender } = setup();
    act(() => result.current.setSlots([S + 5], true));
    await act(() => vi.advanceTimersByTimeAsync(800));
    rerender({ ...base, ownRead: saved([S + 5, S + 9]), fetchedAt: NOW + 5_000 }); // another device added S + 9
    expect(sorted(result.current.free)).toEqual([S + 5, S + 9]);
  });

  it('keeps unsaved edits on top of a refreshed stored row', () => {
    const { result, rerender } = setup({ ownRead: saved([S + 1]), fetchedAt: NOW - 10_000 });
    act(() => result.current.setSlots([S + 4], true));
    rerender({ ...base, ownRead: saved([S + 1, S + 2]), fetchedAt: NOW - 1_000 });
    expect(sorted(result.current.free)).toEqual([S + 1, S + 2, S + 4]);
  });

  it('does not re-run anything when the same unchanged load is passed again', () => {
    const stored = saved([S + 1]);
    const { result, rerender } = setup({ ownRead: stored });
    const before = result.current.free;
    rerender({ ...base, ownRead: stored });
    expect(result.current.free).toBe(before);
  });
});

describe('React StrictMode (development)', () => {
  it('does not treat a mounted page as left, so edits queued during a save are saved once', async () => {
    let finish!: () => void;
    vi.mocked(saveMyAvailability)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve(savedWith([S + 1]));
          }),
      )
      .mockResolvedValue(savedWith([S + 1, S + 2]));
    const { result } = renderHook((props: Props) => useAvailabilityEditor({ band: b, sub: ME, ...props }), {
      initialProps: base,
      wrapper: StrictMode,
    });
    act(() => result.current.setSlots([S + 1], true));
    await act(() => vi.advanceTimersByTimeAsync(800));
    act(() => result.current.setSlots([S + 2], true));
    await act(async () => finish());
    await act(() => vi.advanceTimersByTimeAsync(800));
    // One save for the first batch and ONE for the edit made meanwhile (not an extra "page was left" one).
    expect(saveMyAvailability).toHaveBeenCalledTimes(2);
    expect(edits(1)).toEqual([[S + 2, true]]);
  });
});

describe('a refresh that cannot read the person’s own row', () => {
  it('keeps the row they just saved, so editing is not switched off and queued edits still save', async () => {
    vi.mocked(saveMyAvailability).mockResolvedValue(savedWith([S + 1]));
    const { result, rerender } = setup();
    act(() => result.current.setSlots([S + 1], true));
    await act(() => vi.advanceTimersByTimeAsync(800)); // saved at NOW + 800
    // A later refetch failed to read their row.
    rerender({ ...base, ownRead: { status: 'failed' }, fetchedAt: NOW + 5_000 });
    expect(result.current.blocked).toBeNull();
    expect(sorted(result.current.free)).toEqual([S + 1]);
    vi.mocked(saveMyAvailability).mockResolvedValue(savedWith([S + 1, S + 2]));
    act(() => result.current.setSlots([S + 2], true));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(saveMyAvailability).toHaveBeenCalledTimes(2);
  });

  it('still blocks on a failed read when they have not saved anything this visit', () => {
    const { result } = setup({ ownRead: { status: 'failed' } });
    expect(result.current.blocked).toBe('failed');
  });
});

describe('when editing is blocked', () => {
  it.each([
    ['a newer client wrote the row', ok(row(ME, [], { format: 2 })), 'newer-format'],
    ['the row is not theirs', ok(row(ME, [], { owner: 'sub-other' })), 'unavailable'],
    ['the read failed', { status: 'failed' } as AvailabilityRead, 'failed'],
  ])('ignores edits and never saves when %s', async (_label, ownRead, block) => {
    const { result } = setup({ ownRead });
    expect(result.current.blocked).toBe(block);
    act(() => result.current.setSlots([S + 1], true));
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(result.current.hasUnsavedEdits).toBe(false);
    expect(saveMyAvailability).not.toHaveBeenCalled();
  });

  it('can still delete the row', async () => {
    const { result } = setup({ ownRead: ok(row(ME, [], { format: 2 })) });
    await act(async () => result.current.removeAll());
    expect(deleteMyAvailabilityWithin).toHaveBeenCalledWith('band-1');
    expect(result.current.blocked).toBeNull();
    expect(result.current.hasRow).toBe(false);
  });

  it('reports a save the server refuses', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(saveMyAvailability).mockRejectedValue(new AvailabilityBlockedError('newer-format'));
    const { result } = setup();
    act(() => result.current.setSlots([S + 1], true));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current.error).toBe('Your times can’t be saved right now.');
  });
});

describe('deleting my availability', () => {
  it('deletes the row and shows an empty calendar', async () => {
    const { result } = setup({ ownRead: saved([S + 1]) });
    await act(async () => result.current.removeAll());
    expect(deleteMyAvailabilityWithin).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ hasRow: false, deleting: false, status: 'idle' });
    expect(sorted(result.current.free)).toEqual([]);
  });

  it('drops pending edits first, so a queued save cannot bring the row back', async () => {
    const { result } = setup();
    act(() => result.current.setSlots([S + 1], true));
    await act(async () => result.current.removeAll());
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(saveMyAvailability).not.toHaveBeenCalled();
    expect(result.current.hasUnsavedEdits).toBe(false);
  });

  it('ignores edits and writes nothing while the delete runs, and on unmount', async () => {
    let finish!: () => void;
    vi.mocked(deleteMyAvailabilityWithin).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result, unmount } = setup({ ownRead: saved([S + 1]) });
    let removal!: Promise<void>;
    act(() => {
      removal = result.current.removeAll();
    });
    expect(result.current.deleting).toBe(true);
    act(() => result.current.setSlots([S + 2], true));
    expect(result.current.hasUnsavedEdits).toBe(false);
    unmount();
    await act(async () => finish());
    await removal;
    expect(saveMyAvailability).not.toHaveBeenCalled();
  });

  it('rejects, for the confirm dialog to show, when the delete fails, and keeps the row', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(deleteMyAvailabilityWithin).mockRejectedValue(new Error('offline'));
    const { result } = setup({ ownRead: saved([S + 1]) });
    await act(async () => {
      await expect(result.current.removeAll()).rejects.toThrow('Could not delete your availability');
    });
    expect(result.current).toMatchObject({ hasRow: true, deleting: false, status: 'idle' });
  });
});

describe('what a save is given', () => {
  it('the saved row decodes to exactly the free slots', async () => {
    vi.mocked(saveMyAvailability).mockImplementation(async (_b, sent) => {
      const marks = [...sent].filter(([, mark]) => mark).map(([slot]) => slot);
      return savedWith(marks);
    });
    const { result } = setup();
    act(() => result.current.setSlots([S + 6, S + 7], true));
    await act(() => vi.advanceTimersByTimeAsync(800));
    const row0 = row(ME, [S + 6, S + 7]);
    expect(sorted(decodeMask(row0.startDay, row0.mask))).toEqual([S + 6, S + 7]);
    expect(sorted(result.current.free)).toEqual([S + 6, S + 7]);
  });
});
