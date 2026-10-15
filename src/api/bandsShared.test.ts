import { beforeEach, describe, expect, it, vi } from 'vitest';

const { m } = vi.hoisted(() => ({
  m: {
    models: {
      Band: { get: vi.fn() },
      SetList: { get: vi.fn(), update: vi.fn() },
      Member: { listMemberByBandId: vi.fn() },
    },
    graphql: vi.fn(),
  },
}));

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({ models: m.models, graphql: m.graphql })),
}));
vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(async () => true),
  getCurrentUserSub: vi.fn(async () => 'sub-me'),
  getSignedInSub: vi.fn(async () => 'sub-me' as string | null),
}));

import {
  BandConflictError,
  NotSignedInError,
  createIdempotent,
  deleteConfirmed,
  deleteQuietly,
  errorText,
  getBand,
  getSetListRow,
  isConflict,
  isUnauthorized,
  listRoster,
  readArgs,
  requireAuth,
  resolveReader,
  throwOnError,
  throwUnlessConflict,
  toBand,
  toMember,
  toSetList,
  toSong,
  toVote,
  tombstoneSetList,
  unwrap,
  updateBand,
  withKeyLock,
  type BandRow,
} from './bandsShared';
import { getSignedInSub, isAuthenticated } from './authUtils';

const CONFLICT = [{ errorType: 'DynamoDB:ConditionalCheckFailedException', message: 'The conditional request failed' }];
const UNAUTH = [{ errorType: 'Unauthorized', message: 'Not Authorized to access deleteSong' }];

const bandRow = (over: Partial<BandRow> = {}): BandRow => ({
  id: 'band-1',
  owner: 'sub-owner',
  name: 'The Band',
  inviteCode: 'ABCDEFGHJK',
  deletedAt: null,
  version: 1,
  setListIds: [],
  archivedSetListIds: [],
  bannedSubs: [],
  hiddenSongIds: [],
  sharedSetListIds: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthenticated).mockResolvedValue(true);
  m.models.Band.get.mockReset();
  m.models.SetList.update.mockReset();
  m.models.SetList.get.mockReset();
  m.models.Member.listMemberByBandId.mockReset();
  m.graphql.mockReset();
  vi.mocked(getSignedInSub).mockResolvedValue('sub-me');
});

describe('error classification', () => {
  it('errorText joins messages, falling back to errorType and then a generic label', () => {
    expect(errorText([{ message: 'a' }, { errorType: 'T' }, {}])).toBe('a; T; error');
    expect(errorText(null)).toBe('');
    expect(errorText(undefined)).toBe('');
  });

  it('isConflict matches ConditionalCheckFailed in either field, case-insensitively', () => {
    expect(isConflict(CONFLICT)).toBe(true);
    expect(isConflict([{ message: 'conditionalcheckfailed somewhere' }])).toBe(true);
    expect(isConflict(UNAUTH)).toBe(false);
    expect(isConflict(null)).toBe(false);
    expect(isConflict([])).toBe(false);
  });

  it('isUnauthorized matches Unauthorized in either field', () => {
    expect(isUnauthorized(UNAUTH)).toBe(true);
    expect(isUnauthorized([{ message: 'Unauthorized!' }])).toBe(true);
    expect(isUnauthorized(CONFLICT)).toBe(false);
    expect(isUnauthorized(undefined)).toBe(false);
  });
});

describe('throwOnError / throwUnlessConflict / unwrap', () => {
  it('throwOnError is silent without errors and prefixes the label otherwise', () => {
    expect(() => throwOnError({}, 'x')).not.toThrow();
    expect(() => throwOnError({ errors: [] }, 'x')).not.toThrow();
    expect(() => throwOnError({ errors: [{ message: 'boom' }, { message: 'bang' }] }, 'doIt')).toThrow('doIt: boom; bang');
  });

  it('throwUnlessConflict swallows a failed condition but surfaces everything else', () => {
    expect(() => throwUnlessConflict({ errors: CONFLICT }, 'x')).not.toThrow();
    expect(() => throwUnlessConflict({ errors: UNAUTH }, 'x')).toThrow('x: Not Authorized');
    expect(() => throwUnlessConflict({}, 'x')).not.toThrow();
  });

  it('unwrap returns data, and throws on errors or on null/undefined data', () => {
    expect(unwrap({ data: { a: 1 } }, 'l')).toEqual({ a: 1 });
    expect(unwrap({ data: 0 }, 'l')).toBe(0);
    expect(() => unwrap({ data: null }, 'l')).toThrow('l: no data returned');
    expect(() => unwrap({ data: { a: 1 }, errors: [{ message: 'nope' }] }, 'l')).toThrow('l: nope');
  });
});

