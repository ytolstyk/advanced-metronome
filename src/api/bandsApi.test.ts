import { beforeEach, describe, expect, it, vi } from 'vitest';

const ME = 'sub-me';

const { m } = vi.hoisted(() => {
  const model = () => ({
    get: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  });
  const m = {
    Band: model(),
    BandInvite: model(),
    MyBand: model(),
    Member: { ...model(), listMemberByBandId: vi.fn() },
    SetList: model(),
    graphql: vi.fn(),
  };
  return { m };
});

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({ models: m, graphql: m.graphql })),
}));
vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(async () => true),
  getCurrentUserSub: vi.fn(async () => 'sub-me'),
}));

import {
  banMember,
  createBand,
  deleteBand,
  dismissBand,
  ensureMyBandRow,
  hideSong,
  InviteError,
  joinBand,
  loadBandView,
  loadMyBands,
  lookupInvite,
  previewBand,
  pruneDeadBands,
  renameBand,
  resetInviteCode,
  unbanMember,
} from './bandsApi';
import { BandConflictError } from './bandsShared';
import { isAuthenticated } from './authUtils';

const CONFLICT = [{ errorType: 'DynamoDB:ConditionalCheckFailedException', message: 'conditional' }];
const UNAUTH = [{ errorType: 'Unauthorized', message: 'Not Authorized' }];

const bandRow = (over: Record<string, unknown> = {}) => ({
  id: 'band-1',
  owner: 'sub-owner',
  name: 'The Band',
  inviteCode: 'ABCDEFGHJK',
  deletedAt: null,
  version: 1,
  setListIds: ['sl-1'],
  archivedSetListIds: [],
  bannedSubs: [],
  hiddenSongIds: [],
  sharedSetListIds: [],
  ...over,
});
const memberRow = (owner: string, over: Record<string, unknown> = {}) => ({
  bandId: 'band-1',
  owner,
  displayName: owner,
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});
const setListRow = (over: Record<string, unknown> = {}) => ({
  id: 'sl-1',
  owner: 'sub-owner',
  bandId: 'band-1',
  name: 'Main Set',
  archivedAt: null,
  ...over,
});

function resetMocks() {
  vi.clearAllMocks();
  vi.mocked(isAuthenticated).mockResolvedValue(true);
  for (const model of [m.Band, m.BandInvite, m.MyBand, m.Member, m.SetList]) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  m.graphql.mockReset();
  m.Member.listMemberByBandId.mockResolvedValue({ data: [], nextToken: null });
  m.MyBand.list.mockResolvedValue({ data: [], nextToken: null });
  m.Member.get.mockResolvedValue({ data: null });
  m.SetList.get.mockResolvedValue({ data: setListRow() });
  m.Band.get.mockResolvedValue({ data: bandRow() });
}

/** graphql mock that echoes the patched fields back as the updated Band. */
function echoBandUpdates(base = bandRow()) {
  let current = { ...base };
  m.graphql.mockImplementation(async ({ variables }: { variables: { input: Record<string, unknown> } }) => {
    current = { ...current, ...variables.input };
    return { data: { updateBand: current } };
  });
  m.Band.get.mockImplementation(async () => ({ data: current }));
}

beforeEach(resetMocks);

