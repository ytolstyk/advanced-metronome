import { beforeEach, describe, expect, it, vi } from 'vitest';

const { m } = vi.hoisted(() => {
  const m = {
    Vote: { get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listVoteBySetList: vi.fn() },
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

import { PUBLIC_READ_PAGES } from '../bandTypes';
import { listVotes } from './bandReads';
import { castVote, deleteVoteRow, listVotesByOwner, listVotesForSetList } from './songVotesApi';
import { isAuthenticated } from './authUtils';

const CONFLICT = [{ errorType: 'DynamoDB:ConditionalCheckFailedException', message: 'conditional' }];
const UNAUTH = [{ errorType: 'Unauthorized', message: 'Not Authorized' }];
const OK = { data: {} };
const song = { id: 'song-1', bandId: 'band-1', setListId: 'sl-1' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthenticated).mockResolvedValue(true);
  for (const fn of Object.values(m.Vote)) fn.mockReset();
});

describe('castVote', () => {
  it('first vote: creates the row keyed by (song, me)', async () => {
    m.Vote.create.mockResolvedValue(OK);
    await castVote(song, 'up', undefined);
    expect(m.Vote.create).toHaveBeenCalledWith({
      songId: 'song-1',
      owner: 'sub-me',
      value: 'up',
      bandId: 'band-1',
      setListId: 'sl-1',
    });
    expect(m.Vote.update).not.toHaveBeenCalled();
  });

  it('switching: updates the existing row, never creating a second one', async () => {
    m.Vote.update.mockResolvedValue(OK);
    await castVote(song, 'down', 'up');
    expect(m.Vote.update).toHaveBeenCalledWith({ songId: 'song-1', owner: 'sub-me', value: 'down' });
    expect(m.Vote.create).not.toHaveBeenCalled();
  });

  it('retract: deletes the row', async () => {
    m.Vote.delete.mockResolvedValue(OK);
    await castVote(song, null, 'up');
    expect(m.Vote.delete).toHaveBeenCalledWith({ songId: 'song-1', owner: 'sub-me' });
  });

  it('retract: a failed condition means the vote is already gone', async () => {
    m.Vote.delete.mockResolvedValue({ data: null, errors: CONFLICT });
    await expect(castVote(song, null, undefined)).resolves.toBeUndefined();
  });

  it('retract: Unauthorized is success only when a re-read shows the row is gone', async () => {
    m.Vote.delete.mockResolvedValue({ data: null, errors: UNAUTH });
    m.Vote.get.mockResolvedValue({ data: null });
    await expect(castVote(song, null, 'up')).resolves.toBeUndefined();
    expect(m.Vote.get).toHaveBeenCalledWith({ songId: 'song-1', owner: 'sub-me' });
  });

  it('retract: Unauthorized while the vote still exists is a real failure (never shown as retracted)', async () => {
    m.Vote.delete.mockResolvedValue({ data: null, errors: UNAUTH });
    m.Vote.get.mockResolvedValue({ data: { songId: 'song-1', owner: 'sub-me', value: 'up' } });
    await expect(castVote(song, null, 'up')).rejects.toThrow('Not Authorized');
  });

  it('create conflict (a stale view or another tab voted): falls back to updating to the wanted value', async () => {
    m.Vote.create.mockResolvedValue({ data: null, errors: CONFLICT });
    m.Vote.update.mockResolvedValue(OK);
    await castVote(song, 'down', undefined);
    expect(m.Vote.update).toHaveBeenCalledWith({ songId: 'song-1', owner: 'sub-me', value: 'down' });
  });

  it('update of a vanished row (retracted elsewhere): falls back to creating', async () => {
    m.Vote.update.mockResolvedValue({ data: null, errors: UNAUTH });
    m.Vote.create.mockResolvedValue(OK);
    await castVote(song, 'up', 'down');
    expect(m.Vote.create).toHaveBeenCalledTimes(1);
  });

  it('gives up after bounded attempts instead of looping', async () => {
    m.Vote.create.mockResolvedValue({ data: null, errors: CONFLICT });
    m.Vote.update.mockResolvedValue({ data: null, errors: CONFLICT });
    await expect(castVote(song, 'up', undefined)).rejects.toThrow('Could not save your vote');
    expect(m.Vote.create.mock.calls.length + m.Vote.update.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('surfaces real errors from create/update/delete', async () => {
    m.Vote.create.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(castVote(song, 'up', undefined)).rejects.toThrow('throttled');
    m.Vote.update.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(castVote(song, 'up', 'down')).rejects.toThrow('throttled');
    m.Vote.delete.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(castVote(song, null, 'up')).rejects.toThrow('throttled');
  });

  it('serialises rapid clicks on the same song (second waits for the first)', async () => {
    const events: string[] = [];
    m.Vote.create.mockImplementation(async () => {
      events.push('create:start');
      await new Promise((r) => setTimeout(r, 10));
      events.push('create:end');
      return OK;
    });
    m.Vote.update.mockImplementation(async () => {
      events.push('update');
      return OK;
    });
    await Promise.all([castVote(song, 'up', undefined), castVote(song, 'down', 'up')]);
    expect(events).toEqual(['create:start', 'create:end', 'update']);
  });

  it('different songs are not serialised against each other', async () => {
    const events: string[] = [];
    m.Vote.create.mockImplementation(async (i: { songId: string }) => {
      events.push(`start:${i.songId}`);
      await new Promise((r) => setTimeout(r, 10));
      events.push(`end:${i.songId}`);
      return OK;
    });
    await Promise.all([castVote(song, 'up', undefined), castVote({ ...song, id: 'song-2' }, 'up', undefined)]);
    expect(events.slice(0, 2)).toEqual(['start:song-1', 'start:song-2']);
  });

  it('requires sign-in', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(castVote(song, 'up', undefined)).rejects.toThrow('Not authenticated');
    expect(m.Vote.create).not.toHaveBeenCalled();
  });
});

describe('listVotesForSetList', () => {
  const row = (songId: string, owner: string) => ({
    songId,
    owner,
    value: 'up',
    bandId: 'band-1',
    setListId: 'sl-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });

  it('follows pagination with the page size and maps rows', async () => {
    m.Vote.listVoteBySetList
      .mockResolvedValueOnce({ data: [row('s1', 'a')], nextToken: 't1' })
      .mockResolvedValueOnce({ data: [row('s2', 'b')], nextToken: null });
    const res = await listVotesForSetList('sl-1');
    expect(res.items.map((v) => v.songId)).toEqual(['s1', 's2']);
    expect(res.incomplete).toBe(false);
    expect(m.Vote.listVoteBySetList.mock.calls[0]).toEqual([{ setListId: 'sl-1' }, { limit: 250, nextToken: undefined }]);
    expect(m.Vote.listVoteBySetList.mock.calls[1][1]).toEqual({ limit: 250, nextToken: 't1' });
  });

  it('flags incomplete when the page cap is hit (e.g. a junk flood)', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({ data: [row('s', 'a')], nextToken: 'more' });
    const res = await listVotesForSetList('sl-1');
    expect(res.incomplete).toBe(true);
    expect(res.items).toHaveLength(50);
  });

  it('throws on API errors so callers fail closed', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({ data: null, errors: [{ message: 'gsi down' }] });
    await expect(listVotesForSetList('sl-1')).rejects.toThrow('gsi down');
  });
});

describe('listVotesForSetList (signed-in read)', () => {
  it('requires sign-in before querying, with a NotSignedIn error', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(listVotesForSetList('sl-1')).rejects.toMatchObject({ name: 'NotSignedInError' });
    expect(m.Vote.listVoteBySetList).not.toHaveBeenCalled();
  });

  it('sends no authMode (the signed-in default)', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({ data: [], nextToken: null });
    await listVotesForSetList('sl-1');
    expect(m.Vote.listVoteBySetList.mock.calls[0][1]).not.toHaveProperty('authMode');
  });
});

describe('listVotes (public, guest mode)', () => {
  const row = (songId: string, owner: string) => ({
    songId,
    owner,
    value: 'down',
    bandId: 'band-1',
    setListId: 'sl-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });

  it('needs no sign-in: never consults isAuthenticated, and sends the guest authMode', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    m.Vote.listVoteBySetList.mockResolvedValue({ data: [row('s1', 'a')], nextToken: null });
    const res = await listVotes('sl-1', 'identityPool', PUBLIC_READ_PAGES.votes);
    expect(isAuthenticated).not.toHaveBeenCalled();
    expect(res.items.map((v) => v.songId)).toEqual(['s1']);
    expect(res.incomplete).toBe(false);
    expect(m.Vote.listVoteBySetList).toHaveBeenCalledWith(
      { setListId: 'sl-1' },
      { limit: 250, nextToken: undefined, authMode: 'identityPool' },
    );
  });

  it('follows pages with the auth mode on every page', async () => {
    m.Vote.listVoteBySetList
      .mockResolvedValueOnce({ data: [row('s1', 'a')], nextToken: 't1' })
      .mockResolvedValueOnce({ data: [row('s2', 'b')], nextToken: null });
    const res = await listVotes('sl-1', 'userPool', 5);
    expect(res.items.map((v) => v.songId)).toEqual(['s1', 's2']);
    expect(m.Vote.listVoteBySetList.mock.calls[1][1]).toEqual({ limit: 250, nextToken: 't1', authMode: 'userPool' });
  });

  it('stops at the given page cap (not the signed-in 50) and flags incomplete', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({ data: [row('s', 'a')], nextToken: 'more' });
    const res = await listVotes('sl-1', 'identityPool', PUBLIC_READ_PAGES.votes);
    expect(m.Vote.listVoteBySetList).toHaveBeenCalledTimes(PUBLIC_READ_PAGES.votes);
    expect(res.incomplete).toBe(true);
    expect(res.items).toHaveLength(PUBLIC_READ_PAGES.votes);
  });

  it('throws on API errors so callers fail closed', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({ data: null, errors: [{ message: 'gsi down' }] });
    await expect(listVotes('sl-1', 'identityPool', 2)).rejects.toThrow('gsi down');
  });
});