describe('requireAuth', () => {
  it('resolves when signed in and throws NotSignedInError otherwise', async () => {
    await expect(requireAuth()).resolves.toBeUndefined();
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(requireAuth()).rejects.toBeInstanceOf(NotSignedInError);
    await expect(requireAuth()).rejects.toThrow('Not authenticated');
  });
});

describe('createIdempotent', () => {
  it('reports created on success, exists on a conflict, and throws on any other error', async () => {
    await expect(createIdempotent(async () => ({ data: {} }), 'c')).resolves.toBe('created');
    await expect(createIdempotent(async () => ({ data: null, errors: CONFLICT }), 'c')).resolves.toBe('exists');
    await expect(createIdempotent(async () => ({ data: null, errors: UNAUTH }), 'c')).rejects.toThrow('c: Not Authorized');
  });

  it('treats an empty errors array as success', async () => {
    await expect(createIdempotent(async () => ({ data: {}, errors: [] }), 'c')).resolves.toBe('created');
  });
});

describe('deleteQuietly', () => {
  it('accepts success, conflict and unauthorized (nothing left to delete)', async () => {
    await expect(deleteQuietly(async () => ({ data: {} }), 'd')).resolves.toBeUndefined();
    await expect(deleteQuietly(async () => ({ data: null, errors: CONFLICT }), 'd')).resolves.toBeUndefined();
    await expect(deleteQuietly(async () => ({ data: null, errors: UNAUTH }), 'd')).resolves.toBeUndefined();
  });

  it('still throws for other failures', async () => {
    await expect(deleteQuietly(async () => ({ data: null, errors: [{ message: 'timeout' }] }), 'd')).rejects.toThrow(
      'd: timeout',
    );
  });
});

describe('deleteConfirmed', () => {
  it('returns without re-reading when the delete succeeded or the condition failed', async () => {
    const isGone = vi.fn(async () => true);
    await deleteConfirmed(async () => ({ data: {} }), isGone, 'd');
    await deleteConfirmed(async () => ({ data: {}, errors: [] }), isGone, 'd');
    await deleteConfirmed(async () => ({ data: null, errors: CONFLICT }), isGone, 'd');
    expect(isGone).not.toHaveBeenCalled();
  });

  it('counts Unauthorized as success only when the re-read confirms the row is gone', async () => {
    const isGone = vi.fn(async () => true);
    await expect(deleteConfirmed(async () => ({ data: null, errors: UNAUTH }), isGone, 'd')).resolves.toBeUndefined();
    expect(isGone).toHaveBeenCalledTimes(1);
  });

  it('surfaces Unauthorized as a real failure when the row still exists', async () => {
    const isGone = vi.fn(async () => false);
    await expect(deleteConfirmed(async () => ({ data: null, errors: UNAUTH }), isGone, 'deleteSong')).rejects.toThrow(
      'deleteSong: Not Authorized',
    );
  });

  it('never consults the re-read for a non-Unauthorized error', async () => {
    const isGone = vi.fn(async () => true);
    await expect(
      deleteConfirmed(async () => ({ data: null, errors: [{ message: 'timeout' }] }), isGone, 'd'),
    ).rejects.toThrow('d: timeout');
    expect(isGone).not.toHaveBeenCalled();
  });

  it('propagates a failing re-read instead of swallowing the delete failure', async () => {
    await expect(
      deleteConfirmed(
        async () => ({ data: null, errors: UNAUTH }),
        async () => {
          throw new Error('read failed');
        },
        'd',
      ),
    ).rejects.toThrow('read failed');
  });
});