describe('createBand', () => {
  it('writes everything else first (in parallel) and the Band LAST, then returns it', async () => {
    const order: string[] = [];
    m.SetList.create.mockImplementation(async (i: { id: string; name: string }) => {
      order.push('setList');
      return { data: { ...setListRow(), ...i } };
    });
    m.BandInvite.create.mockImplementation(async () => {
      order.push('invite');
      return { data: {} };
    });
    m.MyBand.create.mockImplementation(async () => {
      order.push('myBand');
      return { data: {} };
    });
    m.Member.create.mockImplementation(async () => {
      order.push('member');
      return { data: {} };
    });
    m.Band.create.mockImplementation(async (i: Record<string, unknown>) => {
      order.push('band');
      return { data: bandRow({ ...i, owner: ME }) }; // the server fills in the owner
    });

    const band = await createBand('  The Band ', 'Alice');
    expect(order.at(-1)).toBe('band');
    expect(new Set(order.slice(0, -1))).toEqual(new Set(['setList', 'invite', 'myBand', 'member']));
    const bandInput = m.Band.create.mock.calls[0][0];
    const setListInput = m.SetList.create.mock.calls[0][0];
    expect(bandInput.version).toBe(1);
    expect(bandInput.setListIds).toEqual([setListInput.id]);
    expect(setListInput.name).toBe('Main Set');
    expect(bandInput.inviteCode).toBe(m.BandInvite.create.mock.calls[0][0].code);
    expect(m.Member.create.mock.calls[0][0]).toMatchObject({ owner: ME, displayName: 'Alice' });
    expect(m.MyBand.create.mock.calls[0][0]).toMatchObject({ owner: ME });
    expect(band).toMatchObject({ name: 'The Band', owner: ME, version: 1, inviteCode: bandInput.inviteCode });
  });

  it('creates the Band with nothing publicly shared (sharing is opt-in by the owner)', async () => {
    m.SetList.create.mockResolvedValue({ data: setListRow() });
    m.BandInvite.create.mockResolvedValue({ data: {} });
    m.MyBand.create.mockResolvedValue({ data: {} });
    m.Member.create.mockResolvedValue({ data: {} });
    m.Band.create.mockImplementation(async (i: Record<string, unknown>) => ({ data: bandRow({ ...i, owner: ME }) }));
    const band = await createBand('The Band', 'Alice');
    expect(m.Band.create.mock.calls[0][0]).toHaveProperty('sharedSetListIds', []);
    expect(band.sharedSetListIds).toEqual([]);
  });

  it('removes its own member rows again if the final Band write fails (no inert leftovers)', async () => {
    m.SetList.create.mockResolvedValue({ data: setListRow() });
    m.BandInvite.create.mockResolvedValue({ data: {} });
    m.MyBand.create.mockResolvedValue({ data: {} });
    m.Member.create.mockResolvedValue({ data: {} });
    m.Band.create.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    m.Member.delete.mockResolvedValue({ data: {} });
    m.MyBand.delete.mockResolvedValue({ data: {} });
    await expect(createBand('Band', 'Alice')).rejects.toThrow('throttled');
    const bandId = m.Band.create.mock.calls[0][0].id;
    expect(m.Member.delete).toHaveBeenCalledWith({ bandId, owner: ME });
    expect(m.MyBand.delete).toHaveBeenCalledWith({ owner: ME, bandId });
  });

  it('keeps a 40-character band name intact (regression: names were cut to 30)', async () => {
    m.SetList.create.mockResolvedValue({ data: setListRow() });
    m.BandInvite.create.mockResolvedValue({ data: {} });
    m.MyBand.create.mockResolvedValue({ data: {} });
    m.Member.create.mockResolvedValue({ data: {} });
    m.Band.create.mockImplementation(async (i: Record<string, unknown>) => ({ data: bandRow(i) }));
    const forty = 'The Fabulous Thunderbirds of Springfield!!';
    await createBand(forty.slice(0, 40), 'Alice');
    expect(m.Band.create.mock.calls[0][0].name).toBe(forty.slice(0, 40));
  });

  it('retries the invite on a key collision with a new code', async () => {
    m.SetList.create.mockResolvedValue({ data: setListRow() });
    m.BandInvite.create.mockResolvedValueOnce({ data: null, errors: CONFLICT }).mockResolvedValue({ data: {} });
    m.MyBand.create.mockResolvedValue({ data: {} });
    m.Member.create.mockResolvedValue({ data: {} });
    m.Band.create.mockImplementation(async (i: Record<string, unknown>) => ({ data: bandRow(i) }));
    await createBand('Band', 'Alice');
    expect(m.BandInvite.create).toHaveBeenCalledTimes(2);
    const [first, second] = m.BandInvite.create.mock.calls.map((c) => c[0].code);
    expect(first).not.toBe(second);
    expect(m.Band.create.mock.calls[0][0].inviteCode).toBe(second);
  });

  it('never writes the Band if an earlier step fails', async () => {
    m.SetList.create.mockResolvedValue({ data: setListRow() });
    m.BandInvite.create.mockResolvedValue({ data: {} });
    m.MyBand.create.mockResolvedValue({ data: null, errors: UNAUTH });
    m.Member.create.mockResolvedValue({ data: {} });
    await expect(createBand('Band', 'Alice')).rejects.toThrow();
    expect(m.Band.create).not.toHaveBeenCalled();
  });

  it('refuses to create when it could not check the owned-band cap (a failed read never passes the cap)', async () => {
    m.MyBand.list.mockResolvedValue({ data: [{ owner: ME, bandId: 'b1' }], nextToken: null });
    m.Band.get.mockResolvedValue({ data: null, errors: [{ message: 'transient' }] });
    await expect(createBand('Band', 'Alice')).rejects.toThrow('Couldn’t check your bands');
    expect(m.SetList.create).not.toHaveBeenCalled();
    expect(m.Band.create).not.toHaveBeenCalled();
  });

  it('rejects empty names and enforces the owned-band cap', async () => {
    await expect(createBand('   ', 'Alice')).rejects.toThrow('name');
    await expect(createBand('Band', ' ')).rejects.toThrow('display name');

    m.MyBand.list.mockResolvedValue({
      data: Array.from({ length: 10 }, (_, i) => ({ owner: ME, bandId: `b${i}` })),
      nextToken: null,
    });
    m.Band.get.mockImplementation(async ({ id }: { id: string }) => ({ data: bandRow({ id, owner: ME }) }));
    await expect(createBand('Band', 'Alice')).rejects.toThrow('at most 10');
    expect(m.SetList.create).not.toHaveBeenCalled();
  });

  it('requires sign-in', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(createBand('Band', 'Alice')).rejects.toThrow('Not authenticated');
  });
});

