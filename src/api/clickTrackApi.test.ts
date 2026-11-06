import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TrackPiece } from '@/audio/ClickTrackEngine';
import type { SegmentGroup } from './clickTrackApi';

const { mockModel } = vi.hoisted(() => ({
  mockModel: { create: vi.fn(), update: vi.fn(), list: vi.fn(), delete: vi.fn() },
}));

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({ models: { ClickTrack: mockModel } })),
}));

vi.mock('./authUtils', () => ({ isAuthenticated: vi.fn(), getCurrentUserSub: vi.fn() }));

import { loadCloudClickTracks, saveCloudClickTrack, saveCloudCopyForSong } from './clickTrackApi';
import { getCurrentUserSub, isAuthenticated } from './authUtils';

const piece = (over: Partial<TrackPiece> = {}): TrackPiece => ({
  id: 'p1',
  label: 'Verse',
  color: '#8b5cf6',
  groupId: null,
  timeSignature: { numerator: 4, denominator: 4 },
  subdivision: 'quarter',
  bpm: 120,
  repeats: 4,
  ...over,
});
const pieces = [piece(), piece({ id: 'p2', bpm: 90 })];
const groups: SegmentGroup[] = [{ id: 'g1', name: 'Verse', color: '#ff0000' }];

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(isAuthenticated).mockResolvedValue(true);
  vi.mocked(getCurrentUserSub).mockResolvedValue('sub-a');
});

const idsKey = (sub: string) => `band-song-cloud-track-ids:${sub}`;
const IDS_KEY = idsKey('sub-a');
const remembered = (sub = 'sub-a') => JSON.parse(localStorage.getItem(idsKey(sub)) ?? '{}') as Record<string, string>;

describe('saveCloudCopyForSong', () => {
  it('returns false and touches nothing when signed out', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    localStorage.setItem(IDS_KEY, JSON.stringify({ s1: 't1' }));
    expect(await saveCloudCopyForSong('s1', 'Song', pieces, groups)).toBe(false);
    expect(mockModel.update).not.toHaveBeenCalled();
    expect(mockModel.create).not.toHaveBeenCalled();
    expect(mockModel.list).not.toHaveBeenCalled();
  });

  it('creates a track when the song has no remembered copy, and remembers its id', async () => {
    mockModel.create.mockResolvedValue({ data: { id: 'new', name: 'Song' } });
    expect(await saveCloudCopyForSong('s1', 'Song', pieces, groups)).toBe(true);
    expect(mockModel.create).toHaveBeenCalledWith({
      name: 'Song',
      piecesJson: JSON.stringify(pieces),
      groupsJson: JSON.stringify(groups),
    });
    expect(mockModel.update).not.toHaveBeenCalled();
    expect(remembered()).toEqual({ s1: 'new' });
  });

  it('never lists or filters the table, whichever path it takes', async () => {
    mockModel.create.mockResolvedValue({ data: { id: 'new', name: 'Song' } });
    await saveCloudCopyForSong('s1', 'Song', pieces, groups);
    mockModel.update.mockResolvedValue({ data: { id: 'new' } });
    await saveCloudCopyForSong('s1', 'Song', pieces, groups);
    expect(mockModel.list).not.toHaveBeenCalled();
  });

  it('updates the remembered copy in place, including its name', async () => {
    localStorage.setItem(IDS_KEY, JSON.stringify({ s1: 'old' }));
    mockModel.update.mockResolvedValue({ data: { id: 'old', name: 'Renamed' } });
    expect(await saveCloudCopyForSong('s1', 'Renamed', pieces, groups)).toBe(true);
    expect(mockModel.update).toHaveBeenCalledWith({
      id: 'old',
      name: 'Renamed',
      piecesJson: JSON.stringify(pieces),
      groupsJson: JSON.stringify(groups),
    });
    expect(mockModel.create).not.toHaveBeenCalled();
    expect(remembered()).toEqual({ s1: 'old' });
  });

  it('uses the id remembered for this song, not another song\'s', async () => {
    localStorage.setItem(IDS_KEY, JSON.stringify({ s1: 'one', s2: 'two' }));
    mockModel.update.mockResolvedValue({ data: { id: 'two' } });
    await saveCloudCopyForSong('s2', 'Song', pieces, groups);
    expect(mockModel.update.mock.calls[0]![0].id).toBe('two');
  });

  it('makes a new copy and replaces the remembered id when the remembered track is gone', async () => {
    localStorage.setItem(IDS_KEY, JSON.stringify({ s1: 'deleted', s2: 'keep' }));
    mockModel.update.mockResolvedValue({ data: null });
    mockModel.create.mockResolvedValue({ data: { id: 'fresh', name: 'Song' } });
    expect(await saveCloudCopyForSong('s1', 'Song', pieces, groups)).toBe(true);
    expect(mockModel.create).toHaveBeenCalledTimes(1);
    expect(remembered()).toEqual({ s1: 'fresh', s2: 'keep' });
  });

  it('returns false and remembers nothing when the create comes back empty', async () => {
    mockModel.create.mockResolvedValue({ data: null });
    expect(await saveCloudCopyForSong('s1', 'Song', pieces, groups)).toBe(false);
    expect(localStorage.getItem(IDS_KEY)).toBeNull();
  });

  it('returns false when the create throws', async () => {
    mockModel.create.mockRejectedValue(new Error('denied'));
    await expect(saveCloudCopyForSong('s1', 'Song', pieces, groups)).resolves.toBe(false);
    expect(localStorage.getItem(IDS_KEY)).toBeNull();
  });

  it('returns false when the update throws, without creating a duplicate', async () => {
    localStorage.setItem(IDS_KEY, JSON.stringify({ s1: 'old' }));
    mockModel.update.mockRejectedValue(new Error('conflict'));
    await expect(saveCloudCopyForSong('s1', 'Song', pieces, groups)).resolves.toBe(false);
    expect(mockModel.create).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', 'not json{'],
    ['null', 'null'],
    ['a string', '"hello"'],
  ])('treats a corrupt remembered-ids value (%s) as empty and creates', async (_label, raw) => {
    localStorage.setItem(IDS_KEY, raw);
    mockModel.create.mockResolvedValue({ data: { id: 'new', name: 'Song' } });
    expect(await saveCloudCopyForSong('s1', 'Song', pieces, groups)).toBe(true);
    expect(mockModel.update).not.toHaveBeenCalled();
    expect(remembered()).toEqual({ s1: 'new' });
  });

  it('still reports success when the id cannot be remembered', async () => {
    mockModel.create.mockResolvedValue({ data: { id: 'new', name: 'Song' } });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      expect(await saveCloudCopyForSong('s1', 'Song', pieces, groups)).toBe(true);
    } finally {
      setItem.mockRestore();
    }
  });
});

