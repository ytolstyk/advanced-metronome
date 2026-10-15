import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { BandRecord, SetListRecord, SharedSetListResult, SongRecord, VoteRecord } from '../bandTypes';
import { assembleBandView, assembleSetListView } from '../bandViews';

vi.mock('../api/sharedSetListApi', () => ({ loadSharedSetList: vi.fn() }));

import { SharedSetListPage } from './SharedSetListPage';
import { loadSharedSetList } from '../api/sharedSetListApi';

const OWNER = 'sub-owner';
const BOB = 'sub-bob';

const band = (over: Partial<BandRecord> = {}): BandRecord => ({
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
const setListRow: SetListRecord = { id: 'sl-1', owner: OWNER, bandId: 'band-1', name: 'Main Set', archivedAt: null };
const song = (id: string, owner: string, over: Partial<SongRecord> = {}): SongRecord => ({
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
const vote = (songId: string, owner: string, value: string): VoteRecord => ({
  songId,
  owner,
  value,
  bandId: 'band-1',
  setListId: 'sl-1',
  createdAt: '2026-01-03T00:00:00Z',
});

/** What `loadSharedSetList` would return, built with the real validators. */
function okResult({
  sub = '',
  songs = [song('a', BOB), song('b', OWNER)],
  votes = [vote('b', BOB, 'up'), vote('b', OWNER, 'up'), vote('a', OWNER, 'down')],
  songsIncomplete = false,
  rosterIncomplete = false,
  member = false,
}: {
  sub?: string;
  songs?: SongRecord[];
  votes?: VoteRecord[];
  songsIncomplete?: boolean;
  rosterIncomplete?: boolean;
  member?: boolean;
} = {}): SharedSetListResult {
  const view = assembleBandView({
    band: band(),
    sub,
    rosterRows: [
      { bandId: 'band-1', owner: OWNER, displayName: 'Olivia', createdAt: '2026-01-01T00:00:00Z' },
      { bandId: 'band-1', owner: BOB, displayName: 'Bobby', createdAt: '2026-01-01T00:00:01Z' },
    ],
    rosterIncomplete,
    ownRow: member && sub ? { bandId: 'band-1', owner: sub, displayName: 'Me', createdAt: '2026-01-01T00:00:02Z' } : null,
    setListRows: [setListRow],
  });
  const list = assembleSetListView(view, 'sl-1', {
    songs: { items: songs, incomplete: songsIncomplete },
    votes: { items: votes, incomplete: false },
  });
  if (!list) throw new Error('test setup produced no list');
  return { status: 'ok', view, list };
}

function renderPage(path = '/shared/sl-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/shared/:setListId" element={<SharedSetListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const robotsMeta = () => document.head.querySelector('meta[name="robots"]');

beforeEach(() => {
  vi.mocked(loadSharedSetList).mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SharedSetListPage', () => {
  it('shows a loading message first, then the list', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult());
    renderPage();
    expect(screen.getByText('Loading set list…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Main Set' })).toBeInTheDocument();
    expect(screen.queryByText('Loading set list…')).not.toBeInTheDocument();
  });

  it('loads the set list named in the URL (decoded)', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue({ status: 'unavailable' });
    renderPage('/shared/a%2Fb%20c');
    await screen.findByText('This set list isn’t available');
    expect(loadSharedSetList).toHaveBeenCalledWith('a/b c');
  });

  it('shows one generic notice when the list is unavailable (no hint why)', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue({ status: 'unavailable' });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'This set list isn’t available' })).toBeInTheDocument();
    expect(screen.getByText('The link may be wrong, or the band has stopped sharing it.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows band name, list name, song count and the songs ranked by score', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Main Set' })).toBeInTheDocument();
    expect(screen.getByText(/The Band · Shared set list, ranked by the band’s votes · 2\/100 songs/)).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Song b');
    expect(items[1]).toHaveTextContent('Song a');
    expect(within(items[0]).getByLabelText('Rank 1')).toBeInTheDocument();
    expect(within(items[1]).getByLabelText('Rank 2')).toBeInTheDocument();
  });

  it('shows read-only scores (up, down, score) per song', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult());
    renderPage();
    const [first, second] = await screen.findAllByRole('listitem');
    expect(within(first).getByText('Score 2, 2 up, 0 down')).toBeInTheDocument();
    expect(within(second).getByText('Score -1, 0 up, 1 down')).toBeInTheDocument();
  });

  it('has NO vote, suggest, edit, delete or hide controls, no member names and no sign-in gate', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult());
    renderPage();
    await screen.findByRole('heading', { name: 'Main Set' });
    expect(screen.queryByRole('button', { name: /vote|suggest|edit|delete|hide|restore/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Suggested by/)).not.toBeInTheDocument();
    expect(screen.queryByText('Bobby')).not.toBeInTheDocument();
    expect(screen.queryByText('Olivia')).not.toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument(); // the only button
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('a guest (or non-member) gets no "Open in your band" link', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult({ sub: '' }));
    const { unmount } = renderPage();
    await screen.findByRole('heading', { name: 'Main Set' });
    expect(screen.queryByRole('link', { name: 'Open in your band' })).not.toBeInTheDocument();
    unmount();
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult({ sub: 'sub-stranger' }));
    renderPage();
    await screen.findByRole('heading', { name: 'Main Set' });
    expect(screen.queryByRole('link', { name: 'Open in your band' })).not.toBeInTheDocument();
  });

  it('a member gets "Open in your band", linking to the members\' set list page', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult({ sub: 'sub-me', member: true }));
    renderPage();
    const link = await screen.findByRole('link', { name: 'Open in your band' });
    expect(link).toHaveAttribute('href', '/bands/band-1/setlists/sl-1');
  });

  it('the owner gets "Open in your band" too', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult({ sub: OWNER }));
    renderPage();
    expect(await screen.findByRole('link', { name: 'Open in your band' })).toBeInTheDocument();
  });

  it('shows the "too long" warning when songs or votes hit the cap', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult({ songsIncomplete: true }));
    renderPage();
    expect(await screen.findByRole('status')).toHaveTextContent('too long to load completely');
  });

  it('shows the same warning when only the roster hit the cap', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult({ rosterIncomplete: true }));
    renderPage();
    expect(await screen.findByRole('status')).toHaveTextContent('too long to load completely');
  });

  it('shows no warning for a complete list', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult());
    renderPage();
    await screen.findByRole('heading', { name: 'Main Set' });
    expect(screen.queryByText(/too long to load completely/)).not.toBeInTheDocument();
  });

  it('shows an empty state for a list without songs', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult({ songs: [], votes: [] }));
    renderPage();
    expect(await screen.findByText('No songs yet.')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('never renders forged songs (a non-member\'s rows are filtered by the validators)', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult({ songs: [song('a', BOB), song('evil', 'sub-mallory')] }));
    renderPage();
    await screen.findByText('Song a');
    expect(screen.queryByText('Song evil')).not.toBeInTheDocument();
  });

  it('fails closed with a retry button when loading fails, then recovers', async () => {
    vi.mocked(loadSharedSetList).mockRejectedValueOnce(new Error('network')).mockResolvedValue(okResult());
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load this set list: network');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Main Set' })).toBeInTheDocument();
  });

  it('Refresh reloads, and a failed refresh keeps the list on screen with a notice', async () => {
    vi.mocked(loadSharedSetList).mockResolvedValueOnce(okResult()).mockRejectedValue(new Error('flaky'));
    renderPage();
    await screen.findByRole('heading', { name: 'Main Set' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/Couldn’t refresh, so this may be out of date: flaky/)).toBeInTheDocument();
    expect(loadSharedSetList).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Song a')).toBeInTheDocument();
  });

  it('refetches on tab focus only every 5 minutes, not every 30 seconds', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    vi.mocked(loadSharedSetList).mockResolvedValue(okResult());
    renderPage();
    await screen.findByRole('heading', { name: 'Main Set' });
    expect(loadSharedSetList).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 60_000);
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(loadSharedSetList).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 5 * 60_000 - 1);
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(loadSharedSetList).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 5 * 60_000 + 1);
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(loadSharedSetList).toHaveBeenCalledTimes(2));
  });

  describe('robots noindex', () => {
    it('adds <meta name="robots" content="noindex"> while mounted and removes it on unmount', async () => {
      vi.mocked(loadSharedSetList).mockResolvedValue(okResult());
      expect(robotsMeta()).toBeNull();
      const { unmount } = renderPage();
      const meta = robotsMeta();
      expect(meta).not.toBeNull();
      expect(meta).toHaveAttribute('content', 'noindex');
      await screen.findByRole('heading', { name: 'Main Set' });
      expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
      unmount();
      expect(robotsMeta()).toBeNull();
    });

    it('adds the tag even while loading and for unavailable lists', async () => {
      vi.mocked(loadSharedSetList).mockResolvedValue({ status: 'unavailable' });
      const { unmount } = renderPage();
      expect(robotsMeta()).not.toBeNull();
      await screen.findByText('This set list isn’t available');
      expect(robotsMeta()).not.toBeNull();
      unmount();
      expect(robotsMeta()).toBeNull();
    });

    it('does not leave a tag behind after repeated mounts', () => {
      vi.mocked(loadSharedSetList).mockResolvedValue({ status: 'unavailable' });
      renderPage().unmount();
      renderPage().unmount();
      expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(0);
    });
  });
});