describe('lookupInvite', () => {
  const invite = (over: Record<string, unknown> = {}) => ({
    data: { code: 'ABCDEFGHJK', bandId: 'band-1', revokedAt: null, ...over },
  });
  const reason = async (input: string) => {
    try {
      await lookupInvite(input);
    } catch (e) {
      return (e as InviteError).reason;
    }
    return 'ok';
  };

  it('rejects malformed codes without touching the API', async () => {
    expect(await reason('nope')).toBe('invalid-code');
    expect(m.BandInvite.get).not.toHaveBeenCalled();
  });

  it('rejects unknown, revoked and mismatched invites', async () => {
    m.BandInvite.get.mockResolvedValue({ data: null });
    expect(await reason('ABCDE-FGHJK')).toBe('not-found');

    m.BandInvite.get.mockResolvedValue(invite({ revokedAt: '2026-02-01T00:00:00Z' }));
    expect(await reason('ABCDE-FGHJK')).toBe('revoked');

    // forged invite: row exists, but the band's own code differs
    m.BandInvite.get.mockResolvedValue(invite());
    m.Band.get.mockResolvedValue({ data: bandRow({ inviteCode: 'ZZZZZZZZZZ' }) });
    expect(await reason('ABCDE-FGHJK')).toBe('revoked');
  });

  it('rejects deleted bands, missing bands and banned users', async () => {
    m.BandInvite.get.mockResolvedValue(invite());
    m.Band.get.mockResolvedValue({ data: null });
    expect(await reason('abcde fghjk')).toBe('not-found');

    m.Band.get.mockResolvedValue({ data: bandRow({ deletedAt: '2026-02-01T00:00:00Z' }) });
    expect(await reason('ABCDE-FGHJK')).toBe('deleted');

    m.Band.get.mockResolvedValue({ data: bandRow({ bannedSubs: [ME] }) });
    expect(await reason('ABCDE-FGHJK')).toBe('banned');
  });

  it('rejects joining a full band but lets existing members through', async () => {
    m.BandInvite.get.mockResolvedValue(invite());
    const full = Array.from({ length: 15 }, (_, i) => memberRow(`sub-${i}`));
    m.Member.listMemberByBandId.mockResolvedValue({ data: full, nextToken: null });
    expect(await reason('ABCDE-FGHJK')).toBe('full');

    m.Member.listMemberByBandId.mockResolvedValue({ data: [...full.slice(0, 14), memberRow(ME)], nextToken: null });
    await expect(lookupInvite('ABCDE-FGHJK')).resolves.toMatchObject({ alreadyMember: true, memberCount: 15 });
  });

  it('returns the preview for a good code', async () => {
    m.BandInvite.get.mockResolvedValue(invite());
    m.Member.listMemberByBandId.mockResolvedValue({ data: [memberRow('sub-owner')], nextToken: null });
    await expect(lookupInvite(' abcde-fghjk ')).resolves.toEqual({
      bandId: 'band-1',
      bandName: 'The Band',
      memberCount: 1,
      alreadyMember: false,
    });
  });
});

describe('joinBand', () => {
  it('creates the member and my-band rows', async () => {
    m.Member.create.mockResolvedValue({ data: {} });
    m.MyBand.create.mockResolvedValue({ data: {} });
    await joinBand('band-1', '  Bob  ');
    expect(m.Member.create).toHaveBeenCalledWith({ bandId: 'band-1', owner: ME, displayName: 'Bob' });
    expect(m.MyBand.create).toHaveBeenCalledWith({ owner: ME, bandId: 'band-1' });
  });

  it('is idempotent: "already exists" counts as success', async () => {
    m.Member.create.mockResolvedValue({ data: null, errors: CONFLICT });
    m.MyBand.create.mockResolvedValue({ data: null, errors: CONFLICT });
    await expect(joinBand('band-1', 'Bob')).resolves.toBeUndefined();
  });

  it('surfaces real errors', async () => {
    m.Member.create.mockResolvedValue({ data: null, errors: UNAUTH });
    m.MyBand.create.mockResolvedValue({ data: {} });
    await expect(joinBand('band-1', 'Bob')).rejects.toThrow('createMember');
  });

  it('writes the member and my-band rows in parallel (both idempotent)', async () => {
    const started: string[] = [];
    m.Member.create.mockImplementation(async () => { started.push('member'); await Promise.resolve(); return { data: {} }; });
    m.MyBand.create.mockImplementation(async () => { started.push('myBand'); await Promise.resolve(); return { data: {} }; });
    await joinBand('band-1', 'Bob');
    expect(started).toEqual(['member', 'myBand']);
  });

  it('refuses banned users and empty names without writing', async () => {
    m.Band.get.mockResolvedValue({ data: bandRow({ bannedSubs: [ME] }) });
    await expect(joinBand('band-1', 'Bob')).rejects.toMatchObject({ reason: 'banned' });
    m.Band.get.mockResolvedValue({ data: bandRow() });
    await expect(joinBand('band-1', '  ')).rejects.toThrow('display name');
    expect(m.Member.create).not.toHaveBeenCalled();
  });
});

