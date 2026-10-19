import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_READ_PAGES, type BandRecord, type BandView, type ValidMember, type ValidSetList } from '../bandTypes';

const { m } = vi.hoisted(() => {
  const m = {
    Band: { get: vi.fn() },
    SetList: { create: vi.fn(), update: vi.fn() },
    Song: { get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listSongBySetList: vi.fn() },
    Vote: { get: vi.fn(), delete: vi.fn(), listVoteBySetList: vi.fn() },
    SongColor: { listSongColorBySetList: vi.fn() },
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
  archiveSetList,
  createSetList,
  deleteMyContent,
  deleteSong,
  fetchSetListRows,
  renameSetList,
  setSetListShared,
  suggestSong,
  updateSong,
} from './setListsApi';
import { fetchPublicSetListRows } from './bandReads';
import { isAuthenticated } from './authUtils';
import { NotSignedInError } from './bandsShared';

const CONFLICT = [{ errorType: 'DynamoDB:ConditionalCheckFailedException', message: 'conditional' }];
const UNAUTH = [{ errorType: 'Unauthorized', message: 'Not Authorized' }];

const band = (over: Partial<BandRecord> = {}): BandRecord => ({
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
const bandRow = (over: Partial<BandRecord> = {}) => band(over);

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
  createdAt: '2026-01-02T00:00:00Z',
  ...over,
});
const voteRow = (songId: string, owner: string, value: string, over: Record<string, unknown> = {}) => ({
  songId,
  owner,
  value,
  bandId: 'band-1',
  setListId: 'sl-1',
  createdAt: '2026-01-03T00:00:00Z',
  updatedAt: '2026-01-03T00:00:00Z',
  ...over,
});

function makeView(over: Partial<BandView> = {}, b = band()): BandView {
  const setLists = [
    { id: 'sl-1', owner: 'sub-owner', bandId: 'band-1', name: 'Main Set', archivedAt: null },
  ] as unknown as ValidSetList[];
  const members = [
    { bandId: 'band-1', owner: 'sub-me', displayName: 'Me', createdAt: '2026-01-01T00:00:00Z' },
    { bandId: 'band-1', owner: 'sub-bob', displayName: 'Bob', createdAt: '2026-01-01T00:00:01Z' },
  ] as unknown as ValidMember[];
  return {
    band: b,
    sub: 'sub-me',
    isOwner: false,
    isMember: true,
    members,
    memberSubs: new Set(['sub-owner', 'sub-me', 'sub-bob']),
    displayNames: new Map(),
    setLists,
    removedMembers: [],
    incomplete: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthenticated).mockResolvedValue(true);
  for (const model of [m.Band, m.SetList, m.Song, m.Vote, m.SongColor]) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  m.graphql.mockReset();
  m.Song.listSongBySetList.mockResolvedValue({ data: [], nextToken: null });
  m.Vote.listVoteBySetList.mockResolvedValue({ data: [], nextToken: null });
  m.SongColor.listSongColorBySetList.mockResolvedValue({ data: [], nextToken: null });
});

function echoBandUpdates(base: BandRecord) {
  let current: BandRecord = { ...base };
  m.Band.get.mockImplementation(async () => ({ data: current }));
  m.graphql.mockImplementation(async ({ variables }: { variables: { input: Partial<BandRecord> } }) => {
    current = { ...current, ...variables.input };
    return { data: { updateBand: current } };
  });
  return () => current;
}

describe('createSetList', () => {
  it('creates the row first, then appends its id to Band.setListIds', async () => {
    const order: string[] = [];
    m.SetList.create.mockImplementation(async () => {
      order.push('row');
      return { data: {} };
    });
    const current = echoBandUpdates(bandRow());
    const baseGraphql = m.graphql.getMockImplementation()!;
    m.graphql.mockImplementation(async (arg: never) => {
      order.push('band');
      return baseGraphql(arg);
    });
    const id = await createSetList('band-1', '  Gig 1 ');
    expect(order).toEqual(['row', 'band']);
    expect(m.SetList.create).toHaveBeenCalledWith({ id, bandId: 'band-1', name: 'Gig 1' });
    expect(current().setListIds).toEqual(['sl-1', id]);
  });

  it('starts private: the new id is NOT added to sharedSetListIds', async () => {
    m.SetList.create.mockResolvedValue({ data: {} });
    const current = echoBandUpdates(bandRow({ sharedSetListIds: ['sl-1'] }));
    const id = await createSetList('band-1', 'Gig 2');
    expect(current().setListIds).toContain(id);
    expect(current().sharedSetListIds).toEqual(['sl-1']);
    expect(m.graphql.mock.calls[0][0].variables.input).not.toHaveProperty('sharedSetListIds');
  });

  it('enforces the set-list cap and never half-writes the array', async () => {
    m.SetList.create.mockResolvedValue({ data: {} });
    const current = echoBandUpdates(bandRow({ setListIds: Array.from({ length: 10 }, (_, i) => `sl-${i}`) }));
    await expect(createSetList('band-1', 'One more')).rejects.toThrow('at most 10');
    expect(current().setListIds).toHaveLength(10);
  });

  it('rejects empty names before touching the API', async () => {
    await expect(createSetList('band-1', '  ')).rejects.toThrow('name');
    expect(m.SetList.create).not.toHaveBeenCalled();
  });

  it('surfaces create errors (e.g. not the owner) without updating the band', async () => {
    m.SetList.create.mockResolvedValue({ data: null, errors: UNAUTH });
    await expect(createSetList('band-1', 'Gig')).rejects.toThrow('createSetList');
    expect(m.graphql).not.toHaveBeenCalled();
  });
});

describe('renameSetList / archiveSetList', () => {
  it('renames with a sanitized name', async () => {
    m.SetList.update.mockResolvedValue({ data: {} });
    await renameSetList('sl-1', '  New   name ');
    expect(m.SetList.update).toHaveBeenCalledWith({ id: 'sl-1', name: 'New name' });
  });

  it('moves the id between arrays in ONE band write, then tombstones the row', async () => {
    const current = echoBandUpdates(bandRow({ setListIds: ['sl-1', 'sl-2'], archivedSetListIds: ['old'] }));
    m.SetList.update.mockResolvedValue({ data: {} });
    await archiveSetList('band-1', 'sl-1');
    expect(m.graphql).toHaveBeenCalledTimes(1);
    expect(current().setListIds).toEqual(['sl-2']);
    expect(current().archivedSetListIds).toEqual(['old', 'sl-1']);
    expect(m.SetList.update.mock.calls[0][0]).toMatchObject({ id: 'sl-1', name: 'Archived' });
    expect(m.SetList.update.mock.calls[0][0].archivedAt).toBeTruthy();
  });

  it('archiving also removes the id from sharedSetListIds in the SAME band write (archived = no longer public)', async () => {
    const current = echoBandUpdates(
      bandRow({ setListIds: ['sl-1', 'sl-2'], sharedSetListIds: ['sl-1', 'sl-2'] }),
    );
    m.SetList.update.mockResolvedValue({ data: {} });
    await archiveSetList('band-1', 'sl-1');
    expect(m.graphql).toHaveBeenCalledTimes(1);
    expect(m.graphql.mock.calls[0][0].variables.input).toMatchObject({
      setListIds: ['sl-2'],
      archivedSetListIds: ['sl-1'],
      sharedSetListIds: ['sl-2'],
    });
    expect(current().sharedSetListIds).toEqual(['sl-2']);
  });

  it('archiving an unshared list leaves sharedSetListIds unchanged', async () => {
    const current = echoBandUpdates(bandRow({ setListIds: ['sl-1', 'sl-2'], sharedSetListIds: ['sl-2'] }));
    m.SetList.update.mockResolvedValue({ data: {} });
    await archiveSetList('band-1', 'sl-1');
    expect(current().sharedSetListIds).toEqual(['sl-2']);
  });

  it('a crash after the band write leaves the id archived (never stranded) and a retry finishes', async () => {
    const current = echoBandUpdates(bandRow({ setListIds: ['sl-1'] }));
    m.SetList.update.mockResolvedValueOnce({ data: null, errors: [{ message: 'network' }] });
    await expect(archiveSetList('band-1', 'sl-1')).rejects.toThrow('network');
    expect(current().archivedSetListIds).toEqual(['sl-1']);
    m.SetList.update.mockResolvedValue({ data: {} });
    await archiveSetList('band-1', 'sl-1'); // band step is a no-op now; row step runs again
    expect(m.graphql).toHaveBeenCalledTimes(1);
    expect(m.SetList.update).toHaveBeenCalledTimes(2);
  });

  it('refuses when the archive cap is reached, leaving the band untouched', async () => {
    const current = echoBandUpdates(
      bandRow({ setListIds: ['sl-1'], archivedSetListIds: Array.from({ length: 50 }, (_, i) => `a${i}`) }),
    );
    await expect(archiveSetList('band-1', 'sl-1')).rejects.toThrow('Archive limit');
    expect(current().setListIds).toEqual(['sl-1']);
    expect(m.SetList.update).not.toHaveBeenCalled();
  });

  it('tolerates an already-tombstoned row', async () => {
    echoBandUpdates(bandRow());
    m.SetList.update.mockResolvedValue({ data: null, errors: CONFLICT });
    await expect(archiveSetList('band-1', 'sl-1')).resolves.toBeUndefined();
  });
});

describe('setSetListShared', () => {
  it('adds the id to sharedSetListIds with a single partial band write', async () => {
    const current = echoBandUpdates(bandRow({ setListIds: ['sl-1', 'sl-2'], sharedSetListIds: ['sl-2'] }));
    await setSetListShared('band-1', 'sl-1', true);
    expect(current().sharedSetListIds).toEqual(['sl-2', 'sl-1']);
    expect(m.graphql).toHaveBeenCalledTimes(1);
    const { input } = m.graphql.mock.calls[0][0].variables as { input: Record<string, unknown> };
    expect(Object.keys(input).sort()).toEqual(['id', 'sharedSetListIds', 'version']);
    expect(m.graphql.mock.calls[0][0].variables.condition).toEqual({ version: { eq: 1 } });
  });

  it('removes only that id when sharing is turned off', async () => {
    const current = echoBandUpdates(bandRow({ setListIds: ['sl-1', 'sl-2'], sharedSetListIds: ['sl-1', 'sl-2'] }));
    await setSetListShared('band-1', 'sl-1', false);
    expect(current().sharedSetListIds).toEqual(['sl-2']);
    expect(current().setListIds).toEqual(['sl-1', 'sl-2']);
  });

  it('is idempotent: sharing an already shared list, or unsharing an unshared one, writes nothing', async () => {
    echoBandUpdates(bandRow({ setListIds: ['sl-1', 'sl-2'], sharedSetListIds: ['sl-1'] }));
    await expect(setSetListShared('band-1', 'sl-1', true)).resolves.toBeUndefined();
    await expect(setSetListShared('band-1', 'sl-2', false)).resolves.toBeUndefined();
    expect(m.graphql).not.toHaveBeenCalled();
  });

  it('throws "Set list not found" for an id that is not one of the band\'s set lists, writing nothing', async () => {
    echoBandUpdates(bandRow({ setListIds: ['sl-1'], archivedSetListIds: ['sl-old'] }));
    await expect(setSetListShared('band-1', 'sl-nope', true)).rejects.toThrow('Set list not found');
    await expect(setSetListShared('band-1', 'sl-old', true)).rejects.toThrow('Set list not found'); // archived
    await expect(setSetListShared('band-1', 'sl-nope', false)).rejects.toThrow('Set list not found');
    expect(m.graphql).not.toHaveBeenCalled();
  });

  it('works from the FRESH band (re-derives after a version conflict instead of clobbering)', async () => {
    m.Band.get
      .mockResolvedValueOnce({ data: bandRow({ version: 1, setListIds: ['sl-1', 'sl-2'], sharedSetListIds: [] }) })
      .mockResolvedValueOnce({ data: bandRow({ version: 2, setListIds: ['sl-1', 'sl-2'], sharedSetListIds: ['sl-2'] }) });
    m.graphql
      .mockRejectedValueOnce({ errors: CONFLICT })
      .mockImplementationOnce(async ({ variables }: { variables: { input: Record<string, unknown> } }) => ({
        data: { updateBand: { ...bandRow(), ...variables.input } },
      }));
    await setSetListShared('band-1', 'sl-1', true);
    expect(m.graphql).toHaveBeenCalledTimes(2);
    expect(m.graphql.mock.calls[1][0].variables.input).toMatchObject({ version: 3, sharedSetListIds: ['sl-2', 'sl-1'] });
    expect(m.graphql.mock.calls[1][0].variables.condition).toEqual({ version: { eq: 2 } });
  });

  it('refuses a deleted band', async () => {
    echoBandUpdates(bandRow({ deletedAt: '2026-02-01T00:00:00Z' }));
    await expect(setSetListShared('band-1', 'sl-1', true)).rejects.toThrow('This band was deleted');
    expect(m.graphql).not.toHaveBeenCalled();
  });

  it('requires sign-in before reading or writing anything', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(setSetListShared('band-1', 'sl-1', true)).rejects.toBeInstanceOf(NotSignedInError);
    expect(m.Band.get).not.toHaveBeenCalled();
    expect(m.graphql).not.toHaveBeenCalled();
  });
});

