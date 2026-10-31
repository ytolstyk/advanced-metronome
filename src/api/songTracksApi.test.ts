import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackPiece } from '../audio/ClickTrackEngine';

const { m } = vi.hoisted(() => {
  const m: Record<string, unknown> & {
    SongClickTrack: Record<string, ReturnType<typeof vi.fn>> | undefined;
  } = {
    SongClickTrack: { get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listSongClickTrackBySetList: vi.fn() },
  };
  return { m };
});

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({ models: m, graphql: vi.fn() })),
}));
vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(async () => true),
  getCurrentUserSub: vi.fn(async () => 'sub-me'),
}));

import { clearSongTrack, deleteMyTrackRows, getSongTrack, saveSongTrack, SongTrackUnavailableError } from './songTracksApi';
import { listSongTrackMeta } from './bandReads';
import { getCurrentUserSub, isAuthenticated } from './authUtils';
import { NotSignedInError } from './bandsShared';
import { BAND_TRACK_FORMAT, encodeBandTrack } from '../clickTrackBand';
import type { BandView } from '../bandTypes';

const CONFLICT = [{ errorType: 'DynamoDB:ConditionalCheckFailedException', message: 'conditional' }];
const UNAUTH = [{ errorType: 'Unauthorized', message: 'Not Authorized' }];
const OK = { data: {} };

const model = () => m.SongClickTrack!;
const ALL = { ...{ get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listSongClickTrackBySetList: vi.fn() } };

const song = { id: 'song-1', bandId: 'band-1', setListId: 'sl-1' };
const piece: TrackPiece = {
  id: 'p1',
  label: 'Verse',
  color: '#8b5cf6',
  groupId: null,
  timeSignature: { numerator: 4, denominator: 4 },
  subdivision: 'quarter',
  bpm: 120,
  repeats: 4,
};
const view = (over: Partial<Pick<BandView, 'isMember'>> = {}) =>
  ({ isMember: true, band: { id: 'band-1' }, setLists: [{ id: 'sl-1' }], ...over }) as unknown as BandView;
const stored = () => encodeBandTrack([piece], []);
const row = (over: Record<string, unknown> = {}) => ({
  songId: 'song-1',
  owner: 'sub-bob',
  bandId: 'band-1',
  setListId: 'sl-1',
  format: BAND_TRACK_FORMAT,
  ...stored(),
  createdAt: '2026-02-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  ...over,
});
const shown = { owner: 'sub-bob', stamp: '2026-02-01T00:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthenticated).mockResolvedValue(true);
  vi.mocked(getCurrentUserSub).mockResolvedValue('sub-me');
  m.SongClickTrack = ALL;
  for (const fn of Object.values(ALL)) fn.mockReset();
});

