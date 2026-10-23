import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { m } = vi.hoisted(() => {
  const model = () => ({ get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() });
  const m: Record<string, unknown> = {
    Availability: model(),
    Member: model(),
    MyBand: model(),
    graphql: vi.fn(),
  };
  return { m };
});

vi.mock('aws-amplify/data', () => ({ generateClient: vi.fn(() => ({ models: m, graphql: m.graphql })) }));
vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(async () => true),
  getCurrentUserSub: vi.fn(async () => 'sub-me'),
}));

import { decodeMask, encodeRow } from '../availabilitySlots';
import { BOOM, CONFLICT, ME, NOW, NOW_SLOT, UNAUTH, band, row } from '../availabilityTestHelpers';
import { dismissBand } from './bandsApi';
import {
  AvailabilityBlockedError,
  AvailabilityUnavailableError,
  cleanupMyAvailability,
  deleteMyAvailability,
  deleteMyAvailabilityWithin,
  getAvailabilityRead,
  isAvailabilityAvailable,
  saveMyAvailability,
} from './availabilityRows';
import { isAuthenticated } from './authUtils';
import { NotSignedInError } from './bandsShared';

interface Fns {
  get: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}
const A = m.Availability as Fns;
const MEMBER = m.Member as Fns;
const MYBAND = m.MyBand as Fns;


const stored = (free: number[] = [], over: Record<string, unknown> = {}) => ({ ...row(ME, free), ...over });
const echoWrite = async (input: Record<string, unknown>) => ({ data: { ...input, createdAt: 'c', updatedAt: 'u' } });
const freeOf = (r: { startDay: number; mask: string }) => [...decodeMask(r.startDay, r.mask)].sort((a, b) => a - b);

/** Each test uses its own band id: the per-band lock would otherwise chain a hung test into the next. */
let n = 0;
const freshBand = () => band({ id: `band-${++n}` });

