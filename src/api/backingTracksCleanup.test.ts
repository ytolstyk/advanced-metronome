import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  class AuthRequiredError extends Error {}
  const mutations = {
    removeSongBackingTracks: vi.fn(),
    leaveMyBackingTracks: vi.fn(),
    removeMemberBackingTracks: vi.fn(),
  };
  return {
    AuthRequiredError,
    mutations,
    requireAuth: vi.fn(async () => undefined),
    hasBackingTrackModel: vi.fn(() => true),
    songHasBackingTracks: vi.fn(),
  };
});

vi.mock('./bandsShared', () => ({
  bandsClient: { mutations: h.mutations },
  requireAuth: h.requireAuth,
}));
vi.mock('./bandReads', () => ({
  hasBackingTrackModel: h.hasBackingTrackModel,
  songHasBackingTracks: h.songHasBackingTracks,
}));

import {
  cleanupMyBackingTracks,
  leaveMyBackingTracks,
  leaveMyBackingTracksWithin,
  removeMemberBackingTracks,
  removeSongBackingTracks,
  removeSongBackingTracksIfAny,
} from './backingTracksCleanup';

const ok = (body: Record<string, unknown> = {}) => ({ data: JSON.stringify({ ok: true, ...body }) });
const fail = (code: string) => ({ data: JSON.stringify({ ok: false, code }) });
const retry = () => fail('retry');
const done = () => ok({ done: true, removed: 1 });

const MUTATIONS = Object.values(h.mutations);
const noBackendCall = () => {
  for (const fn of MUTATIONS) expect(fn).not.toHaveBeenCalled();
  expect(h.songHasBackingTracks).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of MUTATIONS) fn.mockReset();
  h.songHasBackingTracks.mockReset();
  h.requireAuth.mockReset().mockResolvedValue(undefined);
  h.hasBackingTrackModel.mockReset().mockReturnValue(true);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

/** The bulk calls share the same `untilDone` loop and the same guards. */
const BULK = [
  ['removeSongBackingTracks', () => removeSongBackingTracks('song-1'), h.mutations.removeSongBackingTracks, { songId: 'song-1' }],
  ['leaveMyBackingTracks', () => leaveMyBackingTracks('band-1'), h.mutations.leaveMyBackingTracks, { bandId: 'band-1' }],
  [
    'removeMemberBackingTracks (all)',
    () => removeMemberBackingTracks('band-1', 'all'),
    h.mutations.removeMemberBackingTracks,
    { bandId: 'band-1', mode: 'all' },
  ],
  [
    'removeMemberBackingTracks (one member)',
    () => removeMemberBackingTracks('band-1', { memberSub: 'sub-bob' }),
    h.mutations.removeMemberBackingTracks,
    { bandId: 'band-1', mode: 'member', memberSub: 'sub-bob' },
  ],
] as const;

