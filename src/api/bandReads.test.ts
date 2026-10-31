import { beforeEach, describe, expect, it, vi } from 'vitest';

const { m } = vi.hoisted(() => {
  const m = {
    Song: { listSongBySetList: vi.fn() },
    Vote: { listVoteBySetList: vi.fn() },
    SongColor: { listSongColorBySetList: vi.fn() },
    ColorLabel: { listColorLabelByBand: vi.fn() },
    SongClickTrack: { listSongClickTrackBySetList: vi.fn() },
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

import { BAND_LIMITS, LIST_PAGE_SIZE, MAX_LIST_PAGES, SONG_COLOR_KEYS } from '../bandTypes';
import { hasSongTrackModel, listColorLabels, listSongColors, listSongTrackMeta } from './bandReads';
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