beforeEach(() => {
  for (const fns of [A, MEMBER, MYBAND]) {
    for (const fn of Object.values(fns)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  A.get.mockResolvedValue({ data: null });
  A.create.mockImplementation(echoWrite);
  A.update.mockImplementation(echoWrite);
  A.delete.mockResolvedValue({ data: {} });
  MEMBER.delete.mockResolvedValue({ data: {} });
  MYBAND.delete.mockResolvedValue({ data: {} });
  m.Availability = A;
  vi.mocked(isAuthenticated).mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('getAvailabilityRead', () => {
  it('returns the row, mapped to the record shape', async () => {
    A.get.mockResolvedValue({ data: stored([NOW_SLOT + 1]) });
    const read = await getAvailabilityRead('band-1', ME);
    expect(A.get).toHaveBeenCalledWith({ bandId: 'band-1', owner: ME });
    expect(read).toMatchObject({ status: 'ok', row: { bandId: 'band-1', owner: ME, format: 1 } });
  });

  it('returns ok with no row when the member has none', async () => {
    expect(await getAvailabilityRead('band-1', ME)).toEqual({ status: 'ok', row: null });
  });

  it('returns failed for an API error or a thrown error, never throws for one bad row, and logs why', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    A.get.mockResolvedValueOnce({ data: null, errors: BOOM });
    expect(await getAvailabilityRead('band-1', ME)).toEqual({ status: 'failed' });
    A.get.mockRejectedValueOnce(new Error('network'));
    expect(await getAvailabilityRead('band-1', ME)).toEqual({ status: 'failed' });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('throws when the backend has no Availability model (frontend deployed first)', async () => {
    delete m.Availability;
    expect(isAvailabilityAvailable()).toBe(false);
    await expect(getAvailabilityRead('band-1', ME)).rejects.toBeInstanceOf(AvailabilityUnavailableError);
  });
});

describe('saveMyAvailability', () => {
  const edits = new Map([[NOW_SLOT + 3, true]]);

  it('creates the first row for a member who has none', async () => {
    const b = freshBand();
    const saved = await saveMyAvailability(b, edits, NOW);
    expect(A.create).toHaveBeenCalledTimes(1);
    expect(A.update).not.toHaveBeenCalled();
    const input = A.create.mock.calls[0][0];
    expect(input).toMatchObject({ bandId: b.id, owner: ME, format: 1 });
    expect(freeOf(input)).toEqual([NOW_SLOT + 3]);
    expect(saved).toMatchObject({ reset: false, row: { bandId: b.id, owner: ME } });
  });

  it('merges edits into the stored marks and updates', async () => {
    const b = freshBand();
    A.get.mockResolvedValue({ data: { ...stored([NOW_SLOT + 1, NOW_SLOT + 2]), bandId: b.id } });
    await saveMyAvailability(b, new Map([[NOW_SLOT + 2, false], [NOW_SLOT + 3, true]]), NOW);
    expect(A.create).not.toHaveBeenCalled();
    expect(freeOf(A.update.mock.calls[0][0])).toEqual([NOW_SLOT + 1, NOW_SLOT + 3]);
  });

  it('re-reads and updates when a create finds the row already there', async () => {
    const b = freshBand();
    A.get
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: { ...stored([NOW_SLOT + 1]), bandId: b.id } });
    A.create.mockResolvedValueOnce({ data: null, errors: CONFLICT });
    await saveMyAvailability(b, edits, NOW);
    expect(A.get).toHaveBeenCalledTimes(2);
    // The other device's mark survives: the second pass merged onto the fresh row.
    expect(freeOf(A.update.mock.calls[0][0])).toEqual([NOW_SLOT + 1, NOW_SLOT + 3]);
  });

  it.each([
    ['a failed condition', CONFLICT],
    ['Unauthorized (how the API reports a vanished row)', UNAUTH],
  ])('re-reads and creates when an update finds the row gone: %s', async (_label, errors) => {
    const b = freshBand();
    A.get
      .mockResolvedValueOnce({ data: { ...stored([NOW_SLOT + 1]), bandId: b.id } })
      .mockResolvedValueOnce({ data: null });
    A.update.mockResolvedValueOnce({ data: null, errors });
    await saveMyAvailability(b, edits, NOW);
    expect(A.create).toHaveBeenCalledTimes(1);
    expect(freeOf(A.create.mock.calls[0][0])).toEqual([NOW_SLOT + 3]);
  });

  it('gives up after three passes with a clear error', async () => {
    const b = freshBand();
    A.get.mockResolvedValue({ data: { ...stored([]), bandId: b.id } });
    A.update.mockResolvedValue({ data: null, errors: CONFLICT });
    await expect(saveMyAvailability(b, edits, NOW)).rejects.toThrow('Could not save your availability');
    expect(A.update).toHaveBeenCalledTimes(3);
  });

  it('surfaces a real API error immediately instead of retrying', async () => {
    const b = freshBand();
    A.create.mockResolvedValue({ data: null, errors: BOOM });
    await expect(saveMyAvailability(b, edits, NOW)).rejects.toThrow('saveAvailability: boom');
    expect(A.create).toHaveBeenCalledTimes(1);
  });

  it('replaces an unreadable row and says so', async () => {
    const b = freshBand();
    A.get.mockResolvedValue({ data: { ...stored([], { mask: 'zz' }), bandId: b.id } });
    const saved = await saveMyAvailability(b, edits, NOW);
    expect(saved.reset).toBe(true);
    expect(A.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a newer client wrote the row', { format: 2 }, 'newer-format'],
    ['the row belongs to someone else', { owner: 'sub-other' }, 'unavailable'],
  ])('refuses to write when %s', async (_label, over, reason) => {
    const b = freshBand();
    A.get.mockResolvedValue({ data: { ...stored([], over), bandId: b.id } });
    const err = await saveMyAvailability(b, edits, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(AvailabilityBlockedError);
    expect(err.reason).toBe(reason);
    expect(A.create).not.toHaveBeenCalled();
    expect(A.update).not.toHaveBeenCalled();
  });

  it('refuses to write when the read itself failed', async () => {
    A.get.mockResolvedValue({ data: null, errors: BOOM });
    const err = await saveMyAvailability(freshBand(), edits, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(AvailabilityBlockedError);
    expect(err.reason).toBe('failed');
    expect(A.create).not.toHaveBeenCalled();
    expect(A.update).not.toHaveBeenCalled();
  });

  it('refuses to write to a deleted band', async () => {
    const b = band({ id: `band-${++n}`, deletedAt: '2026-11-01T00:00:00Z' });
    A.get.mockResolvedValue({ data: { ...stored([]), bandId: b.id } });
    await expect(saveMyAvailability(b, edits, NOW)).rejects.toBeInstanceOf(AvailabilityBlockedError);
  });

  it('requires sign-in and a backend with the model', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(saveMyAvailability(freshBand(), edits, NOW)).rejects.toBeInstanceOf(NotSignedInError);
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    delete m.Availability;
    await expect(saveMyAvailability(freshBand(), edits, NOW)).rejects.toBeInstanceOf(AvailabilityUnavailableError);
  });

  it('runs two saves for a band one after the other, so the second builds on the first', async () => {
    const b = freshBand();
    let current: Record<string, unknown> | null = null;
    A.get.mockImplementation(async () => ({ data: current }));
    A.create.mockImplementation(async (input: Record<string, unknown>) => {
      current = { ...input, createdAt: 'c', updatedAt: 'u' };
      return { data: current };
    });
    A.update.mockImplementation(async (input: Record<string, unknown>) => {
      current = { ...current, ...input };
      return { data: current };
    });
    await Promise.all([
      saveMyAvailability(b, new Map([[NOW_SLOT + 1, true]]), NOW),
      saveMyAvailability(b, new Map([[NOW_SLOT + 2, true]]), NOW),
    ]);
    expect(freeOf(current as unknown as { startDay: number; mask: string })).toEqual([NOW_SLOT + 1, NOW_SLOT + 2]);
  });

  it('skips the write when nothing would change (a mark switched on and off again)', async () => {
    const b = freshBand();
    const current = { ...stored([NOW_SLOT + 1]), bandId: b.id };
    A.get.mockResolvedValue({ data: current });
    const saved = await saveMyAvailability(b, new Map([[NOW_SLOT + 1, true]]), NOW);
    expect(A.update).not.toHaveBeenCalled();
    expect(A.create).not.toHaveBeenCalled();
    expect(saved.row).toMatchObject({ mask: current.mask, startDay: current.startDay });
  });

  it('reads the clock when the save runs, not when it was queued behind another', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const b = freshBand();
    let release!: () => void;
    // The first save stalls on its read and holds the band's lock; the second queues behind it.
    A.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ data: null });
        }),
    );
    const first = saveMyAvailability(b, new Map([[NOW_SLOT + 10, true]]));
    const queued = saveMyAvailability(b, new Map([[NOW_SLOT + 3, true]])); // starts at 13:30
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    vi.setSystemTime(NOW + 2 * 60 * 60 * 1000); // by the time it runs it is 14:10, so 13:30 has started
    release();
    await Promise.all([first, queued]);
    const writes = A.create.mock.calls.map(([input]) => freeOf(input));
    expect(writes[0]).toEqual([NOW_SLOT + 10]);
    expect(writes[1]).toEqual([]); // the queued edit is for a slot that has since started
  });

  it('writes the same window encodeRow would', async () => {
    const b = freshBand();
    await saveMyAvailability(b, edits, NOW);
    const expected = encodeRow([NOW_SLOT + 3], NOW);
    expect(A.create.mock.calls[0][0]).toMatchObject(expected);
  });
});