describe('saveCloudCopyForSong per account', () => {
  it('does not read the key a different account wrote', async () => {
    localStorage.setItem(idsKey('sub-b'), JSON.stringify({ s1: 'bs-track' }));
    mockModel.create.mockResolvedValue({ data: { id: 'a-new', name: 'Song' } });
    expect(await saveCloudCopyForSong('s1', 'Song', pieces, groups)).toBe(true);
    expect(mockModel.update).not.toHaveBeenCalled();
    expect(remembered('sub-a')).toEqual({ s1: 'a-new' });
    expect(remembered('sub-b')).toEqual({ s1: 'bs-track' });
  });

  it('does not use the old shared, un-suffixed key', async () => {
    localStorage.setItem('band-song-cloud-track-ids', JSON.stringify({ s1: 'legacy' }));
    mockModel.create.mockResolvedValue({ data: { id: 'new', name: 'Song' } });
    await saveCloudCopyForSong('s1', 'Song', pieces, groups);
    expect(mockModel.update).not.toHaveBeenCalled();
  });

  it('keeps each account\'s map separate when the user changes', async () => {
    mockModel.create
      .mockResolvedValueOnce({ data: { id: 'a-track', name: 'Song' } })
      .mockResolvedValueOnce({ data: { id: 'b-track', name: 'Song' } });
    await saveCloudCopyForSong('s1', 'Song', pieces, groups);
    vi.mocked(getCurrentUserSub).mockResolvedValue('sub-b');
    await saveCloudCopyForSong('s1', 'Song', pieces, groups);
    expect(remembered('sub-a')).toEqual({ s1: 'a-track' });
    expect(remembered('sub-b')).toEqual({ s1: 'b-track' });
  });

  it('returns false when the account cannot be identified', async () => {
    vi.mocked(getCurrentUserSub).mockRejectedValue(new Error('no session'));
    await expect(saveCloudCopyForSong('s1', 'Song', pieces, groups)).resolves.toBe(false);
    expect(mockModel.create).not.toHaveBeenCalled();
  });
});