describe('row mappers', () => {
  it('toBand normalises null owner and null arrays, and drops non-string array entries', () => {
    const row = {
      ...bandRow(),
      owner: null,
      deletedAt: undefined,
      setListIds: ['a', null, 'b'],
      archivedSetListIds: null,
      bannedSubs: undefined,
      hiddenSongIds: [null],
    } as unknown as BandRow;
    expect(toBand(row)).toEqual({
      id: 'band-1',
      owner: '',
      name: 'The Band',
      inviteCode: 'ABCDEFGHJK',
      deletedAt: null,
      version: 1,
      setListIds: ['a', 'b'],
      archivedSetListIds: [],
      bannedSubs: [],
      hiddenSongIds: [],
      sharedSetListIds: [],
    });
  });

  it('toBand maps a null, undefined or absent sharedSetListIds to [] and keeps real ids', () => {
    expect(toBand({ ...bandRow(), sharedSetListIds: null } as unknown as BandRow).sharedSetListIds).toEqual([]);
    expect(toBand({ ...bandRow(), sharedSetListIds: undefined } as unknown as BandRow).sharedSetListIds).toEqual([]);
    const { sharedSetListIds: _omitted, ...withoutField } = bandRow();
    void _omitted;
    expect(toBand(withoutField as unknown as BandRow).sharedSetListIds).toEqual([]);
    expect(toBand(bandRow({ sharedSetListIds: ['sl-1', null, 'sl-2'] as unknown as string[] })).sharedSetListIds).toEqual([
      'sl-1',
      'sl-2',
    ]);
  });

  it('toBand keeps a real deletedAt and populated arrays', () => {
    const out = toBand(bandRow({ deletedAt: '2026-02-01T00:00:00Z', bannedSubs: ['s1', 's2'] }));
    expect(out.deletedAt).toBe('2026-02-01T00:00:00Z');
    expect(out.bannedSubs).toEqual(['s1', 's2']);
  });

  it('toSong maps absent optional fields to null but keeps falsy real values', () => {
    const base = {
      id: 's1',
      owner: null,
      bandId: 'b',
      setListId: 'sl',
      title: 'T',
      artist: null,
      key: undefined,
      bpm: null,
      notes: null,
      songUrl: undefined,
      tabUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    } as unknown as Parameters<typeof toSong>[0];
    expect(toSong(base)).toEqual({
      id: 's1',
      owner: '',
      bandId: 'b',
      setListId: 'sl',
      title: 'T',
      artist: null,
      key: null,
      bpm: null,
      notes: null,
      songUrl: null,
      tabUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });
    // ?? (not ||) so a 0 / empty string coming from the API is preserved for the validators to judge.
    const falsy = toSong({ ...base, bpm: 0, notes: '', artist: '' } as unknown as Parameters<typeof toSong>[0]);
    expect(falsy.bpm).toBe(0);
    expect(falsy.notes).toBe('');
    expect(falsy.artist).toBe('');
    // Real stored links pass straight through.
    const linked = toSong({ ...base, songUrl: 'https://a.example/x', tabUrl: 'https://b.example/y' } as unknown as Parameters<typeof toSong>[0]);
    expect(linked.songUrl).toBe('https://a.example/x');
    expect(linked.tabUrl).toBe('https://b.example/y');
  });

  it('toSetList maps a null owner and null archivedAt', () => {
    const row = { id: 'sl', owner: null, bandId: 'b', name: 'Main', archivedAt: undefined } as unknown as Parameters<
      typeof toSetList
    >[0];
    expect(toSetList(row)).toEqual({ id: 'sl', owner: '', bandId: 'b', name: 'Main', archivedAt: null });
    expect(toSetList({ ...row, archivedAt: '2026-01-01T00:00:00Z' }).archivedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('toMember and toVote copy exactly the fields the client reads', () => {
    const member = { bandId: 'b', owner: 'u', displayName: 'Al', createdAt: 'c', extra: 1 } as unknown as Parameters<
      typeof toMember
    >[0];
    expect(toMember(member)).toEqual({ bandId: 'b', owner: 'u', displayName: 'Al', createdAt: 'c' });
    const vote = {
      songId: 's',
      owner: 'u',
      value: 'up',
      bandId: 'b',
      setListId: 'sl',
      createdAt: 'c',
      updatedAt: 'u2',
      extra: 1,
    } as unknown as Parameters<typeof toVote>[0];
    expect(toVote(vote)).toEqual({
      songId: 's',
      owner: 'u',
      value: 'up',
      bandId: 'b',
      setListId: 'sl',
      createdAt: 'c',
      updatedAt: 'u2',
    });
  });
});

describe('getBand', () => {
  it('returns the mapped band, or null when the row does not exist', async () => {
    m.models.Band.get.mockResolvedValueOnce({ data: bandRow({ name: 'X' }) });
    expect((await getBand('band-1'))?.name).toBe('X');
    m.models.Band.get.mockResolvedValueOnce({ data: null });
    expect(await getBand('band-1')).toBeNull();
  });

  it('throws on API errors rather than reporting "not found" (callers fail closed)', async () => {
    m.models.Band.get.mockResolvedValueOnce({ data: null, errors: [{ message: 'transient' }] });
    await expect(getBand('band-1')).rejects.toThrow('getBand: transient');
  });
});

describe('tombstoneSetList', () => {
  it('scrubs the name and sets archivedAt', async () => {
    m.models.SetList.update.mockResolvedValueOnce({ data: {} });
    await tombstoneSetList('sl-1', 'Archived');
    const arg = m.models.SetList.update.mock.calls[0][0] as { id: string; name: string; archivedAt: string };
    expect(arg.id).toBe('sl-1');
    expect(arg.name).toBe('Archived');
    expect(Number.isNaN(Date.parse(arg.archivedAt))).toBe(false);
  });

  it('tolerates a failed condition (already tombstoned) but not other errors', async () => {
    m.models.SetList.update.mockResolvedValueOnce({ data: null, errors: CONFLICT });
    await expect(tombstoneSetList('sl-1', 'Archived')).resolves.toBeUndefined();
    m.models.SetList.update.mockResolvedValueOnce({ data: null, errors: UNAUTH });
    await expect(tombstoneSetList('sl-1', 'Archived')).rejects.toThrow('archiveSetList');
  });
});

describe('withKeyLock', () => {
  const deferred = <T = void>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  it('runs tasks for the same key strictly one after another, in call order', async () => {
    const log: string[] = [];
    const gate = deferred();
    const a = withKeyLock('k-order', async () => {
      log.push('a:start');
      await gate.promise;
      log.push('a:end');
      return 'A';
    });
    const b = withKeyLock('k-order', async () => {
      log.push('b:start');
      return 'B';
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(['a:start']);
    gate.resolve();
    expect(await Promise.all([a, b])).toEqual(['A', 'B']);
    expect(log).toEqual(['a:start', 'a:end', 'b:start']);
  });

  it('does not serialise different keys', async () => {
    const gate = deferred();
    const started: string[] = [];
    const a = withKeyLock('k-x', async () => {
      started.push('x');
      await gate.promise;
    });
    const b = withKeyLock('k-y', async () => {
      started.push('y');
    });
    await b;
    expect(started).toEqual(['x', 'y']);
    gate.resolve();
    await a;
  });

  it('a failing task rejects its own caller but does not block or poison the next one', async () => {
    const failing = withKeyLock('k-fail', async () => {
      throw new Error('first failed');
    });
    const next = withKeyLock('k-fail', async () => 'ok');
    await expect(failing).rejects.toThrow('first failed');
    await expect(next).resolves.toBe('ok');
  });

  it('the failure of one queued task is not an unhandled rejection of the lock tail', async () => {
    const unhandled = vi.fn();
    // The app's tsconfig has no Node types; this test only needs these two methods.
    const nodeProcess = (globalThis as unknown as {
      process: { on(event: string, fn: () => void): void; off(event: string, fn: () => void): void };
    }).process;
    nodeProcess.on('unhandledRejection', unhandled);
    try {
      await withKeyLock('k-unhandled', async () => 1);
      await expect(
        withKeyLock('k-unhandled', async () => {
          throw new Error('x');
        }),
      ).rejects.toThrow('x');
      await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      nodeProcess.off('unhandledRejection', unhandled);
    }
  });

  it('cleans up after itself: a later call on the same key starts immediately once the queue drained', async () => {
    await withKeyLock('k-clean', async () => 1);
    await new Promise((r) => setTimeout(r, 0));
    const log: string[] = [];
    const p = withKeyLock('k-clean', async () => {
      log.push('ran');
    });
    // The task is chained on an already-resolved promise, so it starts within a couple of microtasks.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(['ran']);
    await p;
  });

  it('a call queued behind a slow task still runs after it even when a third key interleaves', async () => {
    const gate = deferred();
    const order: number[] = [];
    const first = withKeyLock('k-three', async () => {
      await gate.promise;
      order.push(1);
    });
    const second = withKeyLock('k-three', async () => {
      order.push(2);
    });
    const third = withKeyLock('k-three', async () => {
      order.push(3);
    });
    gate.resolve();
    await Promise.all([first, second, third]);
    expect(order).toEqual([1, 2, 3]);
  });
});

describe('updateBand', () => {
  const echo = (base: BandRow = bandRow()) => {
    let current = { ...base };
    m.graphql.mockImplementation(async ({ variables }: { variables: { input: Record<string, unknown> } }) => {
      current = { ...current, ...variables.input } as BandRow;
      return { data: { updateBand: current } };
    });
    m.models.Band.get.mockImplementation(async () => ({ data: current }));
    return () => current;
  };

  it('requires sign-in before reading or writing anything', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(updateBand('band-1', () => ({ name: 'x' }))).rejects.toBeInstanceOf(NotSignedInError);
    expect(m.models.Band.get).not.toHaveBeenCalled();
    expect(m.graphql).not.toHaveBeenCalled();
  });

  it('passes the FRESH row to the mutator and returns the updated band', async () => {
    echo(bandRow({ version: 7, name: 'Fresh' }));
    const mutate = vi.fn((fresh: { name: string }) => ({ name: `${fresh.name}!` }));
    const out = await updateBand('band-1', mutate);
    expect(mutate.mock.calls[0][0]).toMatchObject({ id: 'band-1', name: 'Fresh', version: 7 });
    expect(out.name).toBe('Fresh!');
    expect(out.version).toBe(8);
  });

  it('returns the fresh band unchanged, without writing, when the mutator returns null', async () => {
    echo(bandRow({ version: 3 }));
    const out = await updateBand('band-1', () => null);
    expect(out.version).toBe(3);
    expect(m.graphql).not.toHaveBeenCalled();
  });

  it('throws "Band not found" when the row is missing', async () => {
    m.models.Band.get.mockResolvedValue({ data: null });
    await expect(updateBand('band-1', () => ({ name: 'x' }))).rejects.toThrow('Band not found');
    expect(m.graphql).not.toHaveBeenCalled();
  });

  it('refuses a tombstoned band unless allowDeleted is set', async () => {
    echo(bandRow({ deletedAt: '2026-02-01T00:00:00Z' }));
    const mutate = vi.fn(() => ({ name: 'x' }));
    await expect(updateBand('band-1', mutate)).rejects.toThrow('This band was deleted');
    expect(mutate).not.toHaveBeenCalled();
    expect(m.graphql).not.toHaveBeenCalled();
    const out = await updateBand('band-1', mutate, { allowDeleted: true });
    expect(out.name).toBe('x');
    expect(out.deletedAt).toBe('2026-02-01T00:00:00Z');
  });

  it('honours a custom attempts limit on repeated conflicts', async () => {
    m.models.Band.get.mockResolvedValue({ data: bandRow() });
    m.graphql.mockRejectedValue({ errors: CONFLICT });
    await expect(updateBand('band-1', () => ({ name: 'x' }), { attempts: 5 })).rejects.toBeInstanceOf(BandConflictError);
    expect(m.graphql).toHaveBeenCalledTimes(5);
    expect(m.models.Band.get).toHaveBeenCalledTimes(5);
  });

  it('with attempts: 1 a conflict surfaces immediately (no retry)', async () => {
    m.models.Band.get.mockResolvedValue({ data: bandRow() });
    m.graphql.mockRejectedValue({ errors: CONFLICT });
    await expect(updateBand('band-1', () => ({ name: 'x' }), { attempts: 1 })).rejects.toBeInstanceOf(BandConflictError);
    expect(m.graphql).toHaveBeenCalledTimes(1);
  });

  it('with attempts: 0 it never writes and reports a conflict', async () => {
    m.models.Band.get.mockResolvedValue({ data: bandRow() });
    await expect(updateBand('band-1', () => ({ name: 'x' }), { attempts: 0 })).rejects.toBeInstanceOf(BandConflictError);
    expect(m.graphql).not.toHaveBeenCalled();
  });

  it('recognises a conflict that comes back as a resolved result (not just a rejection)', async () => {
    m.models.Band.get
      .mockResolvedValueOnce({ data: bandRow({ version: 1 }) })
      .mockResolvedValueOnce({ data: bandRow({ version: 2 }) });
    m.graphql
      .mockResolvedValueOnce({ data: { updateBand: null }, errors: CONFLICT })
      .mockImplementationOnce(async ({ variables }: { variables: { input: Record<string, unknown> } }) => ({
        data: { updateBand: bandRow({ ...(variables.input as Partial<BandRow>) }) },
      }));
    const out = await updateBand('band-1', () => ({ name: 'Retried' }));
    expect(out.name).toBe('Retried');
    expect(m.graphql).toHaveBeenCalledTimes(2);
    expect(m.graphql.mock.calls[1][0].variables.condition).toEqual({ version: { eq: 2 } });
  });

  it('does not retry (or swallow) a non-conflict failure', async () => {
    m.models.Band.get.mockResolvedValue({ data: bandRow() });
    m.graphql.mockRejectedValue({ errors: UNAUTH });
    await expect(updateBand('band-1', () => ({ name: 'x' }))).rejects.toThrow('Not Authorized');
    expect(m.graphql).toHaveBeenCalledTimes(1);
  });

  it('wraps a thrown value without an errors array into a readable error', async () => {
    m.models.Band.get.mockResolvedValue({ data: bandRow() });
    m.graphql.mockRejectedValue(new Error('network down'));
    await expect(updateBand('band-1', () => ({ name: 'x' }))).rejects.toThrow('updateBand: Error: network down');
    m.graphql.mockRejectedValue({ errors: [] });
    await expect(updateBand('band-1', () => ({ name: 'x' }))).rejects.toThrow('updateBand: [object Object]');
  });

  it('fails when the mutation reports success but returns no band', async () => {
    m.models.Band.get.mockResolvedValue({ data: bandRow() });
    m.graphql.mockResolvedValue({ data: { updateBand: null } });
    await expect(updateBand('band-1', () => ({ name: 'x' }))).rejects.toThrow('updateBand: no data returned');
    m.graphql.mockResolvedValue({ data: null });
    await expect(updateBand('band-1', () => ({ name: 'x' }))).rejects.toThrow('updateBand: no data returned');
  });

  it('never sends fields the mutator did not patch (a stale writer cannot un-tombstone a band)', async () => {
    echo(bandRow({ version: 2 }));
    await updateBand('band-1', () => ({ hiddenSongIds: ['s1'] }));
    const { input } = m.graphql.mock.calls[0][0].variables as { input: Record<string, unknown> };
    expect(Object.keys(input).sort()).toEqual(['hiddenSongIds', 'id', 'version']);
    expect(input).not.toHaveProperty('deletedAt');
    expect(input).not.toHaveProperty('name');
  });

  it('runs concurrent updates to different bands in parallel', async () => {
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    m.models.Band.get.mockImplementation(async ({ id }: { id: string }) => {
      started.push(id);
      return { data: bandRow({ id }) };
    });
    m.graphql.mockImplementation(async ({ variables }: { variables: { input: { id: string } } }) => {
      if (variables.input.id === 'band-a') await gate;
      return { data: { updateBand: bandRow({ id: variables.input.id }) } };
    });
    const a = updateBand('band-a', () => ({ name: 'A' }));
    const b = updateBand('band-b', () => ({ name: 'B' }));
    await b;
    expect(started).toContain('band-b');
    release();
    await a;
  });
});

describe('resolveReader', () => {
  it('a signed-in caller reads with their sub and the userPool mode', async () => {
    vi.mocked(getSignedInSub).mockResolvedValue('sub-abc');
    await expect(resolveReader()).resolves.toEqual({ sub: 'sub-abc', authMode: 'userPool' });
  });

  it('a signed-out caller has no sub and reads as the identityPool guest', async () => {
    vi.mocked(getSignedInSub).mockResolvedValue(null);
    await expect(resolveReader()).resolves.toEqual({ sub: null, authMode: 'identityPool' });
  });

  it('does not go through requireAuth (a signed-out visitor must not fail)', async () => {
    vi.mocked(getSignedInSub).mockResolvedValue(null);
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(resolveReader()).resolves.toMatchObject({ authMode: 'identityPool' });
    expect(isAuthenticated).not.toHaveBeenCalled();
  });
});

describe('readArgs', () => {
  it('is empty without a mode (the client default applies)', () => {
    expect(readArgs()).toEqual([]);
    expect(readArgs(undefined)).toEqual([]);
  });

  it('spreads into a single options argument naming the mode', () => {
    expect(readArgs('identityPool')).toEqual([{ authMode: 'identityPool' }]);
    expect(readArgs('userPool')).toEqual([{ authMode: 'userPool' }]);
  });
});

describe('getBand with an auth mode', () => {
  it('passes no options without a mode, and the mode when given', async () => {
    m.models.Band.get.mockResolvedValue({ data: bandRow() });
    await getBand('band-1');
    expect(m.models.Band.get).toHaveBeenLastCalledWith({ id: 'band-1' });
    await getBand('band-1', 'identityPool');
    expect(m.models.Band.get).toHaveBeenLastCalledWith({ id: 'band-1' }, { authMode: 'identityPool' });
  });
});

describe('getSetListRow', () => {
  const row = { id: 'sl-1', owner: 'sub-owner', bandId: 'band-1', name: 'Main', archivedAt: null };

  it('returns the mapped row, or null when it does not exist', async () => {
    m.models.SetList.get.mockResolvedValueOnce({ data: row });
    expect(await getSetListRow('sl-1')).toEqual({ id: 'sl-1', owner: 'sub-owner', bandId: 'band-1', name: 'Main', archivedAt: null });
    m.models.SetList.get.mockResolvedValueOnce({ data: null });
    expect(await getSetListRow('sl-1')).toBeNull();
  });

  it('uses the client default without a mode and an explicit mode for a resolved reader', async () => {
    m.models.SetList.get.mockResolvedValue({ data: row });
    await getSetListRow('sl-1');
    expect(m.models.SetList.get).toHaveBeenLastCalledWith({ id: 'sl-1' });
    await getSetListRow('sl-1', 'identityPool');
    expect(m.models.SetList.get).toHaveBeenLastCalledWith({ id: 'sl-1' }, { authMode: 'identityPool' });
  });

  it('throws on API errors rather than reporting "not found" (callers fail closed)', async () => {
    m.models.SetList.get.mockResolvedValue({ data: null, errors: [{ message: 'transient' }] });
    await expect(getSetListRow('sl-1')).rejects.toThrow('getSetList: transient');
  });
});

describe('listRoster', () => {
  const member = (owner: string) => ({ bandId: 'band-1', owner, displayName: owner, createdAt: 'c' });

  it('follows pages and maps rows, with no authMode by default', async () => {
    m.models.Member.listMemberByBandId
      .mockResolvedValueOnce({ data: [member('a')], nextToken: 't1' })
      .mockResolvedValueOnce({ data: [member('b')], nextToken: null });
    const res = await listRoster('band-1');
    expect(res.rows.map((r) => r.owner)).toEqual(['a', 'b']);
    expect(res.incomplete).toBe(false);
    expect(m.models.Member.listMemberByBandId.mock.calls[0]).toEqual([{ bandId: 'band-1' }, { limit: 250, nextToken: undefined }]);
  });

  it('defaults to a cap of 4 pages and reports incomplete', async () => {
    m.models.Member.listMemberByBandId.mockResolvedValue({ data: [member('a')], nextToken: 'more' });
    const res = await listRoster('band-1');
    expect(m.models.Member.listMemberByBandId).toHaveBeenCalledTimes(4);
    expect(res.incomplete).toBe(true);
  });

  it('honours a custom page cap and passes the auth mode to every page', async () => {
    m.models.Member.listMemberByBandId.mockResolvedValue({ data: [member('a')], nextToken: 'more' });
    const res = await listRoster('band-1', { authMode: 'identityPool', maxPages: 2 });
    expect(m.models.Member.listMemberByBandId).toHaveBeenCalledTimes(2);
    for (const call of m.models.Member.listMemberByBandId.mock.calls) expect(call[1]).toMatchObject({ authMode: 'identityPool' });
    expect(res.incomplete).toBe(true);
  });

  it('fails closed on API errors', async () => {
    m.models.Member.listMemberByBandId.mockResolvedValue({ data: null, errors: [{ message: 'gsi down' }] });
    await expect(listRoster('band-1')).rejects.toThrow('gsi down');
  });
});