describe.each(BULK)('%s', (_name, call, mutation, args) => {
  it('sends the right arguments and is done after one round when the server says done', async () => {
    mutation.mockResolvedValue(ok({ done: true, removed: 3 }));
    await expect(call()).resolves.toBeUndefined();
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith(args);
  });

  it('asks again while the server reports done:false, and stops as soon as it is done', async () => {
    mutation
      .mockResolvedValueOnce(ok({ done: false, removed: 5 }))
      .mockResolvedValueOnce(ok({ done: false, removed: 5 }))
      .mockResolvedValueOnce(ok({ done: true, removed: 1 }));
    await expect(call()).resolves.toBeUndefined();
    expect(mutation).toHaveBeenCalledTimes(3);
  });

  it('gives up with a retry error after 5 rounds of done:false', async () => {
    mutation.mockResolvedValue(ok({ done: false, removed: 5 }));
    await expect(call()).rejects.toMatchObject({ code: 'retry' });
    expect(mutation).toHaveBeenCalledTimes(5);
  });

  it('stops at once on a server error code', async () => {
    mutation.mockResolvedValue(fail('forbidden'));
    await expect(call()).rejects.toMatchObject({ code: 'forbidden' });
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it('is a no-op (after the sign-in check) when the backend has no BackingTrack model', async () => {
    h.hasBackingTrackModel.mockReturnValue(false);
    await expect(call()).resolves.toBeUndefined();
    expect(h.requireAuth).toHaveBeenCalledTimes(1);
    expect(mutation).not.toHaveBeenCalled();
  });

  it('requires auth first and calls nothing else', async () => {
    const err = new h.AuthRequiredError('sign in');
    h.requireAuth.mockRejectedValue(err);
    await expect(call()).rejects.toBe(err);
    noBackendCall();
  });
});

describe('removeSongBackingTracksIfAny', () => {
  it('skips the Lambda when the index read shows the song has no tracks', async () => {
    h.songHasBackingTracks.mockResolvedValue(false);
    await removeSongBackingTracksIfAny('song-1');
    expect(h.songHasBackingTracks).toHaveBeenCalledWith('song-1');
    expect(h.mutations.removeSongBackingTracks).not.toHaveBeenCalled();
  });

  it('calls the Lambda when the song has a track', async () => {
    h.songHasBackingTracks.mockResolvedValue(true);
    h.mutations.removeSongBackingTracks.mockResolvedValue(done());
    await removeSongBackingTracksIfAny('song-1');
    expect(h.mutations.removeSongBackingTracks).toHaveBeenCalledWith({ songId: 'song-1' });
  });

  it('still calls the Lambda when the index could not be read (null)', async () => {
    h.songHasBackingTracks.mockResolvedValue(null);
    h.mutations.removeSongBackingTracks.mockResolvedValue(done());
    await removeSongBackingTracksIfAny('song-1');
    expect(h.mutations.removeSongBackingTracks).toHaveBeenCalledTimes(1);
  });

  it('lets the Lambda\'s failure through so a song delete can be aborted', async () => {
    h.songHasBackingTracks.mockResolvedValue(true);
    h.mutations.removeSongBackingTracks.mockResolvedValue(retry());
    await expect(removeSongBackingTracksIfAny('song-1')).rejects.toMatchObject({ code: 'retry' });
  });

  it('does nothing at all (after the sign-in check) when the backend has no model', async () => {
    h.hasBackingTrackModel.mockReturnValue(false);
    await removeSongBackingTracksIfAny('song-1');
    expect(h.songHasBackingTracks).not.toHaveBeenCalled();
    expect(h.mutations.removeSongBackingTracks).not.toHaveBeenCalled();
  });

  it('requires auth first', async () => {
    const err = new h.AuthRequiredError('sign in');
    h.requireAuth.mockRejectedValue(err);
    await expect(removeSongBackingTracksIfAny('song-1')).rejects.toBe(err);
    noBackendCall();
  });
});

describe('leaveMyBackingTracksWithin', () => {
  it('runs the same removal as leaveMyBackingTracks', async () => {
    h.mutations.leaveMyBackingTracks.mockResolvedValue(done());
    await expect(leaveMyBackingTracksWithin('band-1')).resolves.toBeUndefined();
    expect(h.mutations.leaveMyBackingTracks).toHaveBeenCalledWith({ bandId: 'band-1' });
  });

  it('passes the removal\'s own failure through', async () => {
    h.mutations.leaveMyBackingTracks.mockResolvedValue(fail('forbidden'));
    await expect(leaveMyBackingTracksWithin('band-1')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('stops waiting after 8 seconds by default, rejecting with a timeout', async () => {
    vi.useFakeTimers();
    h.mutations.leaveMyBackingTracks.mockReturnValue(new Promise(() => undefined));
    const outcome = leaveMyBackingTracksWithin('band-1').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(7_999);
    let settled = false;
    void outcome.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await outcome) as Error).toMatchObject({ message: 'leaveBackingTracks timed out' });
  });

  it('honours a custom bound', async () => {
    vi.useFakeTimers();
    h.mutations.leaveMyBackingTracks.mockReturnValue(new Promise(() => undefined));
    const outcome = leaveMyBackingTracksWithin('band-1', 500).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(500);
    expect((await outcome) as Error).toMatchObject({ message: 'leaveBackingTracks timed out' });
  });

  it('requires auth first', async () => {
    const err = new h.AuthRequiredError('sign in');
    h.requireAuth.mockRejectedValue(err);
    await expect(leaveMyBackingTracksWithin('band-1')).rejects.toBe(err);
    noBackendCall();
  });
});

describe('cleanupMyBackingTracks', () => {
  it('resolves after one call when it works', async () => {
    h.mutations.leaveMyBackingTracks.mockResolvedValue(done());
    await expect(cleanupMyBackingTracks('band-1')).resolves.toBeUndefined();
    expect(h.mutations.leaveMyBackingTracks).toHaveBeenCalledTimes(1);
  });

  it('retries once after a failure', async () => {
    h.mutations.leaveMyBackingTracks.mockResolvedValueOnce(retry()).mockResolvedValueOnce(done());
    await expect(cleanupMyBackingTracks('band-1')).resolves.toBeUndefined();
    expect(h.mutations.leaveMyBackingTracks).toHaveBeenCalledTimes(2);
  });

  it('never rejects: a second failure is only logged', async () => {
    h.mutations.leaveMyBackingTracks.mockResolvedValue(retry());
    await expect(cleanupMyBackingTracks('band-1')).resolves.toBeUndefined();
    expect(h.mutations.leaveMyBackingTracks).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith('Could not remove your backing tracks', expect.anything());
  });

  it('never rejects when signed out, and calls nothing', async () => {
    h.requireAuth.mockRejectedValue(new h.AuthRequiredError('sign in'));
    await expect(cleanupMyBackingTracks('band-1')).resolves.toBeUndefined();
    noBackendCall();
  });

  it('stops waiting after 8 seconds if the backend hangs', async () => {
    vi.useFakeTimers();
    h.mutations.leaveMyBackingTracks.mockReturnValue(new Promise(() => undefined));
    let settled = false;
    const finished = cleanupMyBackingTracks('band-1').then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await finished;
    expect(settled).toBe(true);
  });
});
