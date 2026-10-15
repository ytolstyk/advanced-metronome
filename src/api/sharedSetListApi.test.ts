import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BAND_LIMITS, PUBLIC_READ_PAGES, type BandRecord } from '../bandTypes';

const { m, auth } = vi.hoisted(() => ({
  m: {
    Band: { get: vi.fn() },
    SetList: { get: vi.fn() },
    Member: { get: vi.fn(), listMemberByBandId: vi.fn() },
    Song: { listSongBySetList: vi.fn() },
    Vote: { listVoteBySetList: vi.fn() },
    graphql: vi.fn(),
  },
  auth: { getCurrentUser: vi.fn(), fetchAuthSession: vi.fn(), fetchUserAttributes: vi.fn() },
}));

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({ models: m, graphql: m.graphql })),
}));
// The real authUtils runs on top of this, so "signed out" is exactly a session without tokens.
vi.mock('aws-amplify/auth', () => auth);

import { loadSharedSetList } from './sharedSetListApi';

const OWNER = 'sub-owner';
const BOB = 'sub-bob';
const MALLORY = 'sub-mallory';
const GUEST = { authMode: 'identityPool' } as const;

const bandRow = (over: Partial<BandRecord> = {}) => ({
  id: 'band-1',
  owner: OWNER,
  name: 'The Band',
  inviteCode: 'ABCDEFGHJK',
  deletedAt: null,
  version: 1,
  setListIds: ['sl-1'],
  archivedSetListIds: [],
  bannedSubs: [],
  hiddenSongIds: [],
  sharedSetListIds: ['sl-1'],
  ...over,
});
const setListRow = (over: Record<string, unknown> = {}) => ({
  id: 'sl-1',
  owner: OWNER,
  bandId: 'band-1',
  name: 'Main Set',
  archivedAt: null,
  ...over,
});
const memberRow = (owner: string, over: Record<string, unknown> = {}) => ({
  bandId: 'band-1',
  owner,
  displayName: owner.replace('sub-', ''),
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});
const songRow = (id: string, owner: string, over: Record<string, unknown> = {}) => ({
  id,
  owner,
  bandId: 'band-1',
  setListId: 'sl-1',
  title: `Song ${id}`,
  artist: null,
  key: null,
  bpm: null,
  notes: null,
  songUrl: null,
  tabUrl: null,
  createdAt: '2026-01-02T00:00:00Z',
  ...over,
});
const voteRow = (songId: string, owner: string, value: string) => ({
  songId,
  owner,
  value,
  bandId: 'band-1',
  setListId: 'sl-1',
  createdAt: '2026-01-03T00:00:00Z',
  updatedAt: '2026-01-03T00:00:00Z',
});

const signedOut = () => auth.fetchAuthSession.mockResolvedValue({ tokens: undefined });
const signedInAs = (sub: string) => auth.fetchAuthSession.mockResolvedValue({ tokens: { idToken: { payload: { sub } } } });

/** A shared, healthy set list: two members (Bob + owner), two songs, three votes. */
function seedHealthy({
  band = bandRow(),
  setList = setListRow(),
  members = [memberRow(OWNER), memberRow(BOB)],
  songs = [songRow('a', BOB), songRow('b', OWNER)],
  votes = [voteRow('b', BOB, 'up'), voteRow('b', OWNER, 'up'), voteRow('a', OWNER, 'down')],
}: {
  band?: ReturnType<typeof bandRow> | null;
  setList?: ReturnType<typeof setListRow> | null;
  members?: ReturnType<typeof memberRow>[];
  songs?: ReturnType<typeof songRow>[];
  votes?: ReturnType<typeof voteRow>[];
} = {}) {
  m.SetList.get.mockResolvedValue({ data: setList });
  m.Band.get.mockResolvedValue({ data: band });
  m.Member.listMemberByBandId.mockResolvedValue({ data: members, nextToken: null });
  m.Song.listSongBySetList.mockResolvedValue({ data: songs, nextToken: null });
  m.Vote.listVoteBySetList.mockResolvedValue({ data: votes, nextToken: null });
  m.Member.get.mockResolvedValue({ data: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of [m.Band, m.SetList, m.Member, m.Song, m.Vote]) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  auth.getCurrentUser.mockReset();
  auth.fetchAuthSession.mockReset();
  signedOut();
  seedHealthy();
});