describe('suggestSong', () => {
  it('creates a normalized song straight onto the set list', async () => {
    m.Song.create.mockResolvedValue({ data: songRow('new', 'sub-me', { title: 'Wonderwall', bpm: 87 }) });
    const created = await suggestSong(
      makeView(),
      'sl-1',
      { title: '  Wonderwall ', artist: ' Oasis', key: 'F#m', bpm: '87', notes: '' },
      3,
    );
    expect(m.Song.create).toHaveBeenCalledWith({
      bandId: 'band-1',
      setListId: 'sl-1',
      title: 'Wonderwall',
      artist: 'Oasis',
      key: 'F#m',
      bpm: 87,
      notes: null,
      songUrl: null,
      tabUrl: null,
    });
    expect(created.id).toBe('new');
  });

  it('normalizes song and tab links before sending them', async () => {
    m.Song.create.mockResolvedValue({ data: songRow('new', 'sub-me') });
    await suggestSong(makeView(), 'sl-1', { title: 'x', songUrl: 'open.spotify.com/track/1', tabUrl: ' HTTPS://Example.com/tab ' }, 0);
    expect(m.Song.create.mock.calls[0][0]).toMatchObject({
      songUrl: 'https://open.spotify.com/track/1',
      tabUrl: 'https://example.com/tab',
    });
  });

  it('rejects a javascript: link without calling the API', async () => {
    await expect(suggestSong(makeView(), 'sl-1', { title: 'x', songUrl: 'javascript:alert(1)' }, 0)).rejects.toThrow('Song link');
    await expect(suggestSong(makeView(), 'sl-1', { title: 'x', tabUrl: 'data:text/html,hi' }, 0)).rejects.toThrow('Tab link');
    expect(m.Song.create).not.toHaveBeenCalled();
  });

  it('never sends an owner (the server populates it)', async () => {
    m.Song.create.mockResolvedValue({ data: songRow('new', 'sub-me') });
    await suggestSong(makeView(), 'sl-1', { title: 'x' }, 0);
    expect(m.Song.create.mock.calls[0][0]).not.toHaveProperty('owner');
  });

  it('refuses non-members, unknown set lists and full set lists', async () => {
    await expect(suggestSong(makeView({ isMember: false }), 'sl-1', { title: 'x' }, 0)).rejects.toThrow('Join');
    await expect(suggestSong(makeView(), 'sl-nope', { title: 'x' }, 0)).rejects.toThrow('not found');
    await expect(suggestSong(makeView(), 'sl-1', { title: 'x' }, 100)).rejects.toThrow('full');
    expect(m.Song.create).not.toHaveBeenCalled();
  });

  it('rejects invalid input with a readable message', async () => {
    await expect(suggestSong(makeView(), 'sl-1', { title: ' ' }, 0)).rejects.toThrow('Title is required');
    await expect(suggestSong(makeView(), 'sl-1', { title: 'x', bpm: '999' }, 0)).rejects.toThrow('BPM');
    await expect(suggestSong(makeView(), 'sl-1', { title: 'x', key: 'H' }, 0)).rejects.toThrow('Key');
    expect(m.Song.create).not.toHaveBeenCalled();
  });
});