describe('loadBandView', () => {
  it('reports not-found, deleted and removed', async () => {
    m.Band.get.mockResolvedValue({ data: null });
    expect(await loadBandView('band-1')).toEqual({ status: 'not-found' });
    m.Band.get.mockResolvedValue({ data: bandRow({ deletedAt: '2026-02-01T00:00:00Z' }) });
    expect(await loadBandView('band-1')).toEqual({ status: 'deleted' });
    m.Band.get.mockResolvedValue({ data: bandRow({ bannedSubs: [ME] }) });
    expect(await loadBandView('band-1')).toMatchObject({ status: 'removed' });
  });

  it('fails closed on read errors instead of returning an empty band', async () => {
    m.Band.get.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });
    await expect(loadBandView('band-1')).rejects.toThrow('boom');
    m.Band.get.mockResolvedValue({ data: bandRow() });
    m.Member.listMemberByBandId.mockResolvedValue({ data: null, errors: [{ message: 'gsi down' }] });
    await expect(loadBandView('band-1')).rejects.toThrow('gsi down');
  });

  it('validates the roster and merges the caller\'s own row when the GSI lags', async () => {
    m.Member.listMemberByBandId.mockResolvedValue({
      data: [
        memberRow('sub-owner'),
        memberRow('sub-banned'),
        memberRow('sub-x', { bandId: 'other-band' }),
      ],
      nextToken: null,
    });
    m.Band.get.mockResolvedValue({ data: bandRow({ bannedSubs: ['sub-banned'] }) });
    m.Member.get.mockResolvedValue({ data: memberRow(ME, { displayName: 'Me' }) }); // not in the GSI yet
    const res = await loadBandView('band-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.members.map((x) => x.owner).sort()).toEqual([ME, 'sub-owner']);
    expect(res.view.isMember).toBe(true);
    expect(res.view.isOwner).toBe(false);
    expect(res.view.setLists.map((s) => s.id)).toEqual(['sl-1']);
  });

  it('reads no set lists when asked to skip them (pages that only need the roster)', async () => {
    m.Band.get.mockResolvedValue({ data: bandRow({ setListIds: ['sl-1', 'sl-2'] }) });
    m.Member.get.mockResolvedValue({ data: memberRow(ME) });
    m.SetList.get.mockClear();
    const res = await loadBandView('band-1', { skipSetLists: true });
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(m.SetList.get).not.toHaveBeenCalled();
    expect(res.view.setLists).toEqual([]);
    expect(res.view.isMember).toBe(true);
  });

  it('drops set lists that fail validation (forged owner, archived)', async () => {
    m.Band.get.mockResolvedValue({ data: bandRow({ setListIds: ['sl-1', 'sl-2', 'sl-3'] }) });
    m.SetList.get.mockImplementation(async ({ id }: { id: string }) => ({
      data:
        id === 'sl-1'
          ? setListRow()
          : id === 'sl-2'
            ? setListRow({ id, owner: 'sub-mallory' })
            : setListRow({ id, archivedAt: '2026-02-01T00:00:00Z' }),
    }));
    const res = await loadBandView('band-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.setLists.map((s) => s.id)).toEqual(['sl-1']);
  });

  it('treats a non-member as not a member (but the owner always is)', async () => {
    const res = await loadBandView('band-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.isMember).toBe(false);
    m.Band.get.mockResolvedValue({ data: bandRow({ owner: ME }) });
    const own = await loadBandView('band-1');
    if (own.status !== 'ok') throw new Error('expected ok');
    expect(own.view.isOwner && own.view.isMember).toBe(true);
  });
});

describe('loadMyBands', () => {
  const rows = (...ids: string[]) => ({ data: ids.map((bandId) => ({ owner: ME, bandId })), nextToken: null });

  it('lists active and removed bands, and reports tombstoned ones WITHOUT deleting anything', async () => {
    m.MyBand.list.mockResolvedValue(rows('b-active', 'b-removed', 'b-dead', 'b-mine'));
    m.Band.get.mockImplementation(async ({ id }: { id: string }) => ({
      data:
        id === 'b-active'
          ? bandRow({ id, name: 'Bravo' })
          : id === 'b-removed'
            ? bandRow({ id, name: 'Alpha', bannedSubs: [ME] })
            : id === 'b-dead'
              ? bandRow({ id, deletedAt: '2026-02-01T00:00:00Z' })
              : bandRow({ id, name: 'Charlie', owner: ME }),
    }));

    const res = await loadMyBands();
    expect(res.entries.map((e) => [e.band.name, e.status, e.isOwner])).toEqual([
      ['Alpha', 'removed', false],
      ['Bravo', 'active', false],
      ['Charlie', 'active', true],
    ]);
    expect(res.deadBandIds).toEqual(['b-dead']);
    expect(res.failedCount).toBe(0);
    expect(m.MyBand.delete).not.toHaveBeenCalled(); // a read never writes
    expect(m.Member.delete).not.toHaveBeenCalled();
  });

  it('counts bands whose read failed instead of silently dropping them', async () => {
    m.MyBand.list.mockResolvedValue(rows('ok', 'bad1', 'bad2'));
    m.Band.get.mockImplementation(async ({ id }: { id: string }) =>
      id === 'ok' ? { data: bandRow({ id }) } : { data: null, errors: [{ message: 'transient' }] },
    );
    const res = await loadMyBands();
    expect(res.entries.map((e) => e.band.id)).toEqual(['ok']);
    expect(res.failedCount).toBe(2);
  });

  it('neither shows nor prunes a missing band row (the create may be half-finished)', async () => {
    m.MyBand.list.mockResolvedValue(rows('b1'));
    m.Band.get.mockResolvedValue({ data: null });
    expect(await loadMyBands()).toEqual({ entries: [], failedCount: 0, deadBandIds: [] });
  });

  it('reads many bands with bounded parallelism', async () => {
    m.MyBand.list.mockResolvedValue(rows(...Array.from({ length: 20 }, (_, i) => `b${i}`)));
    let active = 0;
    let peak = 0;
    m.Band.get.mockImplementation(async ({ id }: { id: string }) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return { data: bandRow({ id }) };
    });
    const res = await loadMyBands();
    expect(res.entries).toHaveLength(20);
    expect(peak).toBeLessThanOrEqual(6);
  });

  it('requires sign-in', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(loadMyBands()).rejects.toThrow('Not authenticated');
    expect(m.MyBand.list).not.toHaveBeenCalled();
  });
});