describe('saveSongTrack', () => {
  it('first save: creates my row keyed by song and me, with the encoded track', async () => {
    model().create.mockResolvedValue(OK);
    await saveSongTrack(view(), song, [piece], [], false);
    const { track, bytes } = stored();
    expect(model().create).toHaveBeenCalledWith(
      { songId: 'song-1', owner: 'sub-me', bandId: 'band-1', setListId: 'sl-1', format: 1, bytes, track },
      expect.anything(),
    );
    expect(model().update).not.toHaveBeenCalled();
  });

  it('replace: updates my own row when I already have one', async () => {
    model().update.mockResolvedValue(OK);
    await saveSongTrack(view(), song, [piece], [], true);
    expect(model().update).toHaveBeenCalledWith(expect.objectContaining({ owner: 'sub-me', songId: 'song-1' }), expect.anything());
    expect(model().create).not.toHaveBeenCalled();
  });

  it('falls back to create when the row to update is gone, and to update when the create finds a row', async () => {
    model().update.mockResolvedValue({ data: null, errors: UNAUTH });
    model().create.mockResolvedValue(OK);
    await saveSongTrack(view(), song, [piece], [], true);
    expect(model().create).toHaveBeenCalledTimes(1);

    model().update.mockReset().mockResolvedValue(OK);
    model().create.mockReset().mockResolvedValue({ data: null, errors: CONFLICT });
    await saveSongTrack(view(), song, [piece], [], false);
    expect(model().update).toHaveBeenCalledTimes(1);
  });

  it('never selects the payload in a write (it would echo up to 250 KB back)', async () => {
    model().create.mockResolvedValue(OK);
    await saveSongTrack(view(), song, [piece], [], false);
    const selection = (model().create.mock.calls[0]![1] as { selectionSet: string[] }).selectionSet;
    expect(selection).not.toContain('track');
    expect(selection).not.toContain('bandId');
  });

  it('surfaces a real write failure', async () => {
    model().create.mockResolvedValue({ data: null, errors: [{ errorType: 'InternalFailure', message: 'boom' }] });
    await expect(saveSongTrack(view(), song, [piece], [], false)).rejects.toThrow(/boom/);
  });

  it('refuses non-members, songs outside the loaded band / set list, and over-limit tracks without writing', async () => {
    await expect(saveSongTrack(view({ isMember: false }), song, [piece], [], false)).rejects.toThrow(/Join the band/);
    await expect(saveSongTrack(view(), { ...song, setListId: 'sl-other' }, [piece], [], false)).rejects.toThrow(/Set list not found/);
    await expect(saveSongTrack(view(), { ...song, bandId: 'band-2' }, [piece], [], false)).rejects.toThrow(/Set list not found/);
    await expect(saveSongTrack(view(), song, [], [], false)).rejects.toThrow(/nothing to save/);
    expect(model().create).not.toHaveBeenCalled();
    expect(model().update).not.toHaveBeenCalled();
  });

  it('requires sign-in', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(saveSongTrack(view(), song, [piece], [], false)).rejects.toBeInstanceOf(NotSignedInError);
  });

  it('says so when the backend has no click track model yet', async () => {
    m.SongClickTrack = undefined;
    await expect(saveSongTrack(view(), song, [piece], [], false)).rejects.toBeInstanceOf(SongTrackUnavailableError);
  });
});

describe('clearSongTrack', () => {
  it('writes my own cleared row (0 bytes, empty track) and never deletes', async () => {
    model().create.mockResolvedValue(OK);
    await clearSongTrack(song, false);
    expect(model().create).toHaveBeenCalledWith(
      { songId: 'song-1', owner: 'sub-me', bandId: 'band-1', setListId: 'sl-1', format: 1, bytes: 0, track: '' },
      expect.anything(),
    );
    expect(model().delete).not.toHaveBeenCalled();
  });

  it('a member with no row of their own takes the create path (exists comes from the view)', async () => {
    model().create.mockResolvedValue(OK);
    await clearSongTrack(song, false);
    expect(model().update).not.toHaveBeenCalled();
  });
});

describe('getSongTrack', () => {
  it('reads the shown author’s row by exact key and returns the parsed track', async () => {
    model().get.mockResolvedValue({ data: row() });
    const res = await getSongTrack(song, shown);
    expect(model().get).toHaveBeenCalledWith({ songId: 'song-1', owner: 'sub-bob' });
    expect(res).toMatchObject({ status: 'ok', stale: false });
    if (res.status === 'ok') expect(res.pieces).toEqual([piece]);
  });

  it('flags a row saved since the page listed it, but still returns it', async () => {
    model().get.mockResolvedValue({ data: row({ updatedAt: '2026-03-01T00:00:00Z' }) });
    expect(await getSongTrack(song, shown)).toMatchObject({ status: 'ok', stale: true });
  });

  it('reports a vanished or cleared row as gone', async () => {
    model().get.mockResolvedValue({ data: null });
    expect(await getSongTrack(song, shown)).toEqual({ status: 'gone' });
    model().get.mockResolvedValue({ data: row({ bytes: 0, track: '' }) });
    expect(await getSongTrack(song, shown)).toEqual({ status: 'gone' });
  });

  it('reports a newer-format row, a damaged row and a forged size as not playable', async () => {
    model().get.mockResolvedValue({ data: row({ format: 2 }) });
    expect(await getSongTrack(song, shown)).toEqual({ status: 'newer' });
    model().get.mockResolvedValue({ data: row({ track: '{"pieces":[],"groups":[]}', bytes: 24 }) });
    expect((await getSongTrack(song, shown)).status).toBe('unreadable');
    model().get.mockResolvedValue({ data: row({ bytes: 5 }) });
    expect((await getSongTrack(song, shown)).status).toBe('unreadable');
  });

  it('refuses a row whose parents point at another song, set list or band', async () => {
    for (const over of [{ songId: 'other' }, { setListId: 'sl-other' }, { bandId: 'band-other' }, { owner: 'sub-eve' }]) {
      model().get.mockResolvedValue({ data: row(over) });
      expect((await getSongTrack(song, shown)).status).toBe('unreadable');
    }
  });

  it('throws on a read error instead of pretending the track is gone', async () => {
    model().get.mockResolvedValue({ data: null, errors: [{ errorType: 'InternalFailure', message: 'boom' }] });
    await expect(getSongTrack(song, shown)).rejects.toThrow(/boom/);
  });

  it('requires sign-in', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(getSongTrack(song, shown)).rejects.toBeInstanceOf(NotSignedInError);
  });
});