describe('updateSong / deleteSong', () => {
  it('updates with normalized fields and validates first', async () => {
    m.Song.update.mockResolvedValue({ data: {} });
    await updateSong('s1', { title: ' New ', bpm: 100 });
    expect(m.Song.update).toHaveBeenCalledWith({
      id: 's1',
      title: 'New',
      artist: null,
      key: null,
      bpm: 100,
      notes: null,
      songUrl: null,
      tabUrl: null,
    });
    await expect(updateSong('s1', { title: '' })).rejects.toThrow('Title');
  });

  it('sends normalized links on update, and null when cleared', async () => {
    m.Song.update.mockResolvedValue({ data: {} });
    await updateSong('s1', { title: 'x', songUrl: 'example.com/a', tabUrl: '' });
    expect(m.Song.update).toHaveBeenCalledWith(expect.objectContaining({ songUrl: 'https://example.com/a', tabUrl: null }));
    m.Song.update.mockClear();
    await expect(updateSong('s1', { title: 'x', tabUrl: 'ftp://example.com/a' })).rejects.toThrow('Tab link');
    expect(m.Song.update).not.toHaveBeenCalled();
  });

  it('deleting: a failed condition counts as already gone', async () => {
    m.Song.delete.mockResolvedValue({ data: null, errors: CONFLICT });
    await expect(deleteSong('s1')).resolves.toBeUndefined();
  });

  it('Unauthorized only counts as success when a re-read shows the song is gone', async () => {
    m.Song.delete.mockResolvedValue({ data: null, errors: UNAUTH });
    m.Song.get.mockResolvedValue({ data: null });
    await expect(deleteSong('s1')).resolves.toBeUndefined();
  });

  it('Unauthorized while the song still exists is a REAL permission failure and must surface', async () => {
    m.Song.delete.mockResolvedValue({ data: null, errors: UNAUTH });
    m.Song.get.mockResolvedValue({ data: songRow('s1', 'sub-bob') });
    await expect(deleteSong('s1')).rejects.toThrow('Not Authorized');
  });

  it('other delete errors surface', async () => {
    m.Song.delete.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(deleteSong('s1')).rejects.toThrow('throttled');
  });
});