describe('loadSharedSetList: happy path', () => {
  it('returns the ranked songs with tallies for a shared, alive, in-band set list', async () => {
    const res = await loadSharedSetList('sl-1');
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.view.band.name).toBe('The Band');
    expect(res.list.setList.name).toBe('Main Set');
    expect(res.list.shared).toBe(true);
    expect(res.list.songs.map((s) => s.id)).toEqual(['b', 'a']); // b: +2, a: -1
    expect(res.list.tallies.get('b')).toEqual({ up: 2, down: 0, score: 2 });
    expect(res.list.tallies.get('a')).toEqual({ up: 0, down: 1, score: -1 });
    expect(res.list.incomplete).toBe(false);
    expect(res.view.incomplete).toBe(false);
  });

  it('hides forged rows: songs by non-members and votes by non-members never count', async () => {
    seedHealthy({
      songs: [songRow('a', BOB), songRow('evil', MALLORY)],
      votes: [voteRow('a', MALLORY, 'down'), voteRow('a', BOB, 'up'), voteRow('evil', BOB, 'up')],
    });
    const res = await loadSharedSetList('sl-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.list.songs.map((s) => s.id)).toEqual(['a']);
    expect(res.list.tallies.get('a')).toEqual({ up: 1, down: 0, score: 1 });
    expect(res.list.tallies.has('evil')).toBe(false);
  });

  it('hides songs the owner hid (hiddenSongIds), and never hands them to a visitor as "hidden songs"', async () => {
    seedHealthy({ band: bandRow({ hiddenSongIds: ['a'] }) });
    const res = await loadSharedSetList('sl-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.list.songs.map((s) => s.id)).toEqual(['b']);
    expect(res.list.tallies.has('a')).toBe(false);
    expect(res.list.hiddenSongs).toEqual([]);
  });

  it('drops songs that belong to another set list or band, and songs with rewritten text', async () => {
    seedHealthy({
      songs: [
        songRow('ok', BOB),
        songRow('elsewhere', BOB, { setListId: 'sl-other' }),
        songRow('other-band', BOB, { bandId: 'band-2' }),
        songRow('spoofed', BOB, { title: 'Song​ x' }),
      ],
      votes: [],
    });
    const res = await loadSharedSetList('sl-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.list.songs.map((s) => s.id)).toEqual(['ok']);
  });

  it('a banned member\'s songs are not shown', async () => {
    seedHealthy({ band: bandRow({ bannedSubs: [BOB] }) });
    const res = await loadSharedSetList('sl-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.list.songs.map((s) => s.id)).toEqual(['b']);
  });

  it('shows an empty shared list as ok with no songs', async () => {
    seedHealthy({ songs: [], votes: [] });
    const res = await loadSharedSetList('sl-1');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') expect(res.list.songs).toEqual([]);
  });
});

describe('loadSharedSetList: every reason a visitor cannot see it is one indistinguishable `unavailable`', () => {
  const UNAVAILABLE = { status: 'unavailable' };

  it('the set list row is missing: nothing about the band is fetched', async () => {
    seedHealthy({ setList: null });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
    expect(m.Band.get).not.toHaveBeenCalled();
    expect(m.Member.listMemberByBandId).not.toHaveBeenCalled();
    expect(m.Member.get).not.toHaveBeenCalled();
  });

  it('the band is missing', async () => {
    seedHealthy({ band: null });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
  });

  it('the band was deleted (even though its arrays still say shared)', async () => {
    seedHealthy({ band: bandRow({ deletedAt: '2026-02-01T00:00:00Z' }) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
  });

  it('the id is shared but not one of the band\'s set lists', async () => {
    seedHealthy({ band: bandRow({ setListIds: ['sl-other'], sharedSetListIds: ['sl-1'] }) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
  });

  it('the id is one of the band\'s set lists but the owner has not shared it', async () => {
    seedHealthy({ band: bandRow({ sharedSetListIds: [] }) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
    seedHealthy({ band: bandRow({ sharedSetListIds: ['sl-other'] }) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
  });

  it('the set list row is archived (even if the band array still lists it as shared)', async () => {
    seedHealthy({ setList: setListRow({ archivedAt: '2026-02-01T00:00:00Z', name: 'Archived' }) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
  });

  it('the id was archived at band level (moved to archivedSetListIds)', async () => {
    seedHealthy({ band: bandRow({ setListIds: [], archivedSetListIds: ['sl-1'], sharedSetListIds: ['sl-1'] }) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
  });

  it('the set list row\'s bandId was forged to point at a band that does not list it', async () => {
    seedHealthy({ setList: setListRow({ bandId: 'band-2' }), band: bandRow({ id: 'band-2', setListIds: [], sharedSetListIds: [] }) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
    expect(m.Band.get).toHaveBeenCalledWith({ id: 'band-2' }, GUEST); // the ROW decides the band, never the URL
  });

  it('the set list row\'s bandId was forged to a band that lists and shares the id but is owned by someone else', async () => {
    seedHealthy({
      setList: setListRow({ bandId: 'band-evil', owner: OWNER }),
      band: bandRow({ id: 'band-evil', owner: MALLORY, name: 'Evil Band' }),
    });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
  });

  it('a set list row owned by someone other than the band owner never validates', async () => {
    seedHealthy({ setList: setListRow({ owner: MALLORY }) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
  });

  it('the band name is not clean (zero-width character), so the band is not shown', async () => {
    seedHealthy({ band: bandRow({ name: 'The​Band' }) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
  });

  it('the band name is empty or padded or too long', async () => {
    for (const name of ['', ' The Band', 'x'.repeat(BAND_LIMITS.nameMax + 1)]) {
      seedHealthy({ band: bandRow({ name }) });
      await expect(loadSharedSetList('sl-1'), JSON.stringify(name)).resolves.toEqual(UNAVAILABLE);
    }
  });

  it('a shared id beyond BAND_LIMITS.maxSetLists is ignored (hostile owner-written arrays are bounded)', async () => {
    const filler = Array.from({ length: BAND_LIMITS.maxSetLists }, (_, i) => `f${i}`);
    seedHealthy({ band: bandRow({ setListIds: ['sl-1'], sharedSetListIds: [...filler, 'sl-1'] }) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
    seedHealthy({ band: bandRow({ setListIds: [...filler, 'sl-1'], sharedSetListIds: ['sl-1'] }) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
  });

  it('an unavailable result carries no rows at all, even though songs and votes were fetched in parallel', async () => {
    seedHealthy({ band: bandRow({ sharedSetListIds: [] }) });
    const res = await loadSharedSetList('sl-1');
    expect(Object.keys(res)).toEqual(['status']);
  });

  it('a forged shared flag on a different band cannot expose this list (the URL id alone is never trusted)', async () => {
    seedHealthy({ band: bandRow({ id: 'band-1', sharedSetListIds: ['sl-1'], setListIds: ['sl-2'] }) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual(UNAVAILABLE);
  });
});

describe('loadSharedSetList: failing reads fail closed', () => {
  it('rejects (never "unavailable") when the set list read errors', async () => {
    m.SetList.get.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(loadSharedSetList('sl-1')).rejects.toThrow('getSetList: throttled');
  });

  it('rejects when the band read errors', async () => {
    m.Band.get.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(loadSharedSetList('sl-1')).rejects.toThrow('getBand: throttled');
  });

  it('rejects when songs, votes or the roster cannot be listed', async () => {
    m.Song.listSongBySetList.mockResolvedValue({ data: null, errors: [{ message: 'songs down' }] });
    await expect(loadSharedSetList('sl-1')).rejects.toThrow('songs down');
    seedHealthy();
    m.Vote.listVoteBySetList.mockResolvedValue({ data: null, errors: [{ message: 'votes down' }] });
    await expect(loadSharedSetList('sl-1')).rejects.toThrow('votes down');
    seedHealthy();
    m.Member.listMemberByBandId.mockResolvedValue({ data: null, errors: [{ message: 'roster down' }] });
    await expect(loadSharedSetList('sl-1')).rejects.toThrow('roster down');
  });
});

describe('loadSharedSetList: signed-out visitor', () => {
  it('succeeds without requiring sign-in and reads everything as the identityPool guest', async () => {
    signedOut();
    const res = await loadSharedSetList('sl-1');
    expect(res.status).toBe('ok');

    expect(m.SetList.get).toHaveBeenCalledWith({ id: 'sl-1' }, GUEST);
    expect(m.Band.get).toHaveBeenCalledWith({ id: 'band-1' }, GUEST);
    expect(m.Member.listMemberByBandId).toHaveBeenCalledWith(
      { bandId: 'band-1' },
      expect.objectContaining({ authMode: 'identityPool' }),
    );
    expect(m.Song.listSongBySetList).toHaveBeenCalledWith(
      { setListId: 'sl-1' },
      expect.objectContaining({ authMode: 'identityPool' }),
    );
    expect(m.Vote.listVoteBySetList).toHaveBeenCalledWith(
      { setListId: 'sl-1' },
      expect.objectContaining({ authMode: 'identityPool' }),
    );
  });

  it('every call of every read carries the guest mode (nothing falls back to the default user pool)', async () => {
    signedOut();
    await loadSharedSetList('sl-1');
    const optionsOf = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => c[1]);
    for (const fn of [m.SetList.get, m.Band.get, m.Member.listMemberByBandId, m.Song.listSongBySetList, m.Vote.listVoteBySetList]) {
      expect(fn).toHaveBeenCalled();
      for (const opts of optionsOf(fn)) expect(opts).toMatchObject({ authMode: 'identityPool' });
    }
  });

  it('never reads a Member row (a guest has none) and never writes', async () => {
    signedOut();
    await loadSharedSetList('sl-1');
    expect(m.Member.get).not.toHaveBeenCalled();
    expect(m.graphql).not.toHaveBeenCalled();
  });

  it('is not a member: no "Open in your band" for a guest, and no votes are attributed to them', async () => {
    signedOut();
    const res = await loadSharedSetList('sl-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.isMember).toBe(false);
    expect(res.view.isOwner).toBe(false);
    expect(res.view.sub).toBe('');
    expect(res.list.myVotes.size).toBe(0);
  });

  it('an anonymous visitor is not treated as the owner even if a hostile band has an empty owner', async () => {
    signedOut();
    seedHealthy({ band: bandRow({ owner: '' }), setList: setListRow({ owner: '' }) });
    const res = await loadSharedSetList('sl-1');
    expect(res.status).toBe('unavailable'); // a set list with an empty owner never validates
  });
});

describe('loadSharedSetList: signed-in reader', () => {
  it('reads with the explicit userPool mode (never the guest identityPool)', async () => {
    signedInAs(BOB);
    seedHealthy();
    m.Member.get.mockResolvedValue({ data: memberRow(BOB) });
    await loadSharedSetList('sl-1');
    expect(m.SetList.get).toHaveBeenCalledWith({ id: 'sl-1' }, { authMode: 'userPool' });
    expect(m.Band.get).toHaveBeenCalledWith({ id: 'band-1' }, { authMode: 'userPool' });
    for (const fn of [m.Member.listMemberByBandId, m.Song.listSongBySetList, m.Vote.listVoteBySetList]) {
      for (const call of fn.mock.calls) expect(call[1]).toMatchObject({ authMode: 'userPool' });
    }
  });

  it('looks up their own membership by primary key and reports isMember', async () => {
    signedInAs(BOB);
    m.Member.get.mockResolvedValue({ data: memberRow(BOB) });
    const res = await loadSharedSetList('sl-1');
    expect(m.Member.get).toHaveBeenCalledWith({ bandId: 'band-1', owner: BOB });
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.isMember).toBe(true);
    expect(res.view.sub).toBe(BOB);
    expect(res.list.myVotes.get('b')).toBe('up');
  });

  it('the owner is a member (and isOwner) without a Member row', async () => {
    signedInAs(OWNER);
    m.Member.get.mockResolvedValue({ data: null });
    const res = await loadSharedSetList('sl-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.isOwner).toBe(true);
    expect(res.view.isMember).toBe(true);
  });

  it('a signed-in non-member is not a member and sees the same public list', async () => {
    signedInAs('sub-stranger');
    m.Member.get.mockResolvedValue({ data: null });
    const res = await loadSharedSetList('sl-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.isMember).toBe(false);
    expect(res.list.songs.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('a banned member is not shown as a member', async () => {
    signedInAs(BOB);
    seedHealthy({ band: bandRow({ bannedSubs: [BOB] }) });
    m.Member.get.mockResolvedValue({ data: memberRow(BOB) });
    const res = await loadSharedSetList('sl-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.isMember).toBe(false);
  });

  it('fails closed when their own membership cannot be read', async () => {
    signedInAs(BOB);
    m.Member.get.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(loadSharedSetList('sl-1')).rejects.toThrow('getMember: throttled');
  });

  it('still answers unavailable for an unshared list (signing in does not widen access)', async () => {
    signedInAs(BOB);
    seedHealthy({ band: bandRow({ sharedSetListIds: [] }) });
    m.Member.get.mockResolvedValue({ data: memberRow(BOB) });
    await expect(loadSharedSetList('sl-1')).resolves.toEqual({ status: 'unavailable' });
  });
});

describe('loadSharedSetList: page caps', () => {
  it('lists songs, votes and roster with the PUBLIC_READ_PAGES caps and reports incomplete', async () => {
    m.Song.listSongBySetList.mockResolvedValue({ data: [songRow('a', BOB)], nextToken: 'more' });
    m.Vote.listVoteBySetList.mockResolvedValue({ data: [], nextToken: 'more' });
    m.Member.listMemberByBandId.mockResolvedValue({ data: [memberRow(OWNER), memberRow(BOB)], nextToken: 'more' });

    const res = await loadSharedSetList('sl-1');

    expect(m.Song.listSongBySetList).toHaveBeenCalledTimes(PUBLIC_READ_PAGES.songs);
    expect(m.Vote.listVoteBySetList).toHaveBeenCalledTimes(PUBLIC_READ_PAGES.votes);
    expect(m.Member.listMemberByBandId).toHaveBeenCalledTimes(PUBLIC_READ_PAGES.roster);
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.list.incomplete).toBe(true);
    expect(res.view.incomplete).toBe(true);
  });

  it('flags a list incomplete when only the votes hit the cap', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({ data: [], nextToken: 'more' });
    const res = await loadSharedSetList('sl-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.list.incomplete).toBe(true);
    expect(res.view.incomplete).toBe(false);
  });

  it('flags the view incomplete when only the roster hit the cap', async () => {
    m.Member.listMemberByBandId.mockResolvedValue({ data: [memberRow(OWNER), memberRow(BOB)], nextToken: 'more' });
    const res = await loadSharedSetList('sl-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(res.view.incomplete).toBe(true);
    expect(res.list.incomplete).toBe(false);
  });

  it('stays complete below the caps, following nextToken across pages', async () => {
    m.Song.listSongBySetList
      .mockResolvedValueOnce({ data: [songRow('a', BOB)], nextToken: 't1' })
      .mockResolvedValueOnce({ data: [songRow('b', OWNER)], nextToken: null });
    const res = await loadSharedSetList('sl-1');
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(m.Song.listSongBySetList).toHaveBeenCalledTimes(2);
    expect(res.list.songs.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(res.list.incomplete).toBe(false);
  });
});