describe('pruneDeadBands / ensureMyBandRow', () => {
  it('drops the caller\'s own rows for each dead band and never throws', async () => {
    m.Member.delete.mockResolvedValue({ data: {} });
    m.MyBand.delete.mockResolvedValueOnce({ data: {} }).mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(pruneDeadBands(['b1', 'b2'])).resolves.toBeUndefined();
    expect(m.Member.delete).toHaveBeenCalledWith({ bandId: 'b1', owner: ME });
    expect(m.MyBand.delete).toHaveBeenCalledWith({ owner: ME, bandId: 'b2' });
  });

  it('repairs a missing my-band row idempotently', async () => {
    m.MyBand.create.mockResolvedValue({ data: null, errors: CONFLICT });
    await expect(ensureMyBandRow('band-1')).resolves.toBeUndefined();
    expect(m.MyBand.create).toHaveBeenCalledWith({ owner: ME, bandId: 'band-1' });
  });
});

describe('dismissBand / leave', () => {
  it('deletes own member and my-band rows and tolerates already-gone rows', async () => {
    m.Member.delete.mockResolvedValue({ data: null, errors: UNAUTH });
    m.MyBand.delete.mockResolvedValue({ data: null, errors: CONFLICT });
    await expect(dismissBand('band-1')).resolves.toBeUndefined();
    expect(m.Member.delete).toHaveBeenCalledWith({ bandId: 'band-1', owner: ME });
    expect(m.MyBand.delete).toHaveBeenCalledWith({ owner: ME, bandId: 'band-1' });
  });

  it('surfaces other delete errors', async () => {
    m.Member.delete.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(dismissBand('band-1')).rejects.toThrow('throttled');
  });
});

describe('owner moderation (version-locked partial updates)', () => {
  it('sends only the patched field, version+1 and a version condition', async () => {
    echoBandUpdates(bandRow({ version: 4 }));
    await banMember('band-1', 'sub-bob');
    expect(m.graphql).toHaveBeenCalledTimes(1);
    const { variables } = m.graphql.mock.calls[0][0];
    expect(variables.input).toEqual({ id: 'band-1', version: 5, bannedSubs: ['sub-bob'] });
    expect(variables.condition).toEqual({ version: { eq: 4 } });
  });

  it('is a no-op (no write) when already applied', async () => {
    echoBandUpdates(bandRow({ bannedSubs: ['sub-bob'], hiddenSongIds: ['s1'] }));
    await banMember('band-1', 'sub-bob');
    await hideSong('band-1', 's1');
    await unbanMember('band-1', 'sub-never-banned');
    expect(m.graphql).not.toHaveBeenCalled();
  });

  it('never bans the owner and enforces the ban cap', async () => {
    echoBandUpdates();
    await expect(banMember('band-1', 'sub-owner')).rejects.toThrow('owner cannot be removed');
    echoBandUpdates(bandRow({ bannedSubs: Array.from({ length: 200 }, (_, i) => `s${i}`) }));
    await expect(banMember('band-1', 'sub-new')).rejects.toThrow('limit');
  });

  it('re-reads and retries once on a version conflict, using the FRESH arrays', async () => {
    m.Band.get
      .mockResolvedValueOnce({ data: bandRow({ version: 1, bannedSubs: [] }) })
      .mockResolvedValueOnce({ data: bandRow({ version: 2, bannedSubs: ['sub-other'] }) });
    m.graphql
      .mockRejectedValueOnce({ errors: CONFLICT })
      .mockImplementationOnce(async ({ variables }) => ({
        data: { updateBand: bandRow({ ...variables.input }) },
      }));
    await banMember('band-1', 'sub-bob');
    expect(m.graphql).toHaveBeenCalledTimes(2);
    expect(m.graphql.mock.calls[1][0].variables.input.bannedSubs).toEqual(['sub-other', 'sub-bob']);
    expect(m.graphql.mock.calls[1][0].variables.condition).toEqual({ version: { eq: 2 } });
  });

  it('gives up with a BandConflictError after repeated conflicts', async () => {
    m.Band.get.mockResolvedValue({ data: bandRow() });
    m.graphql.mockRejectedValue({ errors: CONFLICT });
    await expect(banMember('band-1', 'sub-bob')).rejects.toBeInstanceOf(BandConflictError);
    expect(m.graphql).toHaveBeenCalledTimes(3);
  });

  it('serialises concurrent owner writes for the same band', async () => {
    let current = bandRow({ version: 1 });
    m.Band.get.mockImplementation(async () => ({ data: current }));
    m.graphql.mockImplementation(async ({ variables }: { variables: { input: Record<string, unknown> } }) => {
      await new Promise((r) => setTimeout(r, 5));
      current = { ...current, ...variables.input };
      return { data: { updateBand: current } };
    });
    await Promise.all([banMember('band-1', 'sub-a'), banMember('band-1', 'sub-b'), hideSong('band-1', 's1')]);
    expect(current.bannedSubs.sort()).toEqual(['sub-a', 'sub-b']);
    expect(current.hiddenSongIds).toEqual(['s1']);
    expect(current.version).toBe(4);
  });

  it('surfaces non-conflict mutation errors', async () => {
    m.Band.get.mockResolvedValue({ data: bandRow() });
    m.graphql.mockRejectedValue({ errors: UNAUTH });
    await expect(banMember('band-1', 'sub-bob')).rejects.toThrow('Not Authorized');
  });
});