describe('fetchSetListRows', () => {
  it('returns raw songs and votes, fetched in parallel', async () => {
    const started: string[] = [];
    m.Song.listSongBySetList.mockImplementation(async () => {
      started.push('songs');
      await Promise.resolve();
      return { data: [songRow('a', 'sub-bob')], nextToken: null };
    });
    m.Vote.listVoteBySetList.mockImplementation(async () => {
      started.push('votes');
      await Promise.resolve();
      return { data: [voteRow('a', 'sub-bob', 'up')], nextToken: null };
    });
    const rows = await fetchSetListRows('sl-1');
    expect(started).toEqual(['songs', 'votes']);
    expect(rows.songs.items.map((s) => s.id)).toEqual(['a']);
    expect(rows.votes.items.map((v) => v.songId)).toEqual(['a']);
    expect(rows.songs.incomplete || rows.votes.incomplete).toBe(false);
  });

  it('includes the song colors, fetched in parallel with songs and votes', async () => {
    const started: string[] = [];
    m.Song.listSongBySetList.mockImplementation(async () => {
      started.push('songs');
      await Promise.resolve();
      return { data: [], nextToken: null };
    });
    m.Vote.listVoteBySetList.mockImplementation(async () => {
      started.push('votes');
      await Promise.resolve();
      return { data: [], nextToken: null };
    });
    m.SongColor.listSongColorBySetList.mockImplementation(async () => {
      started.push('colors');
      await Promise.resolve();
      return {
        data: [{ songId: 'a', owner: 'sub-bob', bandId: 'band-1', setListId: 'sl-1', color: 'red', createdAt: 'c', updatedAt: 'u' }],
        nextToken: null,
      };
    });
    const rows = await fetchSetListRows('sl-1');
    // all three reads are in flight together (order depends on each helper's own awaits)
    expect([...started].sort()).toEqual(['colors', 'songs', 'votes']);
    expect(rows.colors?.items).toEqual([
      { songId: 'a', owner: 'sub-bob', bandId: 'band-1', setListId: 'sl-1', color: 'red', createdAt: 'c', updatedAt: 'u' },
    ]);
    expect(rows.colors?.incomplete).toBe(false);
    expect(m.SongColor.listSongColorBySetList).toHaveBeenCalledWith(
      { setListId: 'sl-1' },
      { limit: 250, nextToken: undefined },
    );
  });

  it('flags incomplete colors when the colors list hits the page cap', async () => {
    m.SongColor.listSongColorBySetList.mockResolvedValue({ data: [], nextToken: 'more' });
    const rows = await fetchSetListRows('sl-1');
    expect(rows.colors?.incomplete).toBe(true);
    expect(rows.songs.incomplete).toBe(false);
    expect(rows.votes.incomplete).toBe(false);
  });

  it('degrades a failed colors read to an empty, incomplete result instead of failing the page', async () => {
    m.Song.listSongBySetList.mockResolvedValue({ data: [songRow('a', 'sub-bob')], nextToken: null });
    m.Vote.listVoteBySetList.mockResolvedValue({ data: [voteRow('a', 'sub-bob', 'up')], nextToken: null });
    m.SongColor.listSongColorBySetList.mockResolvedValue({ data: null, errors: [{ message: 'colors gsi down' }] });
    const rows = await fetchSetListRows('sl-1');
    expect(rows.colors).toEqual({ items: [], incomplete: true });
    expect(rows.songs.items.map((s) => s.id)).toEqual(['a']);
    expect(rows.votes.items.map((v) => v.songId)).toEqual(['a']);
    expect(rows.songs.incomplete).toBe(false);
    expect(rows.votes.incomplete).toBe(false);
  });

  it('degrades a thrown (network) colors failure the same way', async () => {
    m.SongColor.listSongColorBySetList.mockRejectedValue(new Error('network down'));
    const rows = await fetchSetListRows('sl-1');
    expect(rows.colors).toEqual({ items: [], incomplete: true });
  });

  it('a colors failure does not wait on or hide good songs and votes', async () => {
    m.Song.listSongBySetList.mockResolvedValue({ data: [songRow('a', 'sub-bob'), songRow('b', 'sub-bob')], nextToken: null });
    m.SongColor.listSongColorBySetList.mockRejectedValue(new Error('boom'));
    const rows = await fetchSetListRows('sl-1');
    expect(rows.songs.items).toHaveLength(2);
  });

  it('checks sign-in BEFORE any read (a signed-out user never triggers a cloud call)', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(fetchSetListRows('sl-1')).rejects.toThrow('Not authenticated');
    await expect(fetchSetListRows('sl-1')).rejects.toBeInstanceOf(NotSignedInError);
    expect(m.Song.listSongBySetList).not.toHaveBeenCalled();
    expect(m.Vote.listVoteBySetList).not.toHaveBeenCalled();
    expect(m.SongColor.listSongColorBySetList).not.toHaveBeenCalled();
  });

  it('keeps using the signed-in (default) auth mode: no authMode option is sent', async () => {
    await fetchSetListRows('sl-1');
    expect(m.Song.listSongBySetList.mock.calls[0][1]).toEqual({ limit: 250, nextToken: undefined });
    expect(m.Vote.listVoteBySetList.mock.calls[0][1]).toEqual({ limit: 250, nextToken: undefined });
  });

  it('flags incomplete when a list hits the page cap', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({ data: [], nextToken: 'more' });
    const rows = await fetchSetListRows('sl-1');
    expect(rows.votes.incomplete).toBe(true);
    expect(rows.songs.incomplete).toBe(false);
  });

  it('fails closed when songs cannot be read', async () => {
    m.Song.listSongBySetList.mockResolvedValue({ data: null, errors: [{ message: 'gsi down' }] });
    await expect(fetchSetListRows('sl-1')).rejects.toThrow('gsi down');
  });

  it('fails closed when votes cannot be read', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({ data: null, errors: [{ message: 'votes gsi down' }] });
    await expect(fetchSetListRows('sl-1')).rejects.toThrow('votes gsi down');
  });

  it('fails closed on a songs failure even when colors also fail', async () => {
    m.Song.listSongBySetList.mockResolvedValue({ data: null, errors: [{ message: 'gsi down' }] });
    m.SongColor.listSongColorBySetList.mockRejectedValue(new Error('colors down'));
    await expect(fetchSetListRows('sl-1')).rejects.toThrow('gsi down');
  });
});

