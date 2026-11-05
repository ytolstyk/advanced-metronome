import { beforeEach, describe, expect, it, vi } from 'vitest';

const { m, mutations } = vi.hoisted(() => {
  const mutations: Record<string, unknown> = { requestBackingTrackUpload: () => undefined };
  const m = {
    BackingTrack: { listBackingTrackBySetList: vi.fn(), listBackingTrackBySong: vi.fn() },
    Song: { listSongBySetList: vi.fn() },
    Vote: { listVoteBySetList: vi.fn() },
    SongColor: { listSongColorBySetList: vi.fn() },
    ColorLabel: { listColorLabelByBand: vi.fn() },
    SongClickTrack: { listSongClickTrackBySetList: vi.fn() },
    graphql: vi.fn(),
  };
  return { m, mutations };
});

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({ models: m, graphql: m.graphql, mutations })),
}));
vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(async () => true),
  getCurrentUserSub: vi.fn(async () => 'sub-me'),
}));

import { BACKING_TRACK_LIMITS } from '../backingTrackFormat';
import { BAND_LIMITS, LIST_PAGE_SIZE, MAX_LIST_PAGES, SONG_COLOR_KEYS } from '../bandTypes';
import { hasBackingTrackModel, hasSongTrackModel, listBackingTracks, songHasBackingTracks, listColorLabels, listSongColors, listSongTrackMeta } from './bandReads';
import { SONG_TRACK_INDEX_FIELDS } from './bandsShared';

const colorRow = (songId: string, color = 'red', owner = 'sub-bob') => ({
  songId,
  owner,
  bandId: 'band-1',
  setListId: 'sl-1',
  color,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  extra: 'dropped',
});

beforeEach(() => {
  vi.clearAllMocks();
  m.SongColor.listSongColorBySetList.mockReset();
  m.ColorLabel.listColorLabelByBand.mockReset();
});