describe('saveCloudCopyForSong queueing', () => {
  /** A create that stays pending until `release` is called. */
  function gatedCreate(id: string) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockModel.create.mockImplementationOnce(async () => {
      await gate;
      return { data: { id, name: 'Song' } };
    });
    return release;
  }

  it('makes one track for two overlapping saves of the same song, then updates it', async () => {
    const release = gatedCreate('only');
    mockModel.update.mockResolvedValue({ data: { id: 'only', name: 'Song' } });
    const first = saveCloudCopyForSong('s1', 'Song', pieces, groups);
    const second = saveCloudCopyForSong('s1', 'Song', pieces, groups);
    await vi.waitFor(() => expect(mockModel.create).toHaveBeenCalledTimes(1));
    // the second call is parked behind the first: no update or second create yet
    expect(mockModel.update).not.toHaveBeenCalled();
    release();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(mockModel.create).toHaveBeenCalledTimes(1);
    expect(mockModel.update).toHaveBeenCalledTimes(1);
    expect(mockModel.update.mock.calls[0]![0].id).toBe('only');
  });

  it('runs a third overlapping save after the second, in order', async () => {
    const release = gatedCreate('only');
    mockModel.update.mockResolvedValue({ data: { id: 'only', name: 'Song' } });
    const calls = [
      saveCloudCopyForSong('s1', 'One', pieces, groups),
      saveCloudCopyForSong('s1', 'Two', pieces, groups),
      saveCloudCopyForSong('s1', 'Three', pieces, groups),
    ];
    await vi.waitFor(() => expect(mockModel.create).toHaveBeenCalledTimes(1));
    release();
    expect(await Promise.all(calls)).toEqual([true, true, true]);
    expect(mockModel.create).toHaveBeenCalledTimes(1);
    expect(mockModel.update.mock.calls.map((c) => c[0].name)).toEqual(['Two', 'Three']);
  });

  it('does not make different songs wait for each other', async () => {
    const release = gatedCreate('first');
    mockModel.create.mockResolvedValueOnce({ data: { id: 'second', name: 'Song' } });
    const a = saveCloudCopyForSong('s1', 'Song', pieces, groups);
    await vi.waitFor(() => expect(mockModel.create).toHaveBeenCalledTimes(1));
    // s2 finishes while s1's create is still pending
    expect(await saveCloudCopyForSong('s2', 'Song', pieces, groups)).toBe(true);
    expect(remembered()).toEqual({ s2: 'second' });
    release();
    await a;
    expect(remembered()).toEqual({ s1: 'first', s2: 'second' });
  });

  it('does not make different accounts wait for each other on the same song', async () => {
    const release = gatedCreate('a-track');
    mockModel.create.mockResolvedValueOnce({ data: { id: 'b-track', name: 'Song' } });
    const a = saveCloudCopyForSong('s1', 'Song', pieces, groups);
    await vi.waitFor(() => expect(mockModel.create).toHaveBeenCalledTimes(1));
    vi.mocked(getCurrentUserSub).mockResolvedValue('sub-b');
    expect(await saveCloudCopyForSong('s1', 'Song', pieces, groups)).toBe(true);
    expect(mockModel.update).not.toHaveBeenCalled();
    release();
    await a;
    expect(remembered('sub-a')).toEqual({ s1: 'a-track' });
    expect(remembered('sub-b')).toEqual({ s1: 'b-track' });
  });

  it('still runs the next save after the previous one failed', async () => {
    mockModel.create
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce({ data: { id: 'ok', name: 'Song' } });
    const first = saveCloudCopyForSong('s1', 'Song', pieces, groups);
    const second = saveCloudCopyForSong('s1', 'Song', pieces, groups);
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(remembered()).toEqual({ s1: 'ok' });
  });

  it('does not leave a finished save behind to delay a later, separate one', async () => {
    mockModel.create.mockResolvedValue({ data: { id: 'a', name: 'Song' } });
    await saveCloudCopyForSong('s1', 'Song', pieces, groups);
    mockModel.update.mockResolvedValue({ data: { id: 'a', name: 'Song' } });
    await expect(saveCloudCopyForSong('s1', 'Song', pieces, groups)).resolves.toBe(true);
    expect(mockModel.update).toHaveBeenCalledTimes(1);
  });
});