describe('fetchPublicSetListRows', () => {
  it('works signed out: never consults sign-in, and reads songs and votes with the guest auth mode', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    m.Song.listSongBySetList.mockResolvedValue({ data: [songRow('a', 'sub-bob')], nextToken: null });
    m.Vote.listVoteBySetList.mockResolvedValue({ data: [voteRow('a', 'sub-bob', 'up')], nextToken: null });
    const rows = await fetchPublicSetListRows('sl-1', 'identityPool');
    expect(isAuthenticated).not.toHaveBeenCalled();
    expect(rows.songs.items.map((s) => s.id)).toEqual(['a']);
    expect(rows.votes.items.map((v) => v.songId)).toEqual(['a']);
    expect(rows.songs.incomplete || rows.votes.incomplete).toBe(false);
    expect(m.Song.listSongBySetList).toHaveBeenCalledWith({ setListId: 'sl-1' }, { limit: 250, nextToken: undefined, authMode: 'identityPool' });
    expect(m.Vote.listVoteBySetList).toHaveBeenCalledWith({ setListId: 'sl-1' }, { limit: 250, nextToken: undefined, authMode: 'identityPool' });
  });

  it('public rows carry no colors and never query the SongColor model (no guest read rule for it)', async () => {
    const rows = await fetchPublicSetListRows('sl-1', 'identityPool');
    expect(rows.colors).toBeUndefined();
    expect(m.SongColor.listSongColorBySetList).not.toHaveBeenCalled();
  });

  it('passes the given mode through (a signed-in reader uses userPool)', async () => {
    await fetchPublicSetListRows('sl-1', 'userPool');
    expect(m.Song.listSongBySetList.mock.calls[0][1]).toMatchObject({ authMode: 'userPool' });
    expect(m.Vote.listVoteBySetList.mock.calls[0][1]).toMatchObject({ authMode: 'userPool' });
  });

  it('caps songs at PUBLIC_READ_PAGES.songs and votes at PUBLIC_READ_PAGES.votes, flagging incomplete', async () => {
    m.Song.listSongBySetList.mockResolvedValue({ data: [], nextToken: 'more' });
    m.Vote.listVoteBySetList.mockResolvedValue({ data: [], nextToken: 'more' });
    const rows = await fetchPublicSetListRows('sl-1', 'identityPool');
    expect(m.Song.listSongBySetList).toHaveBeenCalledTimes(PUBLIC_READ_PAGES.songs);
    expect(m.Vote.listVoteBySetList).toHaveBeenCalledTimes(PUBLIC_READ_PAGES.votes);
    expect(rows.songs.incomplete).toBe(true);
    expect(rows.votes.incomplete).toBe(true);
    // every page of every query keeps the guest mode
    for (const call of [...m.Song.listSongBySetList.mock.calls, ...m.Vote.listVoteBySetList.mock.calls]) {
      expect(call[1]).toMatchObject({ authMode: 'identityPool' });
    }
  });

  it('fetches songs and votes in parallel and fails closed when either read fails', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({ data: null, errors: [{ message: 'gsi down' }] });
    await expect(fetchPublicSetListRows('sl-1', 'identityPool')).rejects.toThrow('gsi down');
    expect(m.Song.listSongBySetList).toHaveBeenCalled();
  });
});