describe('listSongTrackMeta', () => {
  it('queries the set list index with an explicit selection that omits the payload and bandId', async () => {
    model().listSongClickTrackBySetList.mockResolvedValue({
      data: [{ songId: 's1', owner: 'a', setListId: 'sl-1', format: 1, bytes: 400, createdAt: 'c', updatedAt: 'u' }],
      nextToken: null,
    });
    const res = await listSongTrackMeta('sl-1');
    expect(res).toEqual({
      items: [{ songId: 's1', owner: 'a', setListId: 'sl-1', format: 1, bytes: 400, createdAt: 'c', updatedAt: 'u' }],
      incomplete: false,
    });
    const [key, opts] = model().listSongClickTrackBySetList.mock.calls[0]!;
    expect(key).toEqual({ setListId: 'sl-1' });
    expect(opts.selectionSet).toEqual(['songId', 'owner', 'setListId', 'format', 'bytes', 'createdAt', 'updatedAt']);
  });

  it('is empty and complete on a backend without the model (no banner on old backends)', async () => {
    m.SongClickTrack = undefined;
    expect(await listSongTrackMeta('sl-1')).toEqual({ items: [], incomplete: false });
  });

  it('stops at the page cap and says the list may be incomplete', async () => {
    model().listSongClickTrackBySetList.mockResolvedValue({ data: [], nextToken: 'more' });
    const res = await listSongTrackMeta('sl-1');
    expect(res.incomplete).toBe(true);
    expect(model().listSongClickTrackBySetList.mock.calls.length).toBeLessThanOrEqual(10);
  });
});

describe('deleteMyTrackRows', () => {
  it('lists only my rows by the owner sort key and deletes each by key without echoing payloads', async () => {
    model().listSongClickTrackBySetList.mockResolvedValue({ data: [{ songId: 's1', owner: 'sub-me' }, { songId: 's2', owner: 'sub-me' }], nextToken: null });
    model().delete.mockResolvedValue(OK);
    await deleteMyTrackRows('sl-1', 'sub-me');
    expect(model().listSongClickTrackBySetList.mock.calls[0]![0]).toEqual({ setListId: 'sl-1', owner: { eq: 'sub-me' } });
    expect(model().delete).toHaveBeenCalledWith({ songId: 's1', owner: 'sub-me' }, { selectionSet: ['songId', 'owner'] });
    expect(model().delete).toHaveBeenCalledWith({ songId: 's2', owner: 'sub-me' }, { selectionSet: ['songId', 'owner'] });
  });

  it('treats an already-deleted row as done, but surfaces a real failure after trying every row', async () => {
    model().listSongClickTrackBySetList.mockResolvedValue({ data: [{ songId: 's1', owner: 'sub-me' }, { songId: 's2', owner: 'sub-me' }], nextToken: null });
    model().delete.mockResolvedValueOnce({ data: null, errors: UNAUTH }).mockResolvedValueOnce({ data: null, errors: [{ errorType: 'InternalFailure', message: 'boom' }] });
    await expect(deleteMyTrackRows('sl-1', 'sub-me')).rejects.toThrow(/boom/);
    expect(model().delete).toHaveBeenCalledTimes(2);
  });

  it('does nothing on a backend without the model', async () => {
    m.SongClickTrack = undefined;
    await expect(deleteMyTrackRows('sl-1', 'sub-me')).resolves.toBeUndefined();
  });

  it('requires sign-in', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    await expect(deleteMyTrackRows('sl-1', 'sub-me')).rejects.toBeInstanceOf(NotSignedInError);
  });
});