describe('listSongColors', () => {
  it('queries the set-list index with the default (signed-in) auth mode and maps the rows', async () => {
    m.SongColor.listSongColorBySetList.mockResolvedValue({ data: [colorRow('a'), colorRow('b', 'none')], nextToken: null });
    const res = await listSongColors('sl-1');
    expect(m.SongColor.listSongColorBySetList).toHaveBeenCalledWith(
      { setListId: 'sl-1' },
      { limit: LIST_PAGE_SIZE, nextToken: undefined },
    );
    expect(res.incomplete).toBe(false);
    expect(res.items).toEqual([
      { songId: 'a', owner: 'sub-bob', bandId: 'band-1', setListId: 'sl-1', color: 'red', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
      { songId: 'b', owner: 'sub-bob', bandId: 'band-1', setListId: 'sl-1', color: 'none', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
    ]);
  });

  it('keeps one row per (song, owner): rows from different members for the same song are all returned', async () => {
    m.SongColor.listSongColorBySetList.mockResolvedValue({
      data: [colorRow('a', 'red', 'sub-bob'), colorRow('a', 'blue', 'sub-cat')],
      nextToken: null,
    });
    const res = await listSongColors('sl-1');
    expect(res.items.map((r) => [r.songId, r.owner, r.color])).toEqual([
      ['a', 'sub-bob', 'red'],
      ['a', 'sub-cat', 'blue'],
    ]);
  });

  it('never sends an authMode (there is no guest read rule for colors)', async () => {
    m.SongColor.listSongColorBySetList.mockResolvedValue({ data: [], nextToken: null });
    await listSongColors('sl-1');
    expect(m.SongColor.listSongColorBySetList.mock.calls[0][1]).not.toHaveProperty('authMode');
  });

  it('follows nextToken across pages and concatenates the rows', async () => {
    m.SongColor.listSongColorBySetList
      .mockResolvedValueOnce({ data: [colorRow('a')], nextToken: 't1' })
      .mockResolvedValueOnce({ data: [colorRow('b')], nextToken: null });
    const res = await listSongColors('sl-1');
    expect(res.items.map((r) => r.songId)).toEqual(['a', 'b']);
    expect(res.incomplete).toBe(false);
    expect(m.SongColor.listSongColorBySetList.mock.calls[1][1]).toMatchObject({ nextToken: 't1' });
  });

  it('stops at a tight page cap (a valid list has at most 15 members x 100 songs = 6 pages) and flags incomplete', async () => {
    m.SongColor.listSongColorBySetList.mockResolvedValue({ data: [], nextToken: 'more' });
    const res = await listSongColors('sl-1');
    expect(res.incomplete).toBe(true);
    expect(m.SongColor.listSongColorBySetList).toHaveBeenCalledTimes(7);
    expect(7).toBeLessThan(MAX_LIST_PAGES);
  });

  it('fails closed when the read errors', async () => {
    m.SongColor.listSongColorBySetList.mockResolvedValue({ data: null, errors: [{ message: 'gsi down' }] });
    await expect(listSongColors('sl-1')).rejects.toThrow('listSongColors: gsi down');
  });
});

const labelRow = (color: string, owner = 'sub-bob', label = 'Ballad') => ({
  bandId: 'band-1',
  color,
  owner,
  label,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  extra: 'dropped',
});

describe('listColorLabels', () => {
  it('queries the band index with the default (signed-in) auth mode and maps the rows', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({ data: [labelRow('red'), labelRow('blue', 'sub-bob', '')], nextToken: null });
    const res = await listColorLabels('band-1');
    expect(m.ColorLabel.listColorLabelByBand).toHaveBeenCalledWith(
      { bandId: 'band-1' },
      { limit: LIST_PAGE_SIZE, nextToken: undefined },
    );
    expect(res.incomplete).toBe(false);
    expect(res.items).toEqual([
      { bandId: 'band-1', color: 'red', owner: 'sub-bob', label: 'Ballad', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
      { bandId: 'band-1', color: 'blue', owner: 'sub-bob', label: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
    ]);
  });

  it('keeps rows from different members for the same color', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({
      data: [labelRow('red', 'sub-bob', 'A'), labelRow('red', 'sub-cat', 'B')],
      nextToken: null,
    });
    const res = await listColorLabels('band-1');
    expect(res.items.map((r) => [r.color, r.owner, r.label])).toEqual([
      ['red', 'sub-bob', 'A'],
      ['red', 'sub-cat', 'B'],
    ]);
  });

  it('never sends an authMode (there is no guest read rule for labels)', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({ data: [], nextToken: null });
    await listColorLabels('band-1');
    expect(m.ColorLabel.listColorLabelByBand.mock.calls[0][1]).not.toHaveProperty('authMode');
  });

  it('follows nextToken across pages and concatenates the rows', async () => {
    m.ColorLabel.listColorLabelByBand
      .mockResolvedValueOnce({ data: [labelRow('red')], nextToken: 't1' })
      .mockResolvedValueOnce({ data: [labelRow('blue')], nextToken: null });
    const res = await listColorLabels('band-1');
    expect(res.items.map((r) => r.color)).toEqual(['red', 'blue']);
    expect(res.incomplete).toBe(false);
    expect(m.ColorLabel.listColorLabelByBand.mock.calls[1][1]).toMatchObject({ nextToken: 't1' });
  });

  it('stops at a tight page cap (members x palette colors, plus one page of slack) and flags incomplete', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({ data: [], nextToken: 'more' });
    const res = await listColorLabels('band-1');
    const expectedPages = Math.ceil((BAND_LIMITS.maxMembers * SONG_COLOR_KEYS.length) / LIST_PAGE_SIZE) + 1;
    expect(res.incomplete).toBe(true);
    expect(m.ColorLabel.listColorLabelByBand).toHaveBeenCalledTimes(expectedPages);
    expect(expectedPages).toBeLessThan(MAX_LIST_PAGES);
  });

  it('fails closed when the read errors', async () => {
    m.ColorLabel.listColorLabelByBand.mockResolvedValue({ data: null, errors: [{ message: 'gsi down' }] });
    await expect(listColorLabels('band-1')).rejects.toThrow('listColorLabels: gsi down');
  });
});

const trackRow = (songId: string, owner = 'sub-bob') => ({
  songId,
  owner,
  setListId: 'sl-1',
  format: 1,
  bytes: 120,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  track: 'dropped',
  bandId: 'dropped',
});