describe('resetInviteCode', () => {
  it('creates the new invite, updates the band, then retires the old invite (never deletes)', async () => {
    const order: string[] = [];
    m.BandInvite.create.mockImplementation(async () => {
      order.push('create-new');
      return { data: {} };
    });
    m.graphql.mockImplementation(async ({ variables }: { variables: { input: Record<string, unknown> } }) => {
      order.push('update-band');
      return { data: { updateBand: bandRow({ ...variables.input }) } };
    });
    m.BandInvite.update.mockImplementation(async () => {
      order.push('revoke-old');
      return { data: {} };
    });
    const band = await resetInviteCode('band-1');
    expect(order).toEqual(['create-new', 'update-band', 'revoke-old']);
    expect(band.inviteCode).toBe(m.BandInvite.create.mock.calls[0][0].code);
    expect(band.inviteCode).not.toBe('ABCDEFGHJK');
    expect(m.BandInvite.update.mock.calls[0][0]).toMatchObject({ code: 'ABCDEFGHJK' });
    expect(m.BandInvite.delete).not.toHaveBeenCalled();
  });
});

describe('deleteBand (tombstone)', () => {
  it('tombstones set lists while the band is alive, then ONE atomic tombstone+scrub write, then retires the invite last', async () => {
    const order: string[] = [];
    echoBandUpdates(bandRow({ version: 1, setListIds: ['sl-1', 'sl-2'], archivedSetListIds: ['sl-old'], bannedSubs: ['x'], hiddenSongIds: ['h'] }));
    const baseGraphql = m.graphql.getMockImplementation()!;
    m.graphql.mockImplementation(async (arg: never) => {
      order.push('band-write');
      return baseGraphql(arg);
    });
    m.BandInvite.update.mockImplementation(async () => {
      order.push('revoke-invite');
      return { data: {} };
    });
    m.SetList.update.mockImplementation(async ({ id }: { id: string }) => {
      order.push(`tombstone:${id}`);
      return { data: {} };
    });

    const steps: string[] = [];
    await deleteBand('band-1', (step) => steps.push(step));

    expect(order.at(-2)).toBe('band-write');
    expect(order.at(-1)).toBe('revoke-invite');
    expect(new Set(order.slice(0, 3))).toEqual(new Set(['tombstone:sl-1', 'tombstone:sl-2', 'tombstone:sl-old']));
    expect(steps).toEqual(['set-lists', 'tombstone', 'invite', 'done']);
    expect(m.graphql).toHaveBeenCalledTimes(1); // tombstone and scrub are ONE write: no half-scrubbed window
    const input = m.graphql.mock.calls[0][0].variables.input;
    expect(input).toMatchObject({ name: 'Deleted', inviteCode: '', bannedSubs: [], hiddenSongIds: [] });
    expect(input.deletedAt).toBeTruthy();
    expect(m.BandInvite.update.mock.calls[0][0]).toMatchObject({ code: 'ABCDEFGHJK' });
    expect(m.SetList.update.mock.calls[0][0].name).toBe('Deleted');
    expect(m.Band.create).not.toHaveBeenCalled();
    expect(m.BandInvite.delete).not.toHaveBeenCalled();
  });

  it('the scrub clears sharedSetListIds so a deleted band can never leave a set list public', async () => {
    echoBandUpdates(bandRow({ setListIds: ['sl-1'], sharedSetListIds: ['sl-1'] }));
    m.SetList.update.mockResolvedValue({ data: {} });
    m.BandInvite.update.mockResolvedValue({ data: {} });
    await deleteBand('band-1');
    expect(m.graphql.mock.calls[0][0].variables.input).toMatchObject({ sharedSetListIds: [] });
    const band = await m.Band.get.getMockImplementation()!({ id: 'band-1' });
    expect(band.data.sharedSetListIds).toEqual([]);
  });

  it('a tombstoned band that still lists shared ids is NOT considered scrubbed, so a re-run finishes the scrub', async () => {
    echoBandUpdates(
      bandRow({
        deletedAt: '2026-02-01T00:00:00Z',
        name: 'Deleted',
        inviteCode: '',
        setListIds: ['sl-1'],
        sharedSetListIds: ['sl-1'],
      }),
    );
    m.SetList.update.mockResolvedValue({ data: {} });
    m.BandInvite.update.mockResolvedValue({ data: {} });
    await deleteBand('band-1');
    expect(m.graphql).toHaveBeenCalledTimes(1);
    const input = m.graphql.mock.calls[0][0].variables.input;
    expect(input).toMatchObject({ sharedSetListIds: [] });
    expect(input).not.toHaveProperty('deletedAt'); // already tombstoned: the original time is kept
  });

  it('a set-list failure aborts BEFORE the band changes, so the normal Delete button can simply retry', async () => {
    echoBandUpdates(bandRow({ setListIds: ['sl-1'] }));
    m.SetList.update.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(deleteBand('band-1')).rejects.toThrow('throttled');
    expect(m.graphql).not.toHaveBeenCalled();
    expect(m.BandInvite.update).not.toHaveBeenCalled();
  });

  it('once the atomic write has happened nothing sensitive is left, even if retiring the invite fails', async () => {
    echoBandUpdates(bandRow({ setListIds: ['sl-1'], bannedSubs: ['x'] }));
    m.SetList.update.mockResolvedValue({ data: {} });
    m.BandInvite.update.mockResolvedValue({ data: null, errors: [{ message: 'network' }] });
    await expect(deleteBand('band-1')).resolves.toBeUndefined(); // best-effort: join already rejects dead bands
    const band = await m.Band.get.getMockImplementation()!({ id: 'band-1' });
    expect(band.data).toMatchObject({ name: 'Deleted', inviteCode: '', bannedSubs: [], hiddenSongIds: [] });
    expect(band.data.deletedAt).toBeTruthy();
  });

  it('is re-runnable: an already scrubbed band only re-tombstones its set lists', async () => {
    echoBandUpdates(bandRow({ deletedAt: '2026-02-01T00:00:00Z', name: 'Deleted', inviteCode: '', setListIds: ['sl-1'] }));
    m.SetList.update.mockResolvedValue({ data: {} });
    await deleteBand('band-1');
    expect(m.graphql).not.toHaveBeenCalled();
    expect(m.BandInvite.update).not.toHaveBeenCalled();
    expect(m.SetList.update).toHaveBeenCalledTimes(1);
  });

  it('keeps going when a set list row is already tombstoned (conflict)', async () => {
    echoBandUpdates(bandRow({ setListIds: ['sl-1', 'sl-2'] }));
    m.BandInvite.update.mockResolvedValue({ data: {} });
    m.SetList.update.mockResolvedValueOnce({ data: null, errors: CONFLICT }).mockResolvedValue({ data: {} });
    await expect(deleteBand('band-1')).resolves.toBeUndefined();
    expect(m.SetList.update).toHaveBeenCalledTimes(2);
  });

  it('only tombstones the capped prefixes of a hostile band', async () => {
    echoBandUpdates(
      bandRow({
        setListIds: Array.from({ length: 40 }, (_, i) => `sl-${i}`),
        archivedSetListIds: Array.from({ length: 200 }, (_, i) => `ar-${i}`),
      }),
    );
    m.BandInvite.update.mockResolvedValue({ data: {} });
    m.SetList.update.mockResolvedValue({ data: {} });
    await deleteBand('band-1');
    expect(m.SetList.update).toHaveBeenCalledTimes(10 + 50);
  });

  it('fails when the band does not exist', async () => {
    m.Band.get.mockResolvedValue({ data: null });
    await expect(deleteBand('band-1')).rejects.toThrow('Band not found');
  });
});