describe('deleteMyAvailability', () => {
  it('deletes the caller’s row when there is one', async () => {
    A.get.mockResolvedValue({ data: stored([1]) });
    await deleteMyAvailability('band-del-1');
    expect(A.delete).toHaveBeenCalledWith({ bandId: 'band-del-1', owner: ME });
  });

  it('does nothing, and does not fail, when there is no row', async () => {
    await deleteMyAvailability('band-del-2');
    expect(A.delete).not.toHaveBeenCalled();
  });

  it('is a no-op against a backend without the model', async () => {
    delete m.Availability;
    await expect(deleteMyAvailability('band-del-3')).resolves.toBeUndefined();
  });

  it('counts an Unauthorized reply as deleted only when a re-read shows the row is gone', async () => {
    A.get.mockResolvedValueOnce({ data: stored([1]) }).mockResolvedValueOnce({ data: null });
    A.delete.mockResolvedValueOnce({ data: null, errors: UNAUTH });
    await expect(deleteMyAvailability('band-del-4')).resolves.toBeUndefined();
  });

  it('refuses to report success when the delete was refused and the row is still there', async () => {
    A.get.mockResolvedValue({ data: stored([1]) });
    A.delete.mockResolvedValue({ data: null, errors: UNAUTH });
    await expect(deleteMyAvailability('band-del-4b')).rejects.toThrow('deleteAvailability');
  });

  it('counts a failed condition (the row changed under it) as deleted', async () => {
    A.get.mockResolvedValue({ data: stored([1]) });
    A.delete.mockResolvedValueOnce({ data: null, errors: CONFLICT });
    await expect(deleteMyAvailability('band-del-4c')).resolves.toBeUndefined();
  });

  it('reports a real failure', async () => {
    A.get.mockResolvedValue({ data: stored([1]) });
    A.delete.mockResolvedValue({ data: null, errors: BOOM });
    await expect(deleteMyAvailability('band-del-5')).rejects.toThrow('deleteAvailability: boom');
  });

  it('still tries the delete when the existence check fails', async () => {
    A.get.mockResolvedValue({ data: null, errors: BOOM });
    await deleteMyAvailability('band-del-6');
    expect(A.delete).toHaveBeenCalledTimes(1);
  });

  it('waits for a save in progress for the same band, so a delete is never undone by it', async () => {
    const order: string[] = [];
    let release!: () => void;
    A.get.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        release = r;
      });
      return { data: null };
    });
    A.create.mockImplementation(async (input: Record<string, unknown>) => {
      order.push('save-write');
      return echoWrite(input);
    });
    A.get.mockImplementation(async () => ({ data: stored([1]) }));
    A.delete.mockImplementation(async () => {
      order.push('delete');
      return { data: {} };
    });
    const b = band({ id: 'band-del-7' });
    const save = saveMyAvailability(b, new Map([[NOW_SLOT + 1, true]]), NOW);
    const del = deleteMyAvailability(b.id);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release();
    await Promise.all([save, del]);
    expect(order).toEqual(['save-write', 'delete']);
  });
});