describe('listSongTrackMeta', () => {
  beforeEach(() => {
    m.SongClickTrack.listSongClickTrackBySetList.mockReset();
  });

  it('queries the set-list index with an explicit index-only selection set and maps the rows', async () => {
    m.SongClickTrack.listSongClickTrackBySetList.mockResolvedValue({ data: [trackRow('a')], nextToken: null });
    const res = await listSongTrackMeta('sl-1');
    expect(m.SongClickTrack.listSongClickTrackBySetList).toHaveBeenCalledWith(
      { setListId: 'sl-1' },
      { limit: LIST_PAGE_SIZE, nextToken: undefined, selectionSet: [...SONG_TRACK_INDEX_FIELDS] },
    );
    expect(SONG_TRACK_INDEX_FIELDS).not.toContain('track');
    expect(SONG_TRACK_INDEX_FIELDS).not.toContain('bandId');
    expect(res.incomplete).toBe(false);
    expect(res.items).toEqual([
      { songId: 'a', owner: 'sub-bob', setListId: 'sl-1', format: 1, bytes: 120, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
    ]);
  });

  it('never sends an authMode (no guest read rule for click tracks)', async () => {
    m.SongClickTrack.listSongClickTrackBySetList.mockResolvedValue({ data: [], nextToken: null });
    await listSongTrackMeta('sl-1');
    expect(m.SongClickTrack.listSongClickTrackBySetList.mock.calls[0][1]).not.toHaveProperty('authMode');
  });

  it('follows nextToken across pages', async () => {
    m.SongClickTrack.listSongClickTrackBySetList
      .mockResolvedValueOnce({ data: [trackRow('a')], nextToken: 't1' })
      .mockResolvedValueOnce({ data: [trackRow('b')], nextToken: null });
    const res = await listSongTrackMeta('sl-1');
    expect(res.items.map((r) => r.songId)).toEqual(['a', 'b']);
    expect(res.incomplete).toBe(false);
    expect(m.SongClickTrack.listSongClickTrackBySetList.mock.calls[1][1]).toMatchObject({ nextToken: 't1' });
  });

  it('stops at a tight page cap (members x songs, plus one page of slack) and flags incomplete', async () => {
    m.SongClickTrack.listSongClickTrackBySetList.mockResolvedValue({ data: [], nextToken: 'more' });
    const res = await listSongTrackMeta('sl-1');
    const expectedPages = Math.ceil((BAND_LIMITS.maxMembers * BAND_LIMITS.maxSongsPerSetList) / LIST_PAGE_SIZE) + 1;
    expect(res.incomplete).toBe(true);
    expect(m.SongClickTrack.listSongClickTrackBySetList).toHaveBeenCalledTimes(expectedPages);
    expect(expectedPages).toBeLessThan(MAX_LIST_PAGES);
  });

  it('fails closed when the read errors', async () => {
    m.SongClickTrack.listSongClickTrackBySetList.mockResolvedValue({ data: null, errors: [{ message: 'gsi down' }] });
    await expect(listSongTrackMeta('sl-1')).rejects.toThrow('listSongTrackMeta: gsi down');
  });

  it('returns an empty, complete result without any query when the backend predates the model', async () => {
    const saved = m.SongClickTrack;
    delete (m as Record<string, unknown>).SongClickTrack;
    try {
      expect(hasSongTrackModel()).toBe(false);
      await expect(listSongTrackMeta('sl-1')).resolves.toEqual({ items: [], incomplete: false });
    } finally {
      m.SongClickTrack = saved;
    }
    expect(hasSongTrackModel()).toBe(true);
    expect(saved.listSongClickTrackBySetList).not.toHaveBeenCalled();
  });
});

const backingRow = (id: string) => ({
  id,
  owner: 'sub-bob',
  bandId: 'band-1',
  setListId: 'sl-1',
  songId: 'song-1',
  label: 'No drums',
  forTags: ['drums'],
  key: `bt/${id}`,
  contentType: 'audio/mpeg',
  bytes: 100,
  format: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  extra: 'dropped',
});

describe('hasBackingTrackModel', () => {
  it('is true with the model and the upload mutation', () => {
    expect(hasBackingTrackModel()).toBe(true);
  });

  it('is false when the model is missing', () => {
    const saved = m.BackingTrack;
    delete (m as Record<string, unknown>).BackingTrack;
    try {
      expect(hasBackingTrackModel()).toBe(false);
    } finally {
      m.BackingTrack = saved;
    }
  });

  it('is false when the upload mutation is missing (an older backend)', () => {
    const saved = mutations.requestBackingTrackUpload;
    delete mutations.requestBackingTrackUpload;
    try {
      expect(hasBackingTrackModel()).toBe(false);
    } finally {
      mutations.requestBackingTrackUpload = saved;
    }
  });
});

describe('listBackingTracks', () => {
  beforeEach(() => {
    m.BackingTrack.listBackingTrackBySetList.mockReset();
  });

  it('queries the set-list index with the default (signed-in) auth mode and maps the rows', async () => {
    m.BackingTrack.listBackingTrackBySetList.mockResolvedValue({ data: [backingRow('a')], nextToken: null });
    const res = await listBackingTracks('sl-1');
    expect(m.BackingTrack.listBackingTrackBySetList).toHaveBeenCalledWith(
      { setListId: 'sl-1' },
      { limit: LIST_PAGE_SIZE, nextToken: undefined },
    );
    expect(m.BackingTrack.listBackingTrackBySetList.mock.calls[0][1]).not.toHaveProperty('authMode');
    expect(res.incomplete).toBe(false);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ id: 'a', owner: 'sub-bob', songId: 'song-1', key: 'bt/a', bytes: 100 });
    expect(res.items[0]).not.toHaveProperty('extra');
  });

  it('follows nextToken across pages', async () => {
    m.BackingTrack.listBackingTrackBySetList
      .mockResolvedValueOnce({ data: [backingRow('a')], nextToken: 't1' })
      .mockResolvedValueOnce({ data: [backingRow('b')], nextToken: null });
    const res = await listBackingTracks('sl-1');
    expect(res.items.map((r) => r.id)).toEqual(['a', 'b']);
    expect(res.incomplete).toBe(false);
    expect(m.BackingTrack.listBackingTrackBySetList.mock.calls[1][1]).toMatchObject({ nextToken: 't1' });
  });

  it('stops at a tight page cap (the band-wide track limit, plus one page) and flags incomplete', async () => {
    m.BackingTrack.listBackingTrackBySetList.mockResolvedValue({ data: [], nextToken: 'more' });
    const res = await listBackingTracks('sl-1');
    const expectedPages = Math.ceil(BACKING_TRACK_LIMITS.maxPerBand / LIST_PAGE_SIZE) + 1;
    expect(res.incomplete).toBe(true);
    expect(m.BackingTrack.listBackingTrackBySetList).toHaveBeenCalledTimes(expectedPages);
    expect(expectedPages).toBeLessThan(MAX_LIST_PAGES);
  });

  it('fails closed when the read errors', async () => {
    m.BackingTrack.listBackingTrackBySetList.mockResolvedValue({ data: null, errors: [{ message: 'gsi down' }] });
    await expect(listBackingTracks('sl-1')).rejects.toThrow('listBackingTracks: gsi down');
  });

  it('returns an empty, complete result without any query when the backend predates the model', async () => {
    const saved = mutations.requestBackingTrackUpload;
    delete mutations.requestBackingTrackUpload;
    try {
      await expect(listBackingTracks('sl-1')).resolves.toEqual({ items: [], incomplete: false });
    } finally {
      mutations.requestBackingTrackUpload = saved;
    }
    expect(m.BackingTrack.listBackingTrackBySetList).not.toHaveBeenCalled();
  });
});