describe('auth gating (every cloud call checks sign-in first)', () => {
  const signedOut = () => vi.mocked(isAuthenticated).mockResolvedValue(false);
  const untouched = () => {
    for (const model of [m.Band, m.BandInvite, m.MyBand, m.Member, m.SetList]) {
      for (const fn of Object.values(model)) expect(fn).not.toHaveBeenCalled();
    }
    expect(m.graphql).not.toHaveBeenCalled();
  };

  it.each([
    ['banMember', () => banMember('band-1', 'sub-bob')],
    ['unbanMember', () => unbanMember('band-1', 'sub-bob')],
    ['hideSong', () => hideSong('band-1', 's1')],
    ['renameBand', () => renameBand('band-1', 'New')],
    ['resetInviteCode', () => resetInviteCode('band-1')],
    ['deleteBand', () => deleteBand('band-1')],
    ['loadBandView', () => loadBandView('band-1')],
    ['previewBand', () => previewBand('band-1')],
    ['lookupInvite', () => lookupInvite('ABCDE-FGHJK')],
    ['joinBand', () => joinBand('band-1', 'Bob')],
    ['dismissBand', () => dismissBand('band-1')],
    ['ensureMyBandRow', () => ensureMyBandRow('band-1')],
    ['createBand', () => createBand('Band', 'Alice')],
  ])('%s never touches the API when signed out', async (_name, call) => {
    signedOut();
    await expect(call()).rejects.toThrow('Not authenticated');
    untouched();
  });
});

describe('writes to a deleted band are refused', () => {
  it.each([
    ['banMember', () => banMember('band-1', 'sub-bob')],
    ['hideSong', () => hideSong('band-1', 's1')],
    ['renameBand', () => renameBand('band-1', 'New name')],
  ])('%s', async (_name, call) => {
    echoBandUpdates(bandRow({ deletedAt: '2026-02-01T00:00:00Z' }));
    await expect(call()).rejects.toThrow('This band was deleted');
    expect(m.graphql).not.toHaveBeenCalled();
  });
});

