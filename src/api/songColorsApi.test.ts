import { beforeEach, describe, expect, it, vi } from 'vitest';

const { m } = vi.hoisted(() => {
  const m = {
    SongColor: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), listSongColorBySetList: vi.fn() },
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

import { deleteMyColorRows, setSongColor } from './songColorsApi';
import { getCurrentUserSub, isAuthenticated } from './authUtils';
import { NotSignedInError } from './bandsShared';

const CONFLICT = [{ errorType: 'DynamoDB:ConditionalCheckFailedException', message: 'conditional' }];
const UNAUTH = [{ errorType: 'Unauthorized', message: 'Not Authorized' }];
const OK = { data: {} };
const song = { id: 'song-1', bandId: 'band-1', setListId: 'sl-1' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthenticated).mockResolvedValue(true);
  vi.mocked(getCurrentUserSub).mockResolvedValue('sub-me');
  for (const fn of Object.values(m.SongColor)) fn.mockReset();
});

describe('setSongColor', () => {
  it('first color: creates the row keyed by the song and the caller', async () => {
    m.SongColor.create.mockResolvedValue(OK);
    await setSongColor(song, 'red', false);
    expect(m.SongColor.create).toHaveBeenCalledWith({
      songId: 'song-1',
      owner: 'sub-me',
      bandId: 'band-1',
      setListId: 'sl-1',
      color: 'red',
    });
    expect(m.SongColor.update).not.toHaveBeenCalled();
  });

  it('changing a color: updates the existing row, never creating a second one', async () => {
    m.SongColor.update.mockResolvedValue(OK);
    await setSongColor(song, 'blue', true);
    expect(m.SongColor.update).toHaveBeenCalledWith({
      songId: 'song-1',
      owner: 'sub-me',
      bandId: 'band-1',
      setListId: 'sl-1',
      color: 'blue',
    });
    expect(m.SongColor.create).not.toHaveBeenCalled();
  });

  it('keys the row by the current user sub, so each member has their own row for a song', async () => {
    m.SongColor.create.mockResolvedValue(OK);
    vi.mocked(getCurrentUserSub).mockResolvedValue('sub-other');
    await setSongColor(song, 'red', false);
    expect(m.SongColor.create).toHaveBeenCalledWith(expect.objectContaining({ songId: 'song-1', owner: 'sub-other' }));
  });

  it('writes the same owner on the update path and on the create fallback', async () => {
    m.SongColor.update.mockResolvedValue({ data: null, errors: CONFLICT });
    m.SongColor.create.mockResolvedValue(OK);
    await setSongColor(song, 'red', true);
    expect(m.SongColor.update).toHaveBeenCalledWith(expect.objectContaining({ owner: 'sub-me' }));
    expect(m.SongColor.create).toHaveBeenCalledWith(expect.objectContaining({ owner: 'sub-me' }));
  });

  it('reads the sub once per pick, after the sign-in check', async () => {
    m.SongColor.create.mockResolvedValue({ data: null, errors: CONFLICT });
    m.SongColor.update.mockResolvedValue({ data: null, errors: CONFLICT });
    await expect(setSongColor(song, 'red', false)).rejects.toThrow();
    expect(getCurrentUserSub).toHaveBeenCalledTimes(1);
  });

  it('a failing sub lookup rejects the pick without writing anything', async () => {
    vi.mocked(getCurrentUserSub).mockRejectedValue(new Error('no session'));
    await expect(setSongColor(song, 'red', false)).rejects.toThrow('no session');
    expect(m.SongColor.create).not.toHaveBeenCalled();
    expect(m.SongColor.update).not.toHaveBeenCalled();
  });

  it('clearing writes the "none" sentinel (rows are never deleted)', async () => {
    m.SongColor.update.mockResolvedValue(OK);
    await setSongColor(song, null, true);
    expect(m.SongColor.update).toHaveBeenCalledWith(expect.objectContaining({ songId: 'song-1', color: 'none' }));
  });

  it('clearing with no known row still goes through create with "none"', async () => {
    m.SongColor.create.mockResolvedValue(OK);
    await setSongColor(song, null, false);
    expect(m.SongColor.create).toHaveBeenCalledWith(expect.objectContaining({ color: 'none' }));
  });

  it('create conflict (a stale view or another tab colored it): falls back to updating to the wanted color', async () => {
    m.SongColor.create.mockResolvedValue({ data: null, errors: CONFLICT });
    m.SongColor.update.mockResolvedValue(OK);
    await setSongColor(song, 'green', false);
    expect(m.SongColor.update).toHaveBeenCalledWith(expect.objectContaining({ songId: 'song-1', color: 'green' }));
  });

  it('update conflict: falls back to creating', async () => {
    m.SongColor.update.mockResolvedValue({ data: null, errors: CONFLICT });
    m.SongColor.create.mockResolvedValue(OK);
    await setSongColor(song, 'green', true);
    expect(m.SongColor.create).toHaveBeenCalledTimes(1);
  });

  it('update of a vanished row (Unauthorized on the missing item): falls back to creating', async () => {
    m.SongColor.update.mockResolvedValue({ data: null, errors: UNAUTH });
    m.SongColor.create.mockResolvedValue(OK);
    await setSongColor(song, 'pink', true);
    expect(m.SongColor.create).toHaveBeenCalledTimes(1);
  });

  it('covers a row that changes between attempts (update, create, update)', async () => {
    m.SongColor.update.mockResolvedValueOnce({ data: null, errors: UNAUTH }).mockResolvedValueOnce(OK);
    m.SongColor.create.mockResolvedValue({ data: null, errors: CONFLICT });
    await setSongColor(song, 'teal', true);
    expect(m.SongColor.update).toHaveBeenCalledTimes(2);
    expect(m.SongColor.create).toHaveBeenCalledTimes(1);
  });

  it('gives up after bounded attempts instead of looping', async () => {
    m.SongColor.create.mockResolvedValue({ data: null, errors: CONFLICT });
    m.SongColor.update.mockResolvedValue({ data: null, errors: CONFLICT });
    await expect(setSongColor(song, 'red', false)).rejects.toThrow('Could not save the song color. Please try again.');
    expect(m.SongColor.create.mock.calls.length + m.SongColor.update.mock.calls.length).toBe(3);
  });

  it('surfaces real errors from create and update', async () => {
    m.SongColor.create.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(setSongColor(song, 'red', false)).rejects.toThrow('createSongColor: throttled');
    m.SongColor.update.mockResolvedValue({ data: null, errors: [{ message: 'throttled' }] });
    await expect(setSongColor(song, 'red', true)).rejects.toThrow('updateSongColor: throttled');
  });

  it('serialises rapid picks on the same song (second waits for the first)', async () => {
    const events: string[] = [];
    m.SongColor.create.mockImplementation(async () => {
      events.push('create:start');
      await new Promise((r) => setTimeout(r, 10));
      events.push('create:end');
      return OK;
    });
    m.SongColor.update.mockImplementation(async () => {
      events.push('update');
      return OK;
    });
    await Promise.all([setSongColor(song, 'red', false), setSongColor(song, 'blue', true)]);
    expect(events).toEqual(['create:start', 'create:end', 'update']);
  });

  it('different songs are not serialised against each other', async () => {
    const events: string[] = [];
    m.SongColor.create.mockImplementation(async (i: { songId: string }) => {
      events.push(`start:${i.songId}`);
      await new Promise((r) => setTimeout(r, 10));
      events.push(`end:${i.songId}`);
      return OK;
    });
    await Promise.all([
      setSongColor(song, 'red', false),
      setSongColor({ ...song, id: 'song-2' }, 'red', false),
    ]);
    expect(events.slice(0, 2)).toEqual(['start:song-1', 'start:song-2']);
  });

  it('a failed call does not block the next pick on that song', async () => {
    m.SongColor.create.mockResolvedValueOnce({ data: null, errors: [{ message: 'boom' }] }).mockResolvedValue(OK);
    const first = setSongColor(song, 'red', false);
    const second = setSongColor(song, 'blue', false);
    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBeUndefined();
  });

  it('signed out: rejects with NotSignedInError and never touches the API', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(setSongColor(song, 'red', false)).rejects.toBeInstanceOf(NotSignedInError);
    await expect(setSongColor(song, 'red', true)).rejects.toThrow('Not authenticated');
    expect(m.SongColor.create).not.toHaveBeenCalled();
    expect(m.SongColor.update).not.toHaveBeenCalled();
    expect(getCurrentUserSub).not.toHaveBeenCalled();
  });
});