describe('listVotesByOwner / deleteVoteRow', () => {
  it('queries one voter\'s rows with the exact owner sort-key condition', async () => {
    m.Vote.listVoteBySetList.mockResolvedValue({
      data: [{ songId: 's1', owner: 'sub-me', value: 'up', bandId: 'band-1', setListId: 'sl-1', createdAt: 'c', updatedAt: 'u' }],
      nextToken: null,
    });
    const res = await listVotesByOwner('sl-1', 'sub-me');
    expect(res.items.map((v) => v.songId)).toEqual(['s1']);
    expect(m.Vote.listVoteBySetList.mock.calls[0][0]).toEqual({ setListId: 'sl-1', owner: { eq: 'sub-me' } });
  });

  it('requires sign-in before querying', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(listVotesByOwner('sl-1', 'sub-me')).rejects.toThrow('Not authenticated');
    await expect(listVotesForSetList('sl-1')).rejects.toThrow('Not authenticated');
    expect(m.Vote.listVoteBySetList).not.toHaveBeenCalled();
  });

  it('deleteVoteRow requires sign-in on its own (not only via its callers)', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(deleteVoteRow('s1', 'sub-me')).rejects.toThrow('Not authenticated');
    expect(m.Vote.delete).not.toHaveBeenCalled();
  });

  it('deleteVoteRow is best-effort for already-gone rows but surfaces real errors', async () => {
    m.Vote.delete.mockResolvedValue({ data: null, errors: UNAUTH });
    await expect(deleteVoteRow('s1', 'sub-me')).resolves.toBeUndefined();
    m.Vote.delete.mockResolvedValue({ data: null, errors: CONFLICT });
    await expect(deleteVoteRow('s1', 'sub-me')).resolves.toBeUndefined();
    m.Vote.delete.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(deleteVoteRow('s1', 'sub-me')).rejects.toThrow('throttled');
  });
});