describe('loadBandView hardening', () => {
  it('fails closed when the caller\'s own member row cannot be read', async () => {
    m.Member.get.mockResolvedValue({ data: null, errors: [{ message: 'transient' }] });
    await expect(loadBandView('band-1')).rejects.toThrow('transient');
  });

  it('only fetches the first maxSetLists ids of a hostile band, with bounded parallelism', async () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `sl-${i}`);
    m.Band.get.mockResolvedValue({ data: bandRow({ setListIds: ids }) });
    let active = 0;
    let peak = 0;
    m.SetList.get.mockImplementation(async ({ id }: { id: string }) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return { data: setListRow({ id }) };
    });
    const res = await loadBandView('band-1');
    expect(m.SetList.get).toHaveBeenCalledTimes(10);
    expect(peak).toBeLessThanOrEqual(6);
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.setLists).toHaveLength(10);
  });

  it('starts the roster and own-row reads together with the band read (no serial waterfall)', async () => {
    const started: string[] = [];
    m.Band.get.mockImplementation(async () => { started.push('band'); await new Promise((r) => setTimeout(r, 5)); return { data: bandRow() }; });
    m.Member.listMemberByBandId.mockImplementation(async () => { started.push('roster'); return { data: [], nextToken: null }; });
    m.Member.get.mockImplementation(async () => { started.push('own'); return { data: null }; });
    await loadBandView('band-1');
    expect(started.slice(0, 3).sort()).toEqual(['band', 'own', 'roster']);
  });

  it('a read error on any set list fails the whole load (never a partial band)', async () => {
    m.Band.get.mockResolvedValue({ data: bandRow({ setListIds: ['sl-1', 'sl-2'] }) });
    m.SetList.get.mockImplementation(async ({ id }: { id: string }) =>
      id === 'sl-2' ? { data: null, errors: [{ message: 'gsi down' }] } : { data: setListRow() },
    );
    await expect(loadBandView('band-1')).rejects.toThrow('gsi down');
  });
});

describe('resetInviteCode hardening', () => {
  it('still succeeds when retiring the old invite row fails (the band no longer carries that code)', async () => {
    m.BandInvite.create.mockResolvedValue({ data: {} });
    m.graphql.mockImplementation(async ({ variables }: { variables: { input: Record<string, unknown> } }) => ({
      data: { updateBand: bandRow({ ...variables.input }) },
    }));
    m.BandInvite.update.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    const band = await resetInviteCode('band-1');
    expect(band.inviteCode).toBe(m.BandInvite.create.mock.calls[0][0].code);
  });

  it('retires the code that was actually replaced (read inside the lock), not a stale earlier read', async () => {
    m.BandInvite.create.mockResolvedValue({ data: {} });
    m.Band.get.mockResolvedValue({ data: bandRow({ inviteCode: 'REPLACEDXX' }) });
    m.graphql.mockImplementation(async ({ variables }: { variables: { input: Record<string, unknown> } }) => ({
      data: { updateBand: bandRow({ ...variables.input }) },
    }));
    m.BandInvite.update.mockResolvedValue({ data: {} });
    await resetInviteCode('band-1');
    expect(m.BandInvite.update.mock.calls[0][0]).toMatchObject({ code: 'REPLACEDXX' });
  });

  it('retries a code collision with a fresh code', async () => {
    m.BandInvite.create.mockResolvedValueOnce({ data: null, errors: CONFLICT }).mockResolvedValue({ data: {} });
    m.graphql.mockImplementation(async ({ variables }: { variables: { input: Record<string, unknown> } }) => ({
      data: { updateBand: bandRow({ ...variables.input }) },
    }));
    m.BandInvite.update.mockResolvedValue({ data: {} });
    await resetInviteCode('band-1');
    expect(m.BandInvite.create).toHaveBeenCalledTimes(2);
  });

  it('surfaces non-conflict invite errors', async () => {
    m.BandInvite.create.mockResolvedValue({ data: null, errors: UNAUTH });
    await expect(resetInviteCode('band-1')).rejects.toThrow('createInvite');
    expect(m.graphql).not.toHaveBeenCalled();
  });
});

describe('loadBandView scoping and caps', () => {
  it('onlySetListId fetches just that set list (the set-list page needs one, not ten)', async () => {
    m.Band.get.mockResolvedValue({ data: bandRow({ setListIds: ['sl-1', 'sl-2', 'sl-3'] }) });
    m.SetList.get.mockImplementation(async ({ id }: { id: string }) => ({ data: setListRow({ id }) }));
    const res = await loadBandView('band-1', { onlySetListId: 'sl-2' });
    expect(m.SetList.get).toHaveBeenCalledTimes(1);
    expect(m.SetList.get).toHaveBeenCalledWith({ id: 'sl-2' });
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.setLists.map((s) => s.id)).toEqual(['sl-2']);
  });

  it('onlySetListId for an id the band does not have loads nothing (the page shows "not found")', async () => {
    m.SetList.get.mockClear();
    const res = await loadBandView('band-1', { onlySetListId: 'sl-forged' });
    expect(m.SetList.get).not.toHaveBeenCalled();
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.setLists).toEqual([]);
  });

  it('a junk flood against the roster costs at most a few requests and is flagged incomplete', async () => {
    m.Member.listMemberByBandId.mockResolvedValue({ data: [memberRow('sub-x')], nextToken: 'more' });
    const res = await loadBandView('band-1');
    expect(m.Member.listMemberByBandId).toHaveBeenCalledTimes(4);
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.incomplete).toBe(true);
  });
});