describe('auth gating', () => {
  it.each([
    ['createSetList', () => createSetList('band-1', 'Gig')],
    ['renameSetList', () => renameSetList('sl-1', 'Gig')],
    ['archiveSetList', () => archiveSetList('band-1', 'sl-1')],
    ['setSetListShared', () => setSetListShared('band-1', 'sl-1', true)],
    ['fetchSetListRows', () => fetchSetListRows('sl-1')],
    ['updateSong', () => updateSong('s1', { title: 'x' })],
    ['deleteSong', () => deleteSong('s1')],
    ['deleteMyContent', () => deleteMyContent(band(), true)],
    ['suggestSong', () => suggestSong(makeView(), 'sl-1', { title: 'x' }, 0)],
  ])('%s never touches the API when signed out', async (_name, call) => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(call()).rejects.toThrow('Not authenticated');
    for (const model of [m.Band, m.SetList, m.Song, m.Vote, m.SongColor]) {
      for (const fn of Object.values(model)) expect(fn).not.toHaveBeenCalled();
    }
    expect(m.graphql).not.toHaveBeenCalled();
  });
});

describe('deleteMyContent', () => {
  beforeEach(() => {
    m.Vote.listVoteBySetList.mockResolvedValue({
      data: [voteRow('s1', 'sub-me', 'up'), voteRow('s2', 'sub-me', 'down')],
      nextToken: null,
    });
    m.Song.listSongBySetList.mockResolvedValue({
      data: [songRow('mine', 'sub-me'), songRow('theirs', 'sub-bob')],
      nextToken: null,
    });
    m.Vote.delete.mockResolvedValue({ data: {} });
    m.Song.delete.mockResolvedValue({ data: {} });
  });

  it('deletes own votes via the exact owner sort-key query, across active AND archived lists', async () => {
    await deleteMyContent(band({ setListIds: ['sl-1'], archivedSetListIds: ['sl-old'] }), false);
    expect(m.Vote.listVoteBySetList.mock.calls.map((c) => c[0])).toEqual([
      { setListId: 'sl-1', owner: { eq: 'sub-me' } },
      { setListId: 'sl-old', owner: { eq: 'sub-me' } },
    ]);
    expect(m.Vote.delete).toHaveBeenCalledTimes(4);
    expect(m.Vote.delete).toHaveBeenCalledWith({ songId: 's1', owner: 'sub-me' });
    expect(m.Song.delete).not.toHaveBeenCalled();
  });

  it('with includeSongs, deletes only the caller\'s own songs', async () => {
    await deleteMyContent(band(), true);
    expect(m.Song.delete).toHaveBeenCalledTimes(1);
    expect(m.Song.delete).toHaveBeenCalledWith({ id: 'mine' });
  });

  it('tolerates rows that are already gone', async () => {
    m.Vote.delete.mockResolvedValue({ data: null, errors: UNAUTH });
    await expect(deleteMyContent(band(), false)).resolves.toBeUndefined();
  });
});