describe('songHasBackingTracks', () => {
  const list = m.BackingTrack.listBackingTrackBySong;
  beforeEach(() => {
    list.mockReset();
  });

  it('is true when the index returns a row, asking for just one', async () => {
    list.mockResolvedValue({ data: [backingRow('a')] });
    await expect(songHasBackingTracks('song-1')).resolves.toBe(true);
    expect(list).toHaveBeenCalledWith({ songId: 'song-1' }, { limit: 1 });
  });

  it('is false when the index returns nothing', async () => {
    list.mockResolvedValue({ data: [] });
    await expect(songHasBackingTracks('song-1')).resolves.toBe(false);
  });

  it('is null (unknown) when the read comes back with errors, even with empty data', async () => {
    list.mockResolvedValue({ data: [], errors: [{ message: 'denied' }] });
    await expect(songHasBackingTracks('song-1')).resolves.toBeNull();
  });

  it('is null (unknown) when the read throws', async () => {
    list.mockRejectedValue(new Error('network'));
    await expect(songHasBackingTracks('song-1')).resolves.toBeNull();
  });

  it('never sends an authMode (no guest read rule)', async () => {
    list.mockResolvedValue({ data: [] });
    await songHasBackingTracks('song-1');
    expect(list.mock.calls[0][1]).not.toHaveProperty('authMode');
  });
});