describe('deleteMyColorRows', () => {
  it('queries only the caller\'s rows (owner sort key) and deletes each by (songId, owner)', async () => {
    m.SongColor.listSongColorBySetList.mockResolvedValue({
      data: [{ songId: 's1', owner: 'sub-me' }, { songId: 's2', owner: 'sub-me' }],
      nextToken: null,
    });
    m.SongColor.delete.mockResolvedValue(OK);
    await deleteMyColorRows('sl-1', 'sub-me');
    expect(m.SongColor.listSongColorBySetList).toHaveBeenCalledWith(
      { setListId: 'sl-1', owner: { eq: 'sub-me' } },
      expect.anything(),
    );
    expect(m.SongColor.delete).toHaveBeenCalledWith({ songId: 's1', owner: 'sub-me' });
    expect(m.SongColor.delete).toHaveBeenCalledWith({ songId: 's2', owner: 'sub-me' });
  });

  it('treats an already-gone row (conflict / Unauthorized) as success but surfaces real errors', async () => {
    m.SongColor.listSongColorBySetList.mockResolvedValue({ data: [{ songId: 's1', owner: 'sub-me' }], nextToken: null });
    m.SongColor.delete.mockResolvedValueOnce({ errors: UNAUTH });
    await expect(deleteMyColorRows('sl-1', 'sub-me')).resolves.toBeUndefined();
    m.SongColor.delete.mockResolvedValueOnce({ errors: [{ message: 'boom' }] });
    await expect(deleteMyColorRows('sl-1', 'sub-me')).rejects.toThrow('boom');
  });

  it('is signed-in only: a signed-out call rejects before any read', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(deleteMyColorRows('sl-1', 'sub-me')).rejects.toBeInstanceOf(NotSignedInError);
    expect(m.SongColor.listSongColorBySetList).not.toHaveBeenCalled();
  });
});