describe('deleteMyContent hardening', () => {
  beforeEach(() => {
    m.Song.listSongBySetList.mockResolvedValue({ data: [], nextToken: null });
    m.Vote.delete.mockResolvedValue({ data: {} });
    m.Song.delete.mockResolvedValue({ data: {} });
  });

  it('never has more than a bounded number of deletes in flight, however many votes exist', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({
      data: Array.from({ length: 60 }, (_, i) => voteRow(`s${i}`, 'sub-me', 'up')),
      nextToken: null,
    });
    let active = 0;
    let peak = 0;
    m.Vote.delete.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return { data: {} };
    });
    await deleteMyContent(band({ setListIds: ['sl-1', 'sl-2', 'sl-3'] }), false);
    expect(m.Vote.delete).toHaveBeenCalledTimes(180);
    expect(peak).toBeLessThanOrEqual(18); // 3 lists at once x 6 deletes each
  });

  it('only processes the capped prefix of a hostile band\'s id arrays', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({ data: [], nextToken: null });
    const hostile = band({
      setListIds: Array.from({ length: 500 }, (_, i) => `a${i}`),
      archivedSetListIds: Array.from({ length: 500 }, (_, i) => `z${i}`),
    });
    await deleteMyContent(hostile, false);
    expect(m.Vote.listVoteBySetList).toHaveBeenCalledTimes(10 + 50);
  });

  it('attempts everything, then reports a failure so the caller can say data may remain', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({
      data: [voteRow('s1', 'sub-me', 'up'), voteRow('s2', 'sub-me', 'up'), voteRow('s3', 'sub-me', 'up')],
      nextToken: null,
    });
    m.Vote.delete.mockImplementation(async ({ songId }: { songId: string }) =>
      songId === 's2' ? { data: null, errors: [{ message: 'throttled' }] } : { data: {} },
    );
    await expect(deleteMyContent(band(), false)).rejects.toThrow('throttled');
    expect(m.Vote.delete).toHaveBeenCalledTimes(3); // the other deletes were still attempted
  });

  it('deletes songs only when asked, and only the caller\'s own', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({ data: [], nextToken: null });
    m.Song.listSongBySetList.mockResolvedValue({
      data: [songRow('mine', 'sub-me'), songRow('theirs', 'sub-bob')],
      nextToken: null,
    });
    await deleteMyContent(band(), false);
    expect(m.Song.delete).not.toHaveBeenCalled();
    await deleteMyContent(band(), true);
    expect(m.Song.delete).toHaveBeenCalledTimes(1);
    expect(m.Song.delete).toHaveBeenCalledWith({ id: 'mine' });
  });
});