describe('deleteMyAvailabilityWithin', () => {
  it('gives up when the delete stalls, so a dialog is never stuck waiting', async () => {
    vi.useFakeTimers();
    A.get.mockReturnValue(new Promise(() => {}));
    const result = deleteMyAvailabilityWithin('band-stall-1', 5_000).catch((e) => e);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toEqual(expect.objectContaining({ message: 'deleteAvailability timed out' }));
  });

  it('passes through a normal delete', async () => {
    A.get.mockResolvedValue({ data: stored([1]) });
    await deleteMyAvailabilityWithin('band-within-1');
    expect(A.delete).toHaveBeenCalledTimes(1);
  });
});

describe('cleanupMyAvailability', () => {
  it('retries once after a failure', async () => {
    A.get.mockResolvedValue({ data: stored([1]) });
    A.delete.mockResolvedValueOnce({ data: null, errors: BOOM }).mockResolvedValueOnce({ data: {} });
    await cleanupMyAvailability('band-clean-1');
    expect(A.delete).toHaveBeenCalledTimes(2);
  });

  it('accepts an Unauthorized reply as done (best-effort, no user waiting on the answer)', async () => {
    A.get.mockResolvedValue({ data: stored([1]) });
    A.delete.mockResolvedValue({ data: null, errors: UNAUTH });
    await cleanupMyAvailability('band-clean-5');
    expect(A.delete).toHaveBeenCalledTimes(1);
  });

  it('never rejects, even when both attempts fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    A.get.mockResolvedValue({ data: stored([1]) });
    A.delete.mockResolvedValue({ data: null, errors: BOOM });
    await expect(cleanupMyAvailability('band-clean-2')).resolves.toBeUndefined();
    expect(A.delete).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
  });

  it('gives up after five seconds when the work stalls', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    A.get.mockReturnValue(new Promise(() => {}));
    const done = vi.fn();
    void cleanupMyAvailability('band-clean-3').then(done);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it('is quiet against a backend without the model', async () => {
    delete m.Availability;
    await expect(cleanupMyAvailability('band-clean-4')).resolves.toBeUndefined();
  });
});

describe('dismissBand and availability', () => {
  it('removes the Member and MyBand rows and cleans up availability alongside', async () => {
    A.get.mockResolvedValue({ data: stored([1]) });
    await dismissBand('band-dismiss-1');
    expect(MEMBER.delete).toHaveBeenCalledWith({ bandId: 'band-dismiss-1', owner: ME });
    expect(MYBAND.delete).toHaveBeenCalledWith({ owner: ME, bandId: 'band-dismiss-1' });
    await vi.waitFor(() => expect(A.delete).toHaveBeenCalledWith({ bandId: 'band-dismiss-1', owner: ME }));
  });

  it('is not held up or failed by a stalled availability cleanup', async () => {
    A.get.mockReturnValue(new Promise(() => {}));
    await expect(dismissBand('band-dismiss-2')).resolves.toBeUndefined();
  });

  it('is not failed by a broken availability cleanup', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    A.get.mockRejectedValue(new Error('network'));
    A.delete.mockRejectedValue(new Error('network'));
    await expect(dismissBand('band-dismiss-3')).resolves.toBeUndefined();
  });

  it('still leaves against an older backend without the model', async () => {
    delete m.Availability;
    await expect(dismissBand('band-dismiss-4')).resolves.toBeUndefined();
    expect(MEMBER.delete).toHaveBeenCalledTimes(1);
  });
});