describe('saveCloudCopyForSong update errors', () => {
  beforeEach(() => {
    localStorage.setItem(IDS_KEY, JSON.stringify({ s1: 'old' }));
    mockModel.create.mockResolvedValue({ data: { id: 'fresh', name: 'Song' } });
  });

  it.each([
    ['no errors reported', undefined],
    ['an empty error list', []],
    ['an Unauthorized errorType', [{ errorType: 'Unauthorized', message: 'x' }]],
    ['a "not found" message', [{ message: 'Item not found' }]],
    ['a "notfound" message', [{ message: 'NotFound' }]],
    ['a conditional-check failure', [{ errorType: 'DynamoDB:ConditionalCheckFailedException', message: 'The conditional request failed' }]],
    ['mixed gone-style errors', [{ errorType: 'Unauthorized' }, { message: 'Not Authorized: unauthorized' }]],
  ])('creates a new copy when the row is gone (%s)', async (_label, errors) => {
    mockModel.update.mockResolvedValue({ data: null, errors });
    expect(await saveCloudCopyForSong('s1', 'Song', pieces, groups)).toBe(true);
    expect(mockModel.create).toHaveBeenCalledTimes(1);
    expect(remembered()).toEqual({ s1: 'fresh' });
  });

  it.each([
    ['a throttle message', [{ errorType: 'Throttling', message: 'Rate exceeded' }]],
    ['a network message', [{ message: 'Network Error' }]],
    ['a gone-style error mixed with another', [{ errorType: 'Unauthorized' }, { message: 'Rate exceeded' }]],
    ['an error with no text', [{}]],
  ])('keeps the remembered copy and returns false for %s', async (_label, errors) => {
    mockModel.update.mockResolvedValue({ data: null, errors });
    expect(await saveCloudCopyForSong('s1', 'Song', pieces, groups)).toBe(false);
    expect(mockModel.create).not.toHaveBeenCalled();
    expect(remembered()).toEqual({ s1: 'old' });
  });
});

describe('loadCloudClickTracks', () => {
  const row = (id: string, name = id) => ({
    id,
    name,
    piecesJson: JSON.stringify(pieces),
    groupsJson: JSON.stringify(groups),
  });

  it('returns [] when signed out without listing', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    expect(await loadCloudClickTracks()).toEqual([]);
    expect(mockModel.list).not.toHaveBeenCalled();
  });

  it('follows nextToken across pages and returns every track', async () => {
    mockModel.list
      .mockResolvedValueOnce({ data: [row('a'), row('b')], nextToken: 'tok1' })
      .mockResolvedValueOnce({ data: [row('c')], nextToken: null });
    const tracks = await loadCloudClickTracks();
    expect(tracks.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(mockModel.list).toHaveBeenCalledTimes(2);
    expect(mockModel.list.mock.calls[0]![0]).toEqual({ nextToken: undefined });
    expect(mockModel.list.mock.calls[1]![0]).toEqual({ nextToken: 'tok1' });
  });

  it('parses pieces and groups into each track', async () => {
    mockModel.list.mockResolvedValue({ data: [row('a', 'Name A')], nextToken: null });
    expect(await loadCloudClickTracks()).toEqual([{ id: 'a', name: 'Name A', pieces, groups }]);
  });

  it('skips and deletes a malformed row, whichever page it is on', async () => {
    mockModel.delete.mockResolvedValue({});
    mockModel.list
      .mockResolvedValueOnce({ data: [row('a'), { ...row('bad1'), piecesJson: '{oops' }], nextToken: 'tok1' })
      .mockResolvedValueOnce({ data: [null, { ...row('bad2'), groupsJson: 'nope' }, row('c')], nextToken: null });
    const tracks = await loadCloudClickTracks();
    expect(tracks.map((t) => t.id)).toEqual(['a', 'c']);
    expect(mockModel.delete).toHaveBeenCalledTimes(2);
    expect(mockModel.delete).toHaveBeenCalledWith({ id: 'bad1' });
    expect(mockModel.delete).toHaveBeenCalledWith({ id: 'bad2' });
  });

  it('tolerates a failing cleanup delete', async () => {
    mockModel.delete.mockRejectedValue(new Error('denied'));
    mockModel.list.mockResolvedValue({ data: [{ ...row('bad'), piecesJson: 'x' }, row('a')], nextToken: null });
    expect((await loadCloudClickTracks()).map((t) => t.id)).toEqual(['a']);
  });

  it('treats a missing data array as no tracks', async () => {
    mockModel.list.mockResolvedValue({ data: null, nextToken: null });
    expect(await loadCloudClickTracks()).toEqual([]);
  });

  it('returns [] when listing throws', async () => {
    mockModel.list.mockRejectedValue(new Error('network'));
    expect(await loadCloudClickTracks()).toEqual([]);
  });
});

describe('saveCloudClickTrack', () => {
  it('returns null when signed out', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    expect(await saveCloudClickTrack('Song', pieces, groups)).toBeNull();
    expect(mockModel.create).not.toHaveBeenCalled();
  });

  it('creates a row and returns it with the original pieces and groups', async () => {
    mockModel.create.mockResolvedValue({ data: { id: 'x', name: 'Song' } });
    expect(await saveCloudClickTrack('Song', pieces, groups)).toEqual({ id: 'x', name: 'Song', pieces, groups });
  });
});
