import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup as cleanupAll, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BAND_LIMITS } from '../bandTypes';
import type { BackingTrackRecord, BandRecord, BandView, ValidSong, ColorLabelRecord, SongColorRecord, SongRecord, SongTrackMetaRecord, VoteRecord, ValidMember, ValidSetList } from '../bandTypes';
import type { TrackPiece } from '../audio/ClickTrackEngine';
import type { SegmentGroup } from '../clickTrackTypes';
import { SONG_COLOR_STYLES } from '../bandSongColors';
import userEvent from '@testing-library/user-event';
import { committedKey } from '../backingTrackFormat';

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: 'authenticated' }),
  Authenticator: () => null,
}));
vi.mock('aws-amplify/data', () => ({ generateClient: vi.fn(() => ({ models: {}, graphql: vi.fn() })) }));
vi.mock('../api/bandsApi', () => ({
  loadBandView: vi.fn(),
  loadMemberBandView: vi.fn(),
  hideSong: vi.fn(),
  unhideSong: vi.fn(),
}));
vi.mock('../api/songVotesApi', () => ({ castVote: vi.fn() }));
vi.mock('../api/songColorsApi', () => ({ setSongColor: vi.fn() }));
vi.mock('../api/songTracksApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/songTracksApi')>()),
  getSongTrack: vi.fn(),
  clearSongTrack: vi.fn(),
}));
const { engine } = vi.hoisted(() => ({ engine: { prime: vi.fn(), start: vi.fn(), stop: vi.fn(), destroy: vi.fn() } }));
vi.mock('../audio/ClickTrackEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../audio/ClickTrackEngine')>()),
  ClickTrackEngine: vi.fn(function () {
    return engine;
  }),
}));
vi.mock('../audio/exportClickTrack', () => ({ exportClickTrack: vi.fn() }));
vi.mock('../api/backingTracksApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/backingTracksApi')>()),
  isBackingTracksReady: vi.fn(() => false),
  areBackingTrackUploadsOn: vi.fn(() => false),
  addBackingTrack: vi.fn(),
  editBackingTrack: vi.fn(),
  removeBackingTracks: vi.fn(),
  getBackingTrackUrl: vi.fn(),
}));
vi.mock('../api/colorLabelsApi', () => ({ fetchColorLabelRows: vi.fn(), setColorLabel: vi.fn() }));
vi.mock('../api/setListsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/setListsApi')>()),
  fetchSetListRows: vi.fn(),
  suggestSong: vi.fn(),
  updateSong: vi.fn(),
  deleteSong: vi.fn(),
  reorderSongs: vi.fn(),
  fetchSongChoices: vi.fn(),
  addSongsFromOtherLists: vi.fn(),
}));

import { SetListPage } from './SetListPage';
import { hideSong, loadBandView, loadMemberBandView, unhideSong } from '../api/bandsApi';
import { addSongsFromOtherLists, deleteSong, fetchSetListRows, fetchSongChoices, reorderSongs, suggestSong } from '../api/setListsApi';
import { castVote } from '../api/songVotesApi';
import { setSongColor } from '../api/songColorsApi';
import { clearSongTrack, getSongTrack, type SongTrackRead } from '../api/songTracksApi';
import { exportClickTrack } from '../audio/exportClickTrack';
import { fetchColorLabelRows, setColorLabel } from '../api/colorLabelsApi';
import {
  addBackingTrack,
  areBackingTrackUploadsOn,
  editBackingTrack,
  getBackingTrackUrl,
  isBackingTracksReady,
  removeBackingTracks,
} from '../api/backingTracksApi';

const ME = 'sub-me';
const BOB = 'sub-bob';
const OWNER = 'sub-owner';

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
  sharedSetListIds: [],
  uploaderSubs: [],
  inviteTtlDays: 1,
  ...over,
});

function makeView(over: Partial<BandView> = {}, b: BandRecord = band()): BandView {
  const members = [
    { bandId: 'band-1', owner: ME, displayName: 'Me', createdAt: '2026-01-01T00:00:00Z' },
    { bandId: 'band-1', owner: BOB, displayName: 'Bob', createdAt: '2026-01-01T00:00:01Z' },
  ] as unknown as ValidMember[];
  return {
    band: b,
    sub: ME,
    isOwner: false,
    isMember: true,
    canUpload: true,
    members,
    memberSubs: new Set([OWNER, ME, BOB]),
    displayNames: new Map([[ME, 'Me'], [BOB, 'Bob'], [OWNER, 'Olivia']]),
    setLists: [{ id: 'sl-1', owner: OWNER, bandId: 'band-1', name: 'Main Set', archivedAt: null }] as unknown as ValidSetList[],
    removedMembers: [],
    incomplete: false,
    ...over,
  };
}

const song = (id: string, owner: string, createdAt: string): SongRecord => ({
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
  createdAt,
});
const vote = (songId: string, owner: string, value: string): VoteRecord => ({
  songId,
  owner,
  value,
  bandId: 'band-1',
  setListId: 'sl-1',
  createdAt: '2026-01-03T00:00:00Z',
  updatedAt: '2026-01-03T00:00:00Z',
});

const emptyPage = <T,>(items: T[]) => ({ items, incomplete: false });

const colorRow = (songId: string, color: string, owner = BOB, updatedAt = '2026-01-04T00:00:00Z'): SongColorRecord => ({
  songId,
  owner,
  bandId: 'band-1',
  setListId: 'sl-1',
  color,
  createdAt: '2026-01-04T00:00:00Z',
  updatedAt,
});

const labelRow = (color: string, label: string, owner = BOB, updatedAt = '2026-01-04T00:00:00Z'): ColorLabelRecord => ({
  bandId: 'band-1',
  color,
  owner,
  label,
  createdAt: '2026-01-04T00:00:00Z',
  updatedAt,
});

function setup(
  view: BandView = makeView(),
  songs = [song('a', BOB, '2026-01-02T00:00:00Z'), song('b', ME, '2026-01-02T00:00:01Z')],
  votes = [vote('b', BOB, 'up')],
  colors: SongColorRecord[] = [],
  labels: ColorLabelRecord[] = [],
  clicks: SongTrackMetaRecord[] = [],
  backing?: { items: BackingTrackRecord[]; incomplete?: boolean },
) {
  vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view });
  vi.mocked(fetchColorLabelRows).mockResolvedValue(emptyPage(labels));
  vi.mocked(fetchSetListRows).mockResolvedValue({
    songs: emptyPage(songs),
    votes: emptyPage(votes),
    colors: emptyPage(colors),
    clicks: emptyPage(clicks),
    ...(backing ? { backingTracks: { items: backing.items, incomplete: backing.incomplete ?? false } } : {}),
  });
  return render(
    <MemoryRouter initialEntries={['/bands/band-1/setlists/sl-1']}>
      <Routes>
        <Route path="/bands/:bandId/setlists/:setListId" element={<SetListPage />} />
        <Route path="/click-track" element={<div>Click track editor</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const row = (title: string) => screen.getByText(title).closest('li') as HTMLElement;
const score = (title: string) => within(row(title)).getByLabelText(/^Score/);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchColorLabelRows).mockResolvedValue(emptyPage([]));
  vi.mocked(isBackingTracksReady).mockReturnValue(false);
});

describe('SetListPage', () => {
  it('asks for just this set list, not all of the band\'s set lists', async () => {
    setup();
    await screen.findByText('Song a');
    expect(loadBandView).toHaveBeenCalledWith('band-1', { onlySetListId: 'sl-1' });
  });

  it('shows validated songs ranked by score, with who suggested them', async () => {
    setup();
    expect(await screen.findByText('Song b')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('Song '));
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Song b'),
      expect.stringContaining('Song a'),
    ]);
    expect(row('Song b')).toHaveTextContent('Suggested by Me');
    expect(row('Song a')).toHaveTextContent('Suggested by Bob');
    expect(score('Song b')).toHaveTextContent('1');
    expect(screen.getByText(/Suggestions ranked by votes/)).toBeInTheDocument();
  });

  it('hides forged rows: songs by non-members never render', async () => {
    setup(makeView(), [song('a', BOB, '2026-01-02T00:00:00Z'), song('evil', 'sub-mallory', '2026-01-02T00:00:00Z')], []);
    expect(await screen.findByText('Song a')).toBeInTheDocument();
    expect(screen.queryByText('Song evil')).not.toBeInTheDocument();
  });

  it('voting updates the score immediately and calls the API with the previous vote', async () => {
    vi.mocked(castVote).mockResolvedValue(undefined);
    setup();
    await screen.findByText('Song a');
    fireEvent.click(within(row('Song a')).getByRole('button', { name: 'Upvote Song a' }));

    expect(score('Song a')).toHaveTextContent('1'); // optimistic
    expect(within(row('Song a')).getByRole('button', { name: 'Upvote Song a' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(castVote).toHaveBeenCalledTimes(1));
    expect(castVote).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', bandId: 'band-1', setListId: 'sl-1' }), 'up', undefined);
  });

  it('clicking the active arrow retracts; clicking the other arrow switches', async () => {
    vi.mocked(castVote).mockResolvedValue(undefined);
    setup();
    await screen.findByText('Song a');
    const up = () => within(row('Song a')).getByRole('button', { name: 'Upvote Song a' });
    const down = () => within(row('Song a')).getByRole('button', { name: 'Downvote Song a' });

    fireEvent.click(up());
    await waitFor(() => expect(castVote).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(up()).toBeEnabled());

    fireEvent.click(down()); // switch up → down
    expect(score('Song a')).toHaveTextContent('-1');
    await waitFor(() => expect(castVote).toHaveBeenCalledTimes(2));
    expect(vi.mocked(castVote).mock.calls[1].slice(1)).toEqual(['down', 'up']);
    await waitFor(() => expect(down()).toBeEnabled());

    fireEvent.click(down()); // retract
    expect(score('Song a')).toHaveTextContent('0');
    expect(down()).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(castVote).toHaveBeenCalledTimes(3));
    expect(vi.mocked(castVote).mock.calls[2].slice(1)).toEqual([null, 'down']);
  });

  it('a failed vote reverts the optimistic change and says so', async () => {
    vi.mocked(castVote).mockRejectedValue(new Error('Could not save your vote'));
    setup();
    await screen.findByText('Song a');
    fireEvent.click(within(row('Song a')).getByRole('button', { name: 'Upvote Song a' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your vote');
    expect(score('Song a')).toHaveTextContent('0');
    expect(within(row('Song a')).getByRole('button', { name: 'Upvote Song a' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables a song\'s vote buttons while its vote is in flight', async () => {
    let finish!: () => void;
    vi.mocked(castVote).mockImplementation(() => new Promise<void>((r) => { finish = r; }));
    setup();
    await screen.findByText('Song a');
    fireEvent.click(within(row('Song a')).getByRole('button', { name: 'Upvote Song a' }));
    await waitFor(() => expect(within(row('Song a')).getByRole('button', { name: 'Upvote Song a' })).toBeDisabled());
    expect(within(row('Song b')).getByRole('button', { name: 'Upvote Song b' })).toBeEnabled(); // other songs unaffected
    finish();
    await waitFor(() => expect(within(row('Song a')).getByRole('button', { name: 'Upvote Song a' })).toBeEnabled());
  });

  it('members can suggest a song, then the list reloads', async () => {
    vi.mocked(suggestSong).mockResolvedValue(song('new', ME, '2026-01-05T00:00:00Z'));
    setup();
    await screen.findByText('Song a');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a song' }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Wonderwall' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await waitFor(() => expect(suggestSong).toHaveBeenCalled());
    const [view, setListId, raw, count] = vi.mocked(suggestSong).mock.calls[0];
    expect(view.band.id).toBe('band-1');
    expect(setListId).toBe('sl-1');
    expect(raw).toMatchObject({ title: 'Wonderwall' });
    expect(count).toBe(2);
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2)); // reload after success
  });

  it('only the author sees Edit/Delete; only the owner sees Hide', async () => {
    setup();
    await screen.findByText('Song a');
    expect(within(row('Song b')).getByRole('button', { name: 'Edit Song b' })).toBeInTheDocument();
    expect(within(row('Song b')).getByRole('button', { name: 'Delete Song b' })).toBeInTheDocument();
    expect(within(row('Song a')).queryByRole('button', { name: 'Edit Song a' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Hide / })).not.toBeInTheDocument();
  });

  it('deleting your own song asks first, then deletes and reloads', async () => {
    vi.mocked(deleteSong).mockResolvedValue(undefined);
    setup();
    await screen.findByText('Song b');
    fireEvent.click(within(row('Song b')).getByRole('button', { name: 'Delete Song b' }));
    expect(deleteSong).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteSong).toHaveBeenCalledWith('b'));
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
  });

  it('the owner can hide a song and restore it from the Hidden section', async () => {
    vi.mocked(hideSong).mockResolvedValue(band());
    vi.mocked(unhideSong).mockResolvedValue(band());
    const ownerView = makeView({ isOwner: true, sub: OWNER }, band({ hiddenSongIds: ['a'] }));
    setup(ownerView);
    await screen.findByText('Song b');
    expect(screen.getByRole('heading', { name: 'Hidden songs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upvote Song a' })).not.toBeInTheDocument(); // hidden from the ranked list
    fireEvent.click(screen.getByRole('button', { name: 'Restore Song a' }));
    await waitFor(() => expect(unhideSong).toHaveBeenCalledWith('band-1', 'a'));

    fireEvent.click(within(row('Song b')).getByRole('button', { name: 'Hide Song b' }));
    await waitFor(() => expect(hideSong).toHaveBeenCalledWith('band-1', 'b'));
  });

  it('shows NO copy-link button while the set list is not shared', async () => {
    setup();
    await screen.findByText('Song a');
    expect(screen.queryByRole('button', { name: /Copy share link/ })).not.toBeInTheDocument();
  });

  it('shows the copy-link button when the owner shared the list, copying the public /shared/<id> URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup(makeView({}, band({ sharedSetListIds: ['sl-1'] })));
    await screen.findByText('Song a');
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link for Main Set' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/shared/sl-1`));
  });

  it('a shared id that is not a set list of the band does not make this list look shared', async () => {
    setup(makeView({}, band({ setListIds: ['sl-1'], sharedSetListIds: ['sl-2'] })));
    await screen.findByText('Song a');
    expect(screen.queryByRole('button', { name: /Copy share link/ })).not.toBeInTheDocument();
  });

  it('shows an empty state with a prompt', async () => {
    setup(makeView(), [], []);
    expect(await screen.findByText('No songs yet. Suggest the first one!')).toBeInTheDocument();
  });

  it('warns when the member roster was too long to load (members, songs or votes may be missing)', async () => {
    setup(makeView({ incomplete: true }));
    await screen.findByText('Song a');
    expect(screen.getByText(/some members, songs, votes, colors, click tracks or backing tracks may be missing/)).toBeInTheDocument();
  });

  it('a failed hide shows the error and STILL reloads, so nothing half-applied stays on screen', async () => {
    vi.mocked(hideSong).mockRejectedValue(new Error('The band changed while you were editing. Please retry.'));
    setup(makeView({ isOwner: true, sub: OWNER }));
    await screen.findByText('Song b');
    fireEvent.click(within(row('Song b')).getByRole('button', { name: 'Hide Song b' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The band changed');
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
  });

  it('a failed suggest keeps the dialog open with the error and still reloads the list', async () => {
    vi.mocked(suggestSong).mockRejectedValue(new Error('This set list is full (100 songs)'));
    setup();
    await screen.findByText('Song a');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a song' }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'One more' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(await screen.findByText('This set list is full (100 songs)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suggest' })).toBeEnabled();
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
  });

  it('a failed background refresh keeps the songs on screen and says the view may be out of date', async () => {
    vi.mocked(loadBandView).mockResolvedValueOnce({ status: 'ok', view: makeView() }).mockRejectedValue(new Error('network'));
    vi.mocked(fetchSetListRows).mockResolvedValue({
      songs: emptyPage([song('a', BOB, '2026-01-02T00:00:00Z')]),
      votes: emptyPage([]),
    });
    render(
      <MemoryRouter initialEntries={['/bands/band-1/setlists/sl-1']}>
        <Routes><Route path="/bands/:bandId/setlists/:setListId" element={<SetListPage />} /></Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Song a');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/Couldn’t refresh, so this may be out of date: network/)).toBeInTheDocument();
    expect(screen.getByText('Song a')).toBeInTheDocument();
  });

  it('warns when the list was too long to load completely', async () => {
    vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view: makeView() });
    vi.mocked(fetchSetListRows).mockResolvedValue({ songs: { items: [], incomplete: true }, votes: emptyPage([]) });
    render(
      <MemoryRouter initialEntries={['/bands/band-1/setlists/sl-1']}>
        <Routes><Route path="/bands/:bandId/setlists/:setListId" element={<SetListPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('status')).toHaveTextContent('too long to load completely');
  });

  it('fails closed with a retry button when loading fails', async () => {
    vi.mocked(loadBandView).mockRejectedValue(new Error('gsi down'));
    vi.mocked(fetchSetListRows).mockResolvedValue({ songs: emptyPage([]), votes: emptyPage([]) });
    render(
      <MemoryRouter initialEntries={['/bands/band-1/setlists/sl-1']}>
        <Routes><Route path="/bands/:bandId/setlists/:setListId" element={<SetListPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('gsi down');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('No songs yet. Suggest the first one!')).not.toBeInTheDocument();
  });

  it.each([
    ['removed', 'You were removed from this band'],
    ['deleted', 'This band was deleted'],
    ['not-found', 'Band not found'],
  ] as const)('shows a message for a %s band instead of songs', async (status, text) => {
    vi.mocked(loadBandView).mockResolvedValue(
      status === 'removed' ? { status, band: band() } : ({ status } as never),
    );
    vi.mocked(fetchSetListRows).mockResolvedValue({ songs: emptyPage([]), votes: emptyPage([]) });
    render(
      <MemoryRouter initialEntries={['/bands/band-1/setlists/sl-1']}>
        <Routes><Route path="/bands/:bandId/setlists/:setListId" element={<SetListPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suggest a song' })).not.toBeInTheDocument();
  });

  it('non-members are pointed at the band page and cannot see songs', async () => {
    setup(makeView({ isMember: false }));
    expect(await screen.findByText('Join this band to see its set lists')).toBeInTheDocument();
    expect(screen.queryByText('Song a')).not.toBeInTheDocument();
  });

  it('says so when the set list is not in the band (archived or forged id)', async () => {
    setup(makeView({ setLists: [] }));
    expect(await screen.findByText('Set list not found')).toBeInTheDocument();
  });

  describe('song colors', () => {
    const pick = async (title: string, color: string) => {
      const user = userEvent.setup();
      await user.click(within(row(title)).getByRole('button', { name: new RegExp(`^Set color for ${title}(, now .+)?$`) }));
      await user.click(await screen.findByRole('menuitem', { name: color }));
    };
    const calls = () => vi.mocked(setSongColor).mock.calls;

    it('shows each song\'s shared color as a stripe, and leaves uncolored songs plain', async () => {
      setup(makeView(), undefined, undefined, [colorRow('a', 'purple')]);
      await screen.findByText('Song a');
      expect(row('Song a')).toHaveClass('border-l-4');
      expect(row('Song a')).toHaveStyle({ borderLeftColor: SONG_COLOR_STYLES.purple.hex });
      // the plain row keeps a transparent border so rows line up, but has no inline color
      expect(row('Song b')).toHaveClass('border-l-4', 'border-l-transparent');
      expect(row('Song b').getAttribute('style') ?? '').not.toMatch(/border-left-color|background-color/);
    });

    it('ignores a stored color that is not in the palette and one for a song that is not shown', async () => {
      setup(makeView(), undefined, undefined, [colorRow('a', 'chartreuse'), colorRow('ghost', 'red'), colorRow('b', 'none')]);
      await screen.findByText('Song a');
      expect(row('Song a').getAttribute('style') ?? '').not.toMatch(/border-left-color/);
      expect(row('Song b').getAttribute('style') ?? '').not.toMatch(/border-left-color/);
    });

    it('ignores a color written by someone who is not a member of the band', async () => {
      setup(makeView(), undefined, undefined, [colorRow('a', 'red', 'sub-mallory')]);
      await screen.findByText('Song a');
      expect(row('Song a').getAttribute('style') ?? '').not.toMatch(/border-left-color/);
    });

    it('shows the newest color across members', async () => {
      setup(makeView(), undefined, undefined, [
        colorRow('a', 'red', BOB, '2026-02-01T00:00:00Z'),
        colorRow('a', 'blue', ME, '2026-03-01T00:00:00Z'),
      ]);
      await screen.findByText('Song a');
      expect(row('Song a')).toHaveStyle({ borderLeftColor: SONG_COLOR_STYLES.blue.hex });
    });

    it('a newer "none" row from another member leaves the song uncolored', async () => {
      setup(makeView(), undefined, undefined, [
        colorRow('a', 'red', BOB, '2026-02-01T00:00:00Z'),
        colorRow('a', 'none', ME, '2026-03-01T00:00:00Z'),
      ]);
      await screen.findByText('Song a');
      expect(row('Song a').getAttribute('style') ?? '').not.toMatch(/border-left-color/);
    });

    it('any member can pick a color: it shows immediately and is saved for the song', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      setup();
      await screen.findByText('Song a');
      await pick('Song a', 'Red');
      expect(row('Song a')).toHaveStyle({ borderLeftColor: SONG_COLOR_STYLES.red.hex });
      await waitFor(() => expect(setSongColor).toHaveBeenCalledTimes(1));
      expect(setSongColor).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a', bandId: 'band-1', setListId: 'sl-1' }),
        'red',
        false,
      );
    });

    it('announces the current color on the picker trigger', async () => {
      setup(makeView(), undefined, undefined, [colorRow('a', 'purple')]);
      await screen.findByText('Song a');
      expect(within(row('Song a')).getByRole('button', { name: 'Set color for Song a, now Purple' })).toBeInTheDocument();
      expect(within(row('Song b')).getByRole('button', { name: 'Set color for Song b' })).toBeInTheDocument();
    });

    it('recoloring a song someone else colored still creates my own row (exists = false)', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      setup(makeView(), undefined, undefined, [colorRow('a', 'red', BOB)]);
      await screen.findByText('Song a');
      await pick('Song a', 'Blue');
      await waitFor(() => expect(setSongColor).toHaveBeenCalledTimes(1));
      expect(calls()[0].slice(1)).toEqual(['blue', false]);
    });

    it('changing a color I already set tells the API my row exists', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      setup(makeView(), undefined, undefined, [colorRow('a', 'red', ME)]);
      await screen.findByText('Song a');
      await pick('Song a', 'Blue');
      await waitFor(() => expect(setSongColor).toHaveBeenCalledTimes(1));
      expect(calls()[0].slice(1)).toEqual(['blue', true]);
    });

    it('my own cleared ("none") row still counts as existing', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      setup(makeView(), undefined, undefined, [colorRow('a', 'none', ME)]);
      await screen.findByText('Song a');
      await pick('Song a', 'Green');
      await waitFor(() => expect(setSongColor).toHaveBeenCalledTimes(1));
      expect(calls()[0].slice(1)).toEqual(['green', true]);
    });

    it('a second pick after a successful first one uses the update path', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      setup();
      await screen.findByText('Song a');
      await pick('Song a', 'Red');
      await waitFor(() => expect(setSongColor).toHaveBeenCalledTimes(1));
      await pick('Song a', 'Blue');
      await waitFor(() => expect(setSongColor).toHaveBeenCalledTimes(2));
      expect(calls()[0].slice(1)).toEqual(['red', false]);
      expect(calls()[1].slice(1)).toEqual(['blue', true]);
    });

    it('"No color" removes the stripe at once and saves null', async () => {
      vi.mocked(setSongColor).mockResolvedValue(undefined);
      setup(makeView(), undefined, undefined, [colorRow('a', 'red', ME)]);
      await screen.findByText('Song a');
      await pick('Song a', 'No color');
      expect(row('Song a').getAttribute('style') ?? '').not.toMatch(/border-left-color/);
      expect(row('Song a')).toHaveClass('border-l-transparent');
      await waitFor(() => expect(setSongColor).toHaveBeenCalledTimes(1));
      expect(calls()[0].slice(1)).toEqual([null, true]);
    });

    it('a failed save reverts the color and shows the error', async () => {
      vi.mocked(setSongColor).mockRejectedValue(new Error('Could not save the song color. Please try again.'));
      setup(makeView(), undefined, undefined, [colorRow('a', 'red')]);
      await screen.findByText('Song a');
      await pick('Song a', 'Blue');
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the song color. Please try again.');
      expect(row('Song a')).toHaveStyle({ borderLeftColor: SONG_COLOR_STYLES.red.hex });
    });

    it('warns that the list may be incomplete when only the colors page cap was hit', async () => {
      vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view: makeView() });
      vi.mocked(fetchSetListRows).mockResolvedValue({
        songs: emptyPage([song('a', BOB, '2026-01-02T00:00:00Z')]),
        votes: emptyPage([]),
        colors: { items: [], incomplete: true },
      });
      render(
        <MemoryRouter initialEntries={['/bands/band-1/setlists/sl-1']}>
          <Routes>
            <Route path="/bands/:bandId/setlists/:setListId" element={<SetListPage />} />
          </Routes>
        </MemoryRouter>,
      );
      await screen.findByText('Song a');
      expect(
        screen.getByText('This list was too long to load completely, so some members, songs, votes, colors, click tracks or backing tracks may be missing.'),
      ).toBeInTheDocument();
    });

    it('shows no incomplete banner when nothing hit a cap', async () => {
      setup();
      await screen.findByText('Song a');
      expect(screen.queryByText(/too long to load completely/)).not.toBeInTheDocument();
    });
  });
  describe('color labels', () => {
    const user = () => userEvent.setup();
    const openLabels = async (u: ReturnType<typeof userEvent.setup>) => {
      await u.click(screen.getByRole('button', { name: 'Color labels' }));
      return screen.findByRole('dialog');
    };
    const labelInput = (name: string) => screen.getByLabelText(`${name} label`);

    it('loads the band\'s labels for this band alongside the set list', async () => {
      setup();
      await screen.findByText('Song a');
      expect(fetchColorLabelRows).toHaveBeenCalledWith('band-1');
    });

    it('shows the band label for a song\'s color on its picker trigger', async () => {
      setup(makeView(), undefined, undefined, [colorRow('a', 'red')], [labelRow('red', 'Ballad')]);
      await screen.findByText('Song a');
      const trigger = within(row('Song a')).getByRole('button', { name: 'Set color for Song a, now Red, Ballad' });
      expect(trigger).toHaveTextContent('Ballad');
    });

    it('uses the palette name for a colored song whose color has no label', async () => {
      setup(makeView(), undefined, undefined, [colorRow('a', 'red')], [labelRow('blue', 'Thrash')]);
      await screen.findByText('Song a');
      expect(within(row('Song a')).getByRole('button', { name: 'Set color for Song a, now Red' })).toHaveTextContent('Red');
    });

    it('shows labels in the picker menu', async () => {
      setup(makeView(), undefined, undefined, [], [labelRow('blue', 'Thrash')]);
      await screen.findByText('Song a');
      const u = user();
      await u.click(within(row('Song a')).getByRole('button', { name: 'Set color for Song a' }));
      expect(await screen.findByRole('menuitem', { name: 'Blue, Thrash' })).toBeInTheDocument();
    });

    it('ignores labels from non-members and shows the newest valid one', async () => {
      setup(makeView(), undefined, undefined, [colorRow('a', 'red')], [
        labelRow('red', 'Hacked', 'sub-mallory', '2026-05-01T00:00:00Z'),
        labelRow('red', 'Old', BOB, '2026-02-01T00:00:00Z'),
        labelRow('red', 'Newest', ME, '2026-03-01T00:00:00Z'),
      ]);
      await screen.findByText('Song a');
      expect(within(row('Song a')).getByRole('button', { name: 'Set color for Song a, now Red, Newest' })).toBeInTheDocument();
    });

    it('hides labels with spoofed text', async () => {
      setup(makeView(), undefined, undefined, [colorRow('a', 'red')], [labelRow('red', 'Bal\u200blad')]);
      await screen.findByText('Song a');
      expect(within(row('Song a')).getByRole('button', { name: 'Set color for Song a, now Red' })).toBeInTheDocument();
    });

    it('a label read that degraded (incomplete) still shows the songs and flags the list as possibly incomplete', async () => {
      vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view: makeView() });
      vi.mocked(fetchSetListRows).mockResolvedValue({
        songs: emptyPage([song('a', BOB, '2026-01-02T00:00:00Z')]),
        votes: emptyPage([]),
        colors: emptyPage([]),
      });
      vi.mocked(fetchColorLabelRows).mockResolvedValue({ items: [], incomplete: true });
      render(
        <MemoryRouter initialEntries={['/bands/band-1/setlists/sl-1']}>
          <Routes>
            <Route path="/bands/:bandId/setlists/:setListId" element={<SetListPage />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(await screen.findByText('Song a')).toBeInTheDocument();
      expect(
        screen.getByText('This list was too long to load completely, so some members, songs, votes, colors, click tracks or backing tracks may be missing.'),
      ).toBeInTheDocument();
    });

    describe('Color labels dialog', () => {
      it('has a "Color labels" button for every member', async () => {
        setup();
        await screen.findByText('Song a');
        expect(screen.getByRole('button', { name: 'Color labels' })).toBeInTheDocument();
      });

      it('opens seeded with the band\'s labels', async () => {
        setup(makeView(), undefined, undefined, [], [labelRow('red', 'Ballad'), labelRow('blue', 'Thrash')]);
        await screen.findByText('Song a');
        const u = user();
        await openLabels(u);
        expect(screen.getByRole('heading', { name: 'Color labels' })).toBeInTheDocument();
        expect(labelInput('Red')).toHaveValue('Ballad');
        expect(labelInput('Blue')).toHaveValue('Thrash');
        expect(labelInput('Green')).toHaveValue('');
      });

      it('saving a new label writes it for the band with no row of mine yet, shows it at once and closes', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        setup();
        await screen.findByText('Song a');
        const u = user();
        await openLabels(u);
        fireEvent.change(labelInput('Red'), { target: { value: 'Ballad' } });
        await u.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(setColorLabel).toHaveBeenCalledTimes(1));
        expect(setColorLabel).toHaveBeenCalledWith('band-1', 'red', 'Ballad', false);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      });

      it('a label shows on a colored song right after saving', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        setup(makeView(), undefined, undefined, [colorRow('a', 'red')]);
        await screen.findByText('Song a');
        const u = user();
        await openLabels(u);
        fireEvent.change(labelInput('Red'), { target: { value: 'Ballad' } });
        await u.click(screen.getByRole('button', { name: 'Save' }));
        expect(await within(row('Song a')).findByRole('button', { name: 'Set color for Song a, now Red, Ballad' })).toBeInTheDocument();
      });

      it('renaming a label I already wrote tells the API my row exists', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        setup(makeView(), undefined, undefined, [], [labelRow('red', 'Ballad', ME)]);
        await screen.findByText('Song a');
        const u = user();
        await openLabels(u);
        fireEvent.change(labelInput('Red'), { target: { value: 'Slow' } });
        await u.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(setColorLabel).toHaveBeenCalledTimes(1));
        expect(setColorLabel).toHaveBeenCalledWith('band-1', 'red', 'Slow', true);
      });

      it('renaming a label someone else wrote creates my own row (exists = false)', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        setup(makeView(), undefined, undefined, [], [labelRow('red', 'Ballad', BOB)]);
        await screen.findByText('Song a');
        const u = user();
        await openLabels(u);
        fireEvent.change(labelInput('Red'), { target: { value: 'Slow' } });
        await u.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(setColorLabel).toHaveBeenCalledTimes(1));
        expect(setColorLabel).toHaveBeenCalledWith('band-1', 'red', 'Slow', false);
      });

      it('clearing a label writes "" for just that color', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        setup(makeView(), undefined, undefined, [], [labelRow('red', 'Ballad', ME), labelRow('blue', 'Thrash', ME)]);
        await screen.findByText('Song a');
        const u = user();
        await openLabels(u);
        fireEvent.change(labelInput('Red'), { target: { value: '' } });
        await u.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(setColorLabel).toHaveBeenCalledTimes(1));
        expect(setColorLabel).toHaveBeenCalledWith('band-1', 'red', '', true);
      });

      it('saving without edits writes nothing, closes, and still reloads', async () => {
        setup(makeView(), undefined, undefined, [], [labelRow('red', 'Ballad')]);
        await screen.findByText('Song a');
        const u = user();
        await openLabels(u);
        await u.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(setColorLabel).not.toHaveBeenCalled();
        await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
      });

      it('reloads the list after saving', async () => {
        vi.mocked(setColorLabel).mockResolvedValue(undefined);
        setup();
        await screen.findByText('Song a');
        const u = user();
        await openLabels(u);
        fireEvent.change(labelInput('Red'), { target: { value: 'Ballad' } });
        await u.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
        expect(fetchColorLabelRows).toHaveBeenCalledTimes(2);
      });

      it('a failed save keeps the dialog open with the error, rolls the label back, and still reloads', async () => {
        vi.mocked(setColorLabel).mockRejectedValue(new Error('Could not save the color label. Please try again.'));
        setup(makeView(), undefined, undefined, [colorRow('a', 'red')]);
        await screen.findByText('Song a');
        const u = user();
        await openLabels(u);
        fireEvent.change(labelInput('Red'), { target: { value: 'Ballad' } });
        await u.click(screen.getByRole('button', { name: 'Save' }));
        expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
          'Could not save the color label. Please try again.',
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(labelInput('Red')).toHaveValue('Ballad');
        await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
        // the modal hides the page from the accessibility tree, hence `hidden`
        expect(within(row('Song a')).getByRole('button', { name: 'Set color for Song a, now Red', hidden: true })).toBeInTheDocument();
      });

      it('Cancel closes without writing', async () => {
        setup();
        await screen.findByText('Song a');
        const u = user();
        await openLabels(u);
        fireEvent.change(labelInput('Red'), { target: { value: 'Ballad' } });
        await u.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(setColorLabel).not.toHaveBeenCalled();
      });

      it('names the band in the dialog', async () => {
        setup();
        await screen.findByText('Song a');
        await openLabels(user());
        expect(screen.getByText(/Name the colors for The Band/)).toBeInTheDocument();
      });
    });

    describe('suggesting a song with a color', () => {
      const openSuggest = async (title: string) => {
        fireEvent.click(screen.getByRole('button', { name: 'Suggest a song' }));
        fireEvent.change(await screen.findByLabelText('Title'), { target: { value: title } });
      };

      it('shows the band\'s labels in the dialog\'s color choice', async () => {
        setup(makeView(), undefined, undefined, [], [labelRow('red', 'Ballad')]);
        await screen.findByText('Song a');
        fireEvent.click(screen.getByRole('button', { name: 'Suggest a song' }));
        expect(await screen.findByRole('radio', { name: 'Red, Ballad' })).toBeInTheDocument();
      });

      it('colors the new song with the chosen color after it is created (no row of mine yet)', async () => {
        const created = song('new', ME, '2026-01-05T00:00:00Z');
        vi.mocked(suggestSong).mockResolvedValue(created);
        vi.mocked(setSongColor).mockResolvedValue(undefined);
        setup();
        await screen.findByText('Song a');
        await openSuggest('Wonderwall');
        fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));
        fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
        await waitFor(() => expect(setSongColor).toHaveBeenCalledTimes(1));
        expect(setSongColor).toHaveBeenCalledWith(created, 'blue', false);
        expect(vi.mocked(suggestSong).mock.calls[0][2]).toMatchObject({ title: 'Wonderwall' });
      });

      it('does not write a color when none was chosen', async () => {
        vi.mocked(suggestSong).mockResolvedValue(song('new', ME, '2026-01-05T00:00:00Z'));
        setup();
        await screen.findByText('Song a');
        await openSuggest('Wonderwall');
        fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
        await waitFor(() => expect(suggestSong).toHaveBeenCalled());
        await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
        expect(setSongColor).not.toHaveBeenCalled();
      });

      it('does not write a color when the song could not be created', async () => {
        vi.mocked(suggestSong).mockRejectedValue(new Error('This set list is full (100 songs)'));
        setup();
        await screen.findByText('Song a');
        await openSuggest('One more');
        fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));
        fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
        expect(await screen.findByText('This set list is full (100 songs)')).toBeInTheDocument();
        expect(setSongColor).not.toHaveBeenCalled();
      });

      it('a failed color write does not fail the suggestion: the dialog closes and the page shows the error', async () => {
        vi.mocked(suggestSong).mockResolvedValue(song('new', ME, '2026-01-05T00:00:00Z'));
        vi.mocked(setSongColor).mockRejectedValue(new Error('Could not save the song color. Please try again.'));
        setup();
        await screen.findByText('Song a');
        await openSuggest('Wonderwall');
        fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));
        fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the song color. Please try again.');
        await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
      });

      it('editing a song offers no color choice', async () => {
        setup();
        await screen.findByText('Song b');
        fireEvent.click(within(row('Song b')).getByRole('button', { name: 'Edit Song b' }));
        expect(await screen.findByRole('heading', { name: 'Edit song' })).toBeInTheDocument();
        expect(screen.queryByText('Color (optional)')).not.toBeInTheDocument();
      });
    });
  });
});

describe('song reordering', () => {
  const ownerView = (songOrder?: string[]) =>
    makeView({
      isOwner: true,
      sub: OWNER,
      setLists: [
        { id: 'sl-1', owner: OWNER, bandId: 'band-1', name: 'Main Set', archivedAt: null, songOrder },
      ] as unknown as ValidSetList[],
    });
  const three = () => [
    song('a', BOB, '2026-01-02T00:00:00Z'),
    song('b', ME, '2026-01-02T00:00:01Z'),
    song('c', ME, '2026-01-02T00:00:02Z'),
  ];
  // Votes make the vote order b, a, c.
  const votes = () => [vote('b', BOB, 'up'), vote('b', ME, 'up'), vote('a', BOB, 'up')];
  const orderedTitles = () =>
    within(screen.getByRole('list', { name: 'Song order' }))
      .getAllByRole('listitem')
      .map((li) => /Song [abc]/.exec(li.textContent ?? '')?.[0]);

  it('shows a Reorder button to the owner only', async () => {
    setup(ownerView(), three(), votes());
    await screen.findByText('Song a');
    expect(screen.getByRole('button', { name: /Reorder/ })).toBeInTheDocument();
    cleanupAll();
    setup(makeView(), three(), votes());
    await screen.findByText('Song a');
    expect(screen.queryByRole('button', { name: /Reorder/ })).not.toBeInTheDocument();
  });

  it('offers no Reorder button when there is only one song', async () => {
    setup(ownerView(), [song('a', BOB, '2026-01-02T00:00:00Z')], []);
    await screen.findByText('Song a');
    expect(screen.queryByRole('button', { name: /Reorder/ })).not.toBeInTheDocument();
  });

  it('entering reorder mode lists the songs in their current order, hides vote rows and disables Suggest', async () => {
    setup(ownerView(), three(), votes());
    await screen.findByText('Song a');
    fireEvent.click(screen.getByRole('button', { name: /Reorder/ }));
    expect(orderedTitles()).toEqual(['Song b', 'Song a', 'Song c']);
    expect(screen.queryByRole('button', { name: 'Upvote Song a' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suggest a song' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset to vote order' })).not.toBeInTheDocument();
  });

  it('Done saves the moved order once and returns to the ranked list', async () => {
    vi.mocked(reorderSongs).mockResolvedValue(undefined);
    setup(ownerView(), three(), votes());
    await screen.findByText('Song a');
    fireEvent.click(screen.getByRole('button', { name: /Reorder/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Song c up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Song c up' }));
    expect(orderedTitles()).toEqual(['Song c', 'Song b', 'Song a']);
    expect(reorderSongs).not.toHaveBeenCalled(); // moves only change the local draft
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(reorderSongs).toHaveBeenCalledTimes(1));
    expect(reorderSongs).toHaveBeenCalledWith('sl-1', ['c', 'b', 'a']);
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2)); // reloads afterwards
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Song order' })).not.toBeInTheDocument());
  });

  it('Done without any move writes nothing', async () => {
    setup(ownerView(), three(), votes());
    await screen.findByText('Song a');
    fireEvent.click(screen.getByRole('button', { name: /Reorder/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Song order' })).not.toBeInTheDocument());
    expect(reorderSongs).not.toHaveBeenCalled();
  });

  it('Cancel discards the draft without saving', async () => {
    setup(ownerView(), three(), votes());
    await screen.findByText('Song a');
    fireEvent.click(screen.getByRole('button', { name: /Reorder/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Song c up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(reorderSongs).not.toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: 'Song order' })).not.toBeInTheDocument();
    // Re-entering starts from the saved order again, not the discarded draft.
    fireEvent.click(screen.getByRole('button', { name: /Reorder/ }));
    expect(orderedTitles()).toEqual(['Song b', 'Song a', 'Song c']);
  });

  it('shows the owner order and the running-order subtitle once an order is saved', async () => {
    setup(ownerView(['c', 'a', 'b']), three(), votes());
    await screen.findByText('Song a');
    const titles = screen
      .getAllByRole('listitem')
      .map((li) => /Song [abc]/.exec(li.textContent ?? '')?.[0])
      .filter(Boolean);
    expect(titles).toEqual(['Song c', 'Song a', 'Song b']);
    expect(screen.getByText(/In the owner’s running order/)).toBeInTheDocument();
    expect(screen.queryByText(/Suggestions ranked by votes/)).not.toBeInTheDocument();
  });

  it('Reset to vote order appears only with a saved order and saves an empty order', async () => {
    vi.mocked(reorderSongs).mockResolvedValue(undefined);
    setup(ownerView(['c', 'a', 'b']), three(), votes());
    await screen.findByText('Song a');
    fireEvent.click(screen.getByRole('button', { name: /Reorder/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to vote order' }));
    await waitFor(() => expect(reorderSongs).toHaveBeenCalledWith('sl-1', []));
  });

  it('a failed save shows the error, keeps the draft on screen and still reloads', async () => {
    vi.mocked(reorderSongs).mockRejectedValue(new Error('Not Authorized'));
    setup(ownerView(), three(), votes());
    await screen.findByText('Song a');
    fireEvent.click(screen.getByRole('button', { name: /Reorder/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Song c up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not Authorized');
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
    expect(orderedTitles()).toEqual(['Song b', 'Song c', 'Song a']);
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });
});

describe('song list text', () => {
  const titled = (id: string, title: string, artist: string | null, createdAt: string): SongRecord => ({
    ...song(id, BOB, createdAt),
    title,
    artist,
  });
  const ownerView = () =>
    makeView({
      isOwner: true,
      sub: OWNER,
      setLists: [
        { id: 'sl-1', owner: OWNER, bandId: 'band-1', name: 'Main Set', archivedAt: null },
      ] as unknown as ValidSetList[],
    });
  const rows = () => [
    titled('a', 'Alpha', 'Band A', '2026-01-02T00:00:00Z'),
    titled('b', 'Beta', null, '2026-01-02T00:00:01Z'),
  ];

  it('opens a dialog with the numbered songs in the order shown (vote ranked)', async () => {
    setup(makeView(), rows(), [vote('b', BOB, 'up')]);
    await screen.findByText('Alpha');
    fireEvent.click(screen.getByRole('button', { name: /Song list/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Song list').textContent).toBe('1. Beta\n2. Alpha - Band A');
  });

  it('can be closed again', async () => {
    setup(makeView(), rows(), []);
    await screen.findByText('Alpha');
    fireEvent.click(screen.getByRole('button', { name: /Song list/ }));
    const dialog = await screen.findByRole('dialog');
    const footerClose = within(dialog).getAllByRole('button', { name: 'Close' }).find((b) => !b.querySelector('svg'));
    fireEvent.click(footerClose as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('is disabled when the set list has no songs', async () => {
    setup(makeView(), [], []);
    await screen.findByRole('button', { name: /Song list/ });
    expect(screen.getByRole('button', { name: /Song list/ })).toBeDisabled();
  });

  it('is disabled while reordering and enabled again after Cancel', async () => {
    setup(ownerView(), rows(), []);
    await screen.findByText('Alpha');
    expect(screen.getByRole('button', { name: /Song list/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Reorder/ }));
    expect(screen.getByRole('button', { name: /Song list/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: /Song list/ })).toBeEnabled();
  });

  it('follows the owner running order when one is saved', async () => {
    const view = makeView({
      setLists: [
        { id: 'sl-1', owner: OWNER, bandId: 'band-1', name: 'Main Set', archivedAt: null, songOrder: ['b', 'a'] },
      ] as unknown as ValidSetList[],
    });
    setup(view, rows(), [vote('a', BOB, 'up')]);
    await screen.findByText('Alpha');
    fireEvent.click(screen.getByRole('button', { name: /Song list/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Song list').textContent).toBe('1. Beta\n2. Alpha - Band A');
  });
});

describe('song click tracks', () => {
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
  const meta = (songId: string, over: Partial<SongTrackMetaRecord> = {}): SongTrackMetaRecord => ({
    songId,
    owner: BOB,
    setListId: 'sl-1',
    format: 1,
    bytes: 400,
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    ...over,
  });
  const okRead = (pieces: TrackPiece[] = [piece()], stale = false): SongTrackRead => ({ status: 'ok', pieces, groups: [], stale });
  const strip = (title: string) => within(row(title));
  const withTrack = (over: Partial<SongTrackMetaRecord> = {}) =>
    setup(makeView(), undefined, undefined, [], [], [meta('a', over)]);

  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows nothing for a song without a click track', async () => {
    setup();
    await screen.findByText('Song a');
    expect(screen.queryByText(/Click track ·/)).not.toBeInTheDocument();
  });

  it('shows who attached the track and when, with Play, Download, Open and Remove', async () => {
    withTrack();
    await screen.findByText('Song a');
    expect(row('Song a')).toHaveTextContent(/Click track · by Bob, /);
    for (const name of [/Play click track for Song a/, /Download click track for Song a/, /Open click track for Song a/, /Remove click track for Song a/]) {
      expect(strip('Song a').getByRole('button', { name })).toBeEnabled();
    }
    expect(row('Song b')).not.toHaveTextContent('Click track');
  });

  it('ignores a track written by a stranger or a banned member', async () => {
    setup(makeView(), undefined, undefined, [], [], [meta('a', { owner: 'sub-mallory' })]);
    await screen.findByText('Song a');
    expect(screen.queryByText(/Click track ·/)).not.toBeInTheDocument();
  });

  it('Play unlocks audio first, fetches the payload by the shown author, plays once at 100%, and Stop stops it', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Play click track for Song a/ }));
    expect(engine.prime).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(engine.start).toHaveBeenCalledTimes(1));
    expect(getSongTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), expect.objectContaining({ owner: BOB }));
    expect(engine.start.mock.calls[0]![0]).toEqual([piece()]);
    expect(engine.start.mock.calls[0]![1]).toBe(0);
    expect(engine.start.mock.calls[0]![2]).toBe(1);
    expect(engine.start.mock.calls[0]![3]).toBe(false); // no count-in

    const stop = await strip('Song a').findByRole('button', { name: /Stop click track for Song a/ });
    fireEvent.click(stop);
    expect(engine.stop).toHaveBeenCalled();
    expect(await strip('Song a').findByRole('button', { name: /Play click track for Song a/ })).toBeInTheDocument();
  });

  it('returns the button to Play when the track ends by itself', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Play click track for Song a/ }));
    await waitFor(() => expect(engine.start).toHaveBeenCalled());
    await strip('Song a').findByRole('button', { name: /Stop click track/ });
    const onStop = engine.start.mock.calls[0]![6] as () => void;
    onStop();
    expect(await strip('Song a').findByRole('button', { name: /Play click track for Song a/ })).toBeInTheDocument();
  });

  describe('runway', () => {
    const runwayOf = (title: string) => strip(title).queryByRole('group', { name: 'Click track position' });
    const onBeat = () => engine.start.mock.calls[0]![7] as (pieceIndex: number, rep: number, subTick: number) => void;
    const playSongA = async (pieces: TrackPiece[] = [piece()], groups: SegmentGroup[] = []) => {
      vi.mocked(getSongTrack).mockResolvedValue({ status: 'ok', pieces, groups, stale: false });
      withTrack();
      await screen.findByText('Song a');
      fireEvent.click(strip('Song a').getByRole('button', { name: /Play click track for Song a/ }));
      await waitFor(() => expect(engine.start).toHaveBeenCalledTimes(1));
      await strip('Song a').findByRole('button', { name: /Stop click track/ });
    };

    it('shows no runway until the track plays', async () => {
      vi.mocked(getSongTrack).mockResolvedValue(okRead());
      withTrack();
      await screen.findByText('Song a');
      expect(runwayOf('Song a')).not.toBeInTheDocument();
    });

    it('subscribes to the engine beat callback and shows the runway under the playing song only', async () => {
      await playSongA([piece({ bpm: 90, label: 'Verse' })]);
      expect(typeof onBeat()).toBe('function');
      expect(runwayOf('Song a')).toBeInTheDocument();
      expect(runwayOf('Song a')).toHaveTextContent('90 BPM');
      expect(runwayOf('Song a')).toHaveTextContent('Verse');
      expect(runwayOf('Song b')).not.toBeInTheDocument();
    });

    it('follows the beats the engine reports', async () => {
      await playSongA([piece({ bpm: 100, repeats: 3 }), piece({ id: 'p2', bpm: 140, repeats: 2 })]);
      const region = runwayOf('Song a')!;
      expect(region.querySelector('.ct-runway-dot--clicking')).toBeNull();

      act(() => onBeat()(0, 1, 2));
      expect(region.querySelector('.ct-runway-bar.is-current .ct-runway-number')).toHaveTextContent('2');
      const dots = Array.from(region.querySelectorAll('.ct-runway-bar.is-current .ct-runway-dot'));
      expect(dots.findIndex((d) => d.classList.contains('ct-runway-dot--clicking'))).toBe(2);

      act(() => onBeat()(1, 0, 0));
      expect(region).toHaveTextContent('140 BPM');
      expect(region.querySelector('.ct-runway-bar.is-current .ct-runway-number')).toHaveTextContent('4');
    });

    it('uses the group names stored with the track', async () => {
      await playSongA([piece({ groupId: 'g1', label: 'Lift' })], [{ id: 'g1', name: 'Chorus', color: '#ef4444' }]);
      expect(runwayOf('Song a')).toHaveTextContent('Chorus · Lift');
    });

    it('starts each play from the first bar even if an earlier run ended mid-track', async () => {
      await playSongA([piece({ repeats: 6 })]);
      act(() => onBeat()(0, 4, 1));
      fireEvent.click(strip('Song a').getByRole('button', { name: /Stop click track for Song a/ }));
      await strip('Song a').findByRole('button', { name: /Play click track for Song a/ });

      engine.start.mockClear();
      fireEvent.click(strip('Song a').getByRole('button', { name: /Play click track for Song a/ }));
      await waitFor(() => expect(engine.start).toHaveBeenCalledTimes(1));
      const region = await strip('Song a').findByRole('group', { name: 'Click track position' });
      expect(region.querySelector('.ct-runway-bar.is-current .ct-runway-number')).toHaveTextContent('1');
      expect(region.querySelector('.ct-runway-dot--clicking')).toBeNull();
    });

    it('ignores beats and the end callback of an earlier run once a new run has started', async () => {
      await playSongA([piece({ repeats: 6 })]);
      const oldBeat = onBeat();
      const oldEnd = engine.start.mock.calls[0]![6] as () => void;
      fireEvent.click(strip('Song a').getByRole('button', { name: /Stop click track for Song a/ }));
      await strip('Song a').findByRole('button', { name: /Play click track for Song a/ });

      engine.start.mockClear();
      fireEvent.click(strip('Song a').getByRole('button', { name: /Play click track for Song a/ }));
      await waitFor(() => expect(engine.start).toHaveBeenCalledTimes(1));
      const region = await strip('Song a').findByRole('group', { name: 'Click track position' });

      act(() => oldBeat(0, 4, 3)); // a late callback from the run that was stopped
      expect(region.querySelector('.ct-runway-bar.is-current .ct-runway-number')).toHaveTextContent('1');
      act(() => oldEnd());
      expect(runwayOf('Song a')).toBeInTheDocument();
      expect(strip('Song a').getByRole('button', { name: /Stop click track for Song a/ })).toBeInTheDocument();

      act(() => (engine.start.mock.calls[0]![7] as (p: number, r: number, s: number) => void)(0, 2, 1));
      expect(region.querySelector('.ct-runway-bar.is-current .ct-runway-number')).toHaveTextContent('3');
    });

    it('removes the runway on Stop', async () => {
      await playSongA();
      fireEvent.click(strip('Song a').getByRole('button', { name: /Stop click track for Song a/ }));
      await strip('Song a').findByRole('button', { name: /Play click track for Song a/ });
      expect(runwayOf('Song a')).not.toBeInTheDocument();
    });

    it('removes the runway when the track ends by itself', async () => {
      await playSongA();
      act(() => (engine.start.mock.calls[0]![6] as () => void)());
      await strip('Song a').findByRole('button', { name: /Play click track for Song a/ });
      expect(runwayOf('Song a')).not.toBeInTheDocument();
    });
  });

  it('Download renders the track at 100% into a WAV named after the song', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Download click track for Song a/ }));
    await waitFor(() => expect(exportClickTrack).toHaveBeenCalledWith([piece()], 100, 'Song a-click.wav', 'wav', expect.any(AbortSignal)));
  });

  it('the FLAC button renders the track at 100% into a FLAC named after the song', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Download compressed click track \(FLAC\) for Song a/ }));
    await waitFor(() => expect(exportClickTrack).toHaveBeenCalledWith([piece()], 100, 'Song a-click.flac', 'flac', expect.any(AbortSignal)));
    expect(exportClickTrack).toHaveBeenCalledTimes(1);
  });

  it('a failed FLAC render shows its error instead of failing silently', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    vi.mocked(exportClickTrack).mockRejectedValueOnce(new Error('encoder failed to load'));
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Download compressed click track \(FLAC\) for Song a/ }));
    expect(await screen.findByText('encoder failed to load')).toBeInTheDocument();
  });

  it('a FLAC render that fails without a message falls back to "Could not create the FLAC"', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    vi.mocked(exportClickTrack).mockRejectedValueOnce('boom');
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Download compressed click track \(FLAC\) for Song a/ }));
    expect(await screen.findByText('Could not create the FLAC')).toBeInTheDocument();
  });

  it('passes the page\'s abort signal to the export, and aborts it when the page goes away', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    let finish!: (err: unknown) => void;
    vi.mocked(exportClickTrack).mockImplementationOnce(() => new Promise<void>((_, reject) => { finish = reject; }));
    const view = withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Download compressed click track \(FLAC\) for Song a/ }));
    await waitFor(() => expect(exportClickTrack).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(exportClickTrack).mock.calls[0]![4];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    view.unmount();
    expect(signal!.aborted).toBe(true);
    // the exporter rejects with the abort reason after unmount: nothing should blow up or warn about state updates
    finish(signal!.reason);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('Download renders a long track in full: there is no length cap', async () => {
    const long = piece({ repeats: 99, bpm: 60 }); // 396 s, over the old five-minute limit
    vi.mocked(getSongTrack).mockResolvedValue(okRead([long]));
    withTrack();
    await screen.findByText('Song a');
    const download = strip('Song a').getByRole('button', { name: /Download click track for Song a/ });
    expect(download).toBeEnabled();
    fireEvent.click(download);
    await waitFor(() => expect(exportClickTrack).toHaveBeenCalledWith([long], 100, 'Song a-click.wav', 'wav', expect.any(AbortSignal)));
    expect(screen.queryByText(/Too long to download/)).not.toBeInTheDocument();
  });

  it('shows a failed render instead of failing silently', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    vi.mocked(exportClickTrack).mockRejectedValueOnce(new Error('Array buffer allocation failed'));
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Download click track for Song a/ }));
    expect(await screen.findByText('Array buffer allocation failed')).toBeInTheDocument();
  });

  it('Open hands the track to the editor through sessionStorage and navigates there', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Open click track for Song a/ }));
    expect(await screen.findByText('Click track editor')).toBeInTheDocument();
    const handoff = JSON.parse(sessionStorage.getItem('band-to-click-import')!);
    expect(handoff).toMatchObject({ pieces: [piece()], groups: [], title: 'Song a' });
    expect(typeof handoff.at).toBe('number');
  });

  it('Open reports blocked browser storage and stays on the page', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Open click track for Song a/ }));
    expect(await screen.findByText(/browser storage is blocked/)).toBeInTheDocument();
    expect(screen.queryByText('Click track editor')).not.toBeInTheDocument();
    set.mockRestore();
  });

  it('an unreadable track says why, disables Play / Download / Open, and can still be removed', async () => {
    vi.mocked(getSongTrack).mockResolvedValue({ status: 'unreadable', reason: 'a segment has a bad tempo' });
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Play click track for Song a/ }));
    expect(await screen.findByText(/Can't be read \(a segment has a bad tempo\)/)).toBeInTheDocument();
    expect(engine.start).not.toHaveBeenCalled();
    for (const name of [/Play click track/, /Download click track/, /Open click track/]) {
      expect(strip('Song a').getByRole('button', { name })).toBeDisabled();
    }
    expect(strip('Song a').getByRole('button', { name: /Remove click track/ })).toBeEnabled();
  });

  it('a track from a newer app is flagged without fetching anything', async () => {
    withTrack({ format: 2 });
    await screen.findByText('Song a');
    expect(row('Song a')).toHaveTextContent(/newer version of the app/);
    expect(strip('Song a').getByRole('button', { name: /Play click track/ })).toBeDisabled();
    expect(getSongTrack).not.toHaveBeenCalled();
  });

  it('a track that vanished since the page loaded says so and refreshes the list', async () => {
    vi.mocked(getSongTrack).mockResolvedValue({ status: 'gone' });
    withTrack();
    await screen.findByText('Song a');
    expect(fetchSetListRows).toHaveBeenCalledTimes(1);
    // hold the refresh open so the message can be seen while it is "refreshing"
    vi.mocked(fetchSetListRows).mockImplementationOnce(() => new Promise(() => undefined));
    fireEvent.click(strip('Song a').getByRole('button', { name: /Open click track for Song a/ }));
    expect(await screen.findByText(/just changed or removed/)).toBeInTheDocument();
    await waitFor(() => expect(fetchSetListRows).toHaveBeenCalledTimes(2));
  });

  it('a read failure is shown, not swallowed', async () => {
    vi.mocked(getSongTrack).mockRejectedValue(new Error('network down'));
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Open click track for Song a/ }));
    expect(await screen.findByText('network down')).toBeInTheDocument();
  });

  it('plays what it fetched even if someone saved since, and quietly refreshes the list', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead([piece()], true));
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Play click track for Song a/ }));
    await waitFor(() => expect(engine.start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchSetListRows).toHaveBeenCalledTimes(2));
  });

  it('Remove asks first, then clears my own row (create path when I have none) and drops the strip at once', async () => {
    vi.mocked(clearSongTrack).mockResolvedValue(undefined);
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Remove click track for Song a/ }));
    expect(await screen.findByText(/Remove the click track for “Song a”\?/)).toBeInTheDocument();
    expect(clearSongTrack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(clearSongTrack).toHaveBeenCalledTimes(1));
    expect(clearSongTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', bandId: 'band-1', setListId: 'sl-1' }), false);
    await waitFor(() => expect(screen.queryByText(/Click track ·/)).not.toBeInTheDocument());
  });

  it('Remove updates my existing row when I already wrote one for the song', async () => {
    vi.mocked(clearSongTrack).mockResolvedValue(undefined);
    withTrack({ owner: ME });
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Remove click track for Song a/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(clearSongTrack).toHaveBeenCalledWith(expect.anything(), true));
  });

  it('a failed Remove keeps the strip and shows the failure in the dialog', async () => {
    vi.mocked(clearSongTrack).mockRejectedValue(new Error('Could not remove the click track. Please try again.'));
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Remove click track for Song a/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Could not remove the click track. Please try again.')).toBeInTheDocument();
    expect(row('Song a')).toHaveTextContent('Click track ·');
  });

  it('stops the click when the playing track is removed by someone else, instead of leaving it running with no Stop button', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Play click track for Song a/ }));
    await strip('Song a').findByRole('button', { name: /Stop click track/ });
    engine.stop.mockClear();

    // another member clears the track; the next refresh no longer lists it
    vi.mocked(fetchSetListRows).mockResolvedValue({
      songs: emptyPage([song('a', BOB, '2026-01-02T00:00:00Z'), song('b', ME, '2026-01-02T00:00:01Z')]),
      votes: emptyPage([vote('b', BOB, 'up')]),
      colors: emptyPage([]),
      clicks: emptyPage([meta('a', { bytes: 0, updatedAt: '2026-03-01T00:00:00Z' })]),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.queryByText(/Click track ·/)).not.toBeInTheDocument());
    expect(engine.stop).toHaveBeenCalled();
  });

  it('drops the "just changed, refreshing" message once the refreshed list has loaded', async () => {
    vi.mocked(getSongTrack).mockResolvedValue({ status: 'gone' });
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Open click track for Song a/ }));
    await screen.findByText(/just changed or removed/);
    await waitFor(() => expect(fetchSetListRows).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/just changed or removed/)).not.toBeInTheDocument());
  });

  it('fetches a song\'s payload once: Play, then Download of the same saved track reuse it', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Play click track for Song a/ }));
    await waitFor(() => expect(engine.start).toHaveBeenCalledTimes(1));
    await strip('Song a').findByRole('button', { name: /Stop click track/ });
    fireEvent.click(strip('Song a').getByRole('button', { name: /Download click track for Song a/ }));
    await waitFor(() => expect(exportClickTrack).toHaveBeenCalledTimes(1));
    expect(getSongTrack).toHaveBeenCalledTimes(1);
  });

  it('ignores a second click while the first is still fetching', async () => {
    let release!: (read: SongTrackRead) => void;
    vi.mocked(getSongTrack).mockReturnValue(new Promise<SongTrackRead>((resolve) => (release = resolve)));
    withTrack();
    await screen.findByText('Song a');
    const open = strip('Song a').getByRole('button', { name: /Open click track for Song a/ });
    fireEvent.click(open);
    fireEvent.click(open);
    release(okRead());
    await screen.findByText('Click track editor');
    expect(getSongTrack).toHaveBeenCalledTimes(1);
  });

  it('Download of a click-heavy track is not refused either', async () => {
    const pieces = Array.from({ length: 20 }, (_, i) => piece({ id: `p${i}`, subdivision: 'sixteenth', bpm: 300, repeats: 99 }));
    vi.mocked(getSongTrack).mockResolvedValue(okRead(pieces));
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Download click track for Song a/ }));
    await waitFor(() => expect(exportClickTrack).toHaveBeenCalledWith(pieces, 100, 'Song a-click.wav', 'wav', expect.any(AbortSignal)));
  });

  it('stops the engine when the page goes away', async () => {
    vi.mocked(getSongTrack).mockResolvedValue(okRead());
    withTrack();
    await screen.findByText('Song a');
    fireEvent.click(strip('Song a').getByRole('button', { name: /Play click track for Song a/ }));
    await waitFor(() => expect(engine.start).toHaveBeenCalled());
    const { unmount } = render(<div />);
    unmount();
    cleanupAll();
    expect(engine.destroy).toHaveBeenCalled();
  });
});

describe('add songs from another set list', () => {
  const twoLists = () => band({ setListIds: ['sl-1', 'sl-2'] });
  const twoListView = (over: Partial<BandView> = {}) =>
    makeView(
      {
        setLists: [
          { id: 'sl-1', owner: OWNER, bandId: 'band-1', name: 'Main Set', archivedAt: null },
          { id: 'sl-2', owner: OWNER, bandId: 'band-1', name: 'Old Gig', archivedAt: null },
        ] as unknown as ValidSetList[],
        ...over,
      },
      twoLists(),
    );
  const addButton = () => screen.getByRole('button', { name: /Add from another list/ });
  const three = () => [song('a', BOB, '2026-01-02T00:00:00Z'), song('b', ME, '2026-01-02T00:00:01Z'), song('c', ME, '2026-01-02T00:00:02Z')];

  it('is not shown when the band has no other set list', async () => {
    setup(makeView(), three(), []);
    await screen.findByText('Song a');
    expect(screen.queryByRole('button', { name: /Add from another list/ })).not.toBeInTheDocument();
  });

  it('is shown, and enabled, when the band has another set list', async () => {
    setup(twoListView(), three(), []);
    await screen.findByText('Song a');
    expect(addButton()).toBeEnabled();
  });

  it('is disabled while the owner reorders songs', async () => {
    setup(twoListView({ isOwner: true, sub: OWNER }), three(), []);
    await screen.findByText('Song a');
    fireEvent.click(screen.getByRole('button', { name: /Reorder/ }));
    expect(addButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(addButton()).toBeEnabled();
  });

  it('is disabled when the list is full', async () => {
    const full = Array.from({ length: BAND_LIMITS.maxSongsPerSetList }, (_, i) =>
      song(`n${i}`, BOB, `2026-01-02T00:00:${String(i % 60).padStart(2, '0')}Z`),
    );
    setup(twoListView(), full, []);
    await screen.findByText('Song n0');
    expect(addButton()).toBeDisabled();
  });

  it('is enabled one song below the cap', async () => {
    const almost = Array.from({ length: BAND_LIMITS.maxSongsPerSetList - 1 }, (_, i) => song(`n${i}`, BOB, '2026-01-02T00:00:00Z'));
    setup(twoListView(), almost, []);
    await screen.findByText('Song n0');
    expect(addButton()).toBeEnabled();
  });

  it('hints at adding from another list in the empty state only when one exists', async () => {
    setup(twoListView(), [], []);
    expect(await screen.findByText(/No songs yet\. Suggest the first one, or add some from another set list!/)).toBeInTheDocument();
    cleanupAll();
    setup(makeView(), [], []);
    expect(await screen.findByText('No songs yet. Suggest the first one!')).toBeInTheDocument();
  });

  const pickable = () => ({
    songs: [{ id: 'x1', owner: BOB, bandId: 'band-1', setListId: 'sl-2', title: 'Imported Tune', artist: null, key: null, tuning: null, bpm: null, notes: null, songUrl: null, tabUrl: null }] as unknown as ValidSong[],
    incomplete: false,
  });

  it('copies the ticked song onto this list with the current song count, then reloads', async () => {
    const view = twoListView();
    vi.mocked(loadMemberBandView).mockResolvedValue(view);
    vi.mocked(fetchSongChoices).mockResolvedValue(pickable());
    vi.mocked(addSongsFromOtherLists).mockResolvedValue(undefined);
    setup(view, three(), []);
    await screen.findByText('Song a');
    fireEvent.click(addButton());
    const tick = await screen.findByRole('checkbox', { name: /Imported Tune/ });
    fireEvent.click(tick);
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 song' }));
    await waitFor(() => expect(addSongsFromOtherLists).toHaveBeenCalledTimes(1));
    const [passedView, setListId, picked, count] = vi.mocked(addSongsFromOtherLists).mock.calls[0];
    expect(passedView.band.id).toBe('band-1');
    expect(setListId).toBe('sl-1');
    expect(picked.map((s) => s.id)).toEqual(['x1']);
    expect(count).toBe(3);
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('still reloads when the copy fails part-way, and keeps the dialog open with the message', async () => {
    const view = twoListView();
    vi.mocked(loadMemberBandView).mockResolvedValue(view);
    vi.mocked(fetchSongChoices).mockResolvedValue(pickable());
    vi.mocked(addSongsFromOtherLists).mockRejectedValue(new Error('Added 0 of 1 songs. write failed'));
    setup(view, three(), []);
    await screen.findByText('Song a');
    fireEvent.click(addButton());
    fireEvent.click(await screen.findByRole('checkbox', { name: /Imported Tune/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 song' }));
    expect(await screen.findByText('Added 0 of 1 songs. write failed')).toBeInTheDocument();
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('SetListPage backing tracks', () => {
  const trackId = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const backingRow = (n: number, songId: string, over: Partial<BackingTrackRecord> = {}): BackingTrackRecord => {
    const owner = over.owner ?? BOB;
    return {
      id: trackId(n),
      owner,
      bandId: 'band-1',
      setListId: 'sl-1',
      songId,
      label: `Track ${n}`,
      forTags: [],
      key: committedKey({ sub: owner, bandId: 'band-1', songId, trackId: trackId(n), ext: 'mp3' }),
      contentType: 'audio/mpeg',
      bytes: 480 * 1024,
      format: 1,
      createdAt: `2026-02-01T00:00:0${n}Z`,
      updatedAt: '2026-02-01T00:00:00Z',
      ...over,
    };
  };
  const songs = () => [song('a', BOB, '2026-01-02T00:00:00Z'), song('b', ME, '2026-01-02T00:00:01Z')];
  const withBacking = (items: BackingTrackRecord[], view: BandView = makeView(), incomplete = false) =>
    setup(view, songs(), [], [], [], [], { items, incomplete });

  beforeEach(() => {
    vi.mocked(isBackingTracksReady).mockReturnValue(true);
    vi.mocked(areBackingTrackUploadsOn).mockReturnValue(true);
    vi.mocked(addBackingTrack).mockResolvedValue(undefined);
    vi.mocked(editBackingTrack).mockResolvedValue(undefined);
    vi.mocked(removeBackingTracks).mockResolvedValue(undefined);
  });

  const panelToggle = (song: string, count: number) =>
    within(row(`Song ${song}`)).getByRole('button', { name: `Backing tracks for Song ${song} (${count})` });
  const openPanel = async (song: string, count: number) => {
    fireEvent.click(panelToggle(song, count));
    await within(row(`Song ${song}`)).findByRole('list');
  };

  describe('uploads switched off on the backend', () => {
    beforeEach(() => {
      vi.mocked(areBackingTrackUploadsOn).mockReturnValue(false);
    });

    it('still shows and plays the tracks that exist, but offers no Add button', async () => {
      withBacking([backingRow(1, 'a')]);
      await screen.findByText('Song a');
      await openPanel('a', 1);
      expect(within(row('Song a')).getByText('Track 1')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add a backing track/ })).not.toBeInTheDocument();
    });

    it('shows nothing at all on a song with no tracks, instead of an Add button that cannot work', async () => {
      withBacking([backingRow(1, 'a')]);
      await screen.findByText('Song b');
      expect(within(row('Song b')).queryByRole('button', { name: /Backing tracks for/ })).not.toBeInTheDocument();
    });
  });

  describe('visibility', () => {
    it('renders nothing when the backend or storage is not ready, even if rows exist', async () => {
      vi.mocked(isBackingTracksReady).mockReturnValue(false);
      withBacking([backingRow(1, 'a')]);
      await screen.findByText('Song a');
      expect(screen.queryByRole('button', { name: /Backing tracks for/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add a backing track/ })).not.toBeInTheDocument();
    });

    it('shows each song a collapsed panel with the count and an Add button for a member', async () => {
      withBacking([backingRow(1, 'a'), backingRow(2, 'a')]);
      await screen.findByText('Song a');
      expect(panelToggle('a', 2)).toHaveAttribute('aria-expanded', 'false');
      expect(panelToggle('b', 0)).toBeInTheDocument();
      expect(within(row('Song a')).getByRole('button', { name: 'Add a backing track to Song a' })).toBeEnabled();
      expect(within(row('Song b')).getByRole('button', { name: 'Add a backing track to Song b' })).toBeEnabled();
    });

    it('lists the tracks with their author when expanded', async () => {
      withBacking([backingRow(1, 'a', { label: 'No drums', forTags: ['drums'] })]);
      await screen.findByText('Song a');
      await openPanel('a', 1);
      const item = within(row('Song a')).getByRole('listitem');
      expect(item).toHaveTextContent('No drums');
      expect(item).toHaveTextContent('by Bob');
      expect(item).toHaveTextContent('MP3 480 KB');
    });

    it('hides tracks of a banned or non-member author', async () => {
      withBacking([backingRow(1, 'a', { owner: 'sub-mallory' }), backingRow(2, 'a')]);
      await screen.findByText('Song a');
      expect(panelToggle('a', 1)).toBeInTheDocument();
    });

    it('a non-member never reaches the panels (the page asks them to join first)', async () => {
      withBacking([backingRow(1, 'a')], makeView({ isMember: false }));
      expect(await screen.findByText('Join this band to see its set lists')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Backing tracks for/ })).not.toBeInTheDocument();
    });

    it('warns that the list may be partial when the backing track read was incomplete', async () => {
      withBacking([], makeView(), true);
      expect(await screen.findByText(/backing tracks may be missing/)).toBeInTheDocument();
    });
  });

  describe('adding', () => {
    const file = () => new File(['audio'], 'no_drums.mp3', { type: 'audio/mpeg' });
    async function openAdd(songTitle = 'Song a') {
      fireEvent.click(within(row(songTitle)).getByRole('button', { name: `Add a backing track to ${songTitle}` }));
      return screen.findByRole('heading', { name: 'Add a backing track' });
    }
    const submitAdd = async () => {
      fireEvent.change(screen.getByLabelText('Audio file'), { target: { files: [file()] } });
      fireEvent.click(screen.getByRole('button', { name: 'Add track' }));
    };

    it('opens the add dialog for the right song, with no network call yet', async () => {
      withBacking([]);
      await screen.findByText('Song a');
      await openAdd('Song b');
      expect(screen.getByText(/For “Song b”/)).toBeInTheDocument();
      expect(addBackingTrack).not.toHaveBeenCalled();
    });

    it('uploads for that song with the cleaned name, then reloads the list and closes', async () => {
      withBacking([]);
      await screen.findByText('Song a');
      await openAdd();
      await submitAdd();
      await waitFor(() => expect(addBackingTrack).toHaveBeenCalledTimes(1));
      const arg = vi.mocked(addBackingTrack).mock.calls[0][0];
      expect(arg.song).toEqual(expect.objectContaining({ id: 'a', bandId: 'band-1' }));
      expect(arg.file.name).toBe('no_drums.mp3');
      expect(arg.label).toBe('no drums');
      expect(arg.tags).toEqual([]);
      expect(typeof arg.onProgress).toBe('function');
      expect(arg.signal).toBeInstanceOf(AbortSignal);
      await waitFor(() => expect(fetchSetListRows).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Add a backing track' })).not.toBeInTheDocument());
    });

    // The catch-up read a moment later is covered with fake timers in hooks/useBackingTrackSection.test.tsx.

    it('reloads even when the upload fails (the file may have landed), and keeps the dialog with the message', async () => {
      vi.mocked(addBackingTrack).mockRejectedValue(new Error('The connection dropped. Check it and try again.'));
      withBacking([]);
      await screen.findByText('Song a');
      await openAdd();
      await submitAdd();
      expect(await screen.findByRole('alert')).toHaveTextContent('The connection dropped. Check it and try again.');
      await waitFor(() => expect(fetchSetListRows).toHaveBeenCalledTimes(2));
      expect(screen.getByRole('heading', { name: 'Add a backing track' })).toBeInTheDocument();
    });

    it('passes the progress callback through so the dialog can show it', async () => {
      let report!: (fraction: number) => void;
      let finish!: () => void;
      vi.mocked(addBackingTrack).mockImplementation(async ({ onProgress }) => {
        report = onProgress!;
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      });
      withBacking([]);
      await screen.findByText('Song a');
      await openAdd();
      await submitAdd();
      await screen.findByText('Uploading… 0%');
      report(0.5);
      expect(await screen.findByText('Uploading… 50%')).toBeInTheDocument();
      finish();
    });

    it('is disabled for a song that already has 10 tracks', async () => {
      withBacking(Array.from({ length: 10 }, (_, i) => backingRow(i, 'a')));
      await screen.findByText('Song a');
      expect(within(row('Song a')).getByRole('button', { name: 'Add a backing track to Song a' })).toBeDisabled();
      expect(within(row('Song b')).getByRole('button', { name: 'Add a backing track to Song b' })).toBeEnabled();
    });
  });

  describe('editing', () => {
    it('Edit opens the dialog prefilled, saves through the hook and reloads', async () => {
      withBacking([backingRow(1, 'b', { owner: ME, label: 'Click only', forTags: ['guitar'] })]);
      await screen.findByText('Song b');
      await openPanel('b', 1);
      fireEvent.click(within(row('Song b')).getByRole('button', { name: 'Edit Click only' }));
      expect(await screen.findByRole('heading', { name: 'Edit backing track' })).toBeInTheDocument();
      expect(screen.getByLabelText('Name')).toHaveValue('Click only');
      expect(screen.getByRole('button', { name: 'Guitar' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Click + guide' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(editBackingTrack).toHaveBeenCalledWith(trackId(1), 'Click + guide', ['guitar']));
      await waitFor(() => expect(fetchSetListRows).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit backing track' })).not.toBeInTheDocument());
    });

    it('a failed edit shows the message, still reloads and keeps the dialog', async () => {
      vi.mocked(editBackingTrack).mockRejectedValue(new Error("You can't change that track."));
      withBacking([backingRow(1, 'b', { owner: ME })]);
      await screen.findByText('Song b');
      await openPanel('b', 1);
      fireEvent.click(within(row('Song b')).getByRole('button', { name: 'Edit Track 1' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('alert')).toHaveTextContent("You can't change that track.");
      await waitFor(() => expect(fetchSetListRows).toHaveBeenCalledTimes(2));
    });

    it('does not offer Edit on someone else\'s track, even to the band owner', async () => {
      withBacking([backingRow(1, 'a')], makeView({ isOwner: true, sub: OWNER }));
      await screen.findByText('Song a');
      await openPanel('a', 1);
      expect(within(row('Song a')).queryByRole('button', { name: /^Edit Track/ })).not.toBeInTheDocument();
    });
  });

  describe('removing', () => {
    const removeButton = (title: string, label: string) => within(row(title)).getByRole('button', { name: `Remove ${label}` });

    it('confirms first, for your own track says the file goes for everyone, then removes and reloads', async () => {
      withBacking([backingRow(1, 'b', { owner: ME, label: 'Mine' })]);
      await screen.findByText('Song b');
      await openPanel('b', 1);
      fireEvent.click(removeButton('Song b', 'Mine'));
      expect(await screen.findByText('Remove “Mine”?')).toBeInTheDocument();
      expect(screen.getByText('The audio file is deleted for everyone in the band.')).toBeInTheDocument();
      expect(removeBackingTracks).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(removeBackingTracks).toHaveBeenCalledWith([trackId(1)]));
      await waitFor(() => expect(fetchSetListRows).toHaveBeenCalledTimes(2));
    });

    it('for someone else\'s track (band owner) names who added it', async () => {
      withBacking([backingRow(1, 'a', { owner: BOB, label: 'Bob\'s mix' })], makeView({ isOwner: true, sub: OWNER }));
      await screen.findByText('Song a');
      await openPanel('a', 1);
      fireEvent.click(removeButton('Song a', 'Bob\'s mix'));
      expect(await screen.findByText('The audio file Bob added is deleted for everyone in the band.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(removeBackingTracks).toHaveBeenCalledWith([trackId(1)]));
    });

    it('Cancel removes nothing', async () => {
      withBacking([backingRow(1, 'b', { owner: ME })]);
      await screen.findByText('Song b');
      await openPanel('b', 1);
      fireEvent.click(removeButton('Song b', 'Track 1'));
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
      expect(removeBackingTracks).not.toHaveBeenCalled();
    });

    it('a failed removal shows the message in the dialog and still reloads', async () => {
      vi.mocked(removeBackingTracks).mockRejectedValue(new Error("That didn't go through. Please try again in a moment."));
      withBacking([backingRow(1, 'b', { owner: ME })]);
      await screen.findByText('Song b');
      await openPanel('b', 1);
      fireEvent.click(removeButton('Song b', 'Track 1'));
      fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
      expect(await screen.findByText("That didn't go through. Please try again in a moment.")).toBeInTheDocument();
      await waitFor(() => expect(fetchSetListRows).toHaveBeenCalledTimes(2));
    });

    it('a plain member cannot remove someone else\'s track', async () => {
      withBacking([backingRow(1, 'a')]);
      await screen.findByText('Song a');
      await openPanel('a', 1);
      expect(within(row('Song a')).queryByRole('button', { name: /^Remove Track/ })).not.toBeInTheDocument();
    });
  });

  describe('deleting a song', () => {
    it('warns that its backing tracks (including other members\') go with it', async () => {
      withBacking([backingRow(1, 'b', { owner: BOB })]);
      await screen.findByText('Song b');
      fireEvent.click(within(row('Song b')).getByRole('button', { name: 'Delete Song b' }));
      expect(
        await screen.findByText('The song and its votes disappear from the set list, and so do the backing tracks attached to it (including other members’).'),
      ).toBeInTheDocument();
    });

    it('keeps the short description for a song with no backing tracks', async () => {
      withBacking([backingRow(1, 'a')]);
      await screen.findByText('Song b');
      fireEvent.click(within(row('Song b')).getByRole('button', { name: 'Delete Song b' }));
      expect(await screen.findByText('The song and its votes disappear from the set list.')).toBeInTheDocument();
    });

    it('still warns when the feature is switched off but the song has tracks (their files go too)', async () => {
      vi.mocked(isBackingTracksReady).mockReturnValue(false);
      withBacking([backingRow(1, 'b')]);
      await screen.findByText('Song b');
      fireEvent.click(within(row('Song b')).getByRole('button', { name: 'Delete Song b' }));
      expect(await screen.findByText(/so do the backing tracks attached to it/)).toBeInTheDocument();
    });
  });

  describe('playing and downloading', () => {
    class FakeAudio {
      src = '';
      currentTime = 0;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pause = vi.fn();
      play = vi.fn(() => Promise.resolve());
      onplaying: (() => void) | null = null;
      removeAttribute = vi.fn();
      load = vi.fn();
    }
    beforeEach(() => {
      vi.stubGlobal('Audio', FakeAudio);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('Play fetches the link for that track and flips to Stop', async () => {
      vi.mocked(getBackingTrackUrl).mockResolvedValue('https://signed.example/1');
      withBacking([backingRow(1, 'a', { label: 'No drums' })]);
      await screen.findByText('Song a');
      await openPanel('a', 1);
      fireEvent.click(within(row('Song a')).getByRole('button', { name: 'Play No drums' }));
      expect(await within(row('Song a')).findByRole('button', { name: 'Stop No drums' })).toBeInTheDocument();
      expect(getBackingTrackUrl).toHaveBeenCalledWith(expect.objectContaining({ id: trackId(1), key: expect.stringContaining('bt/') }));
    });

    it('a failed Play shows the message above the list', async () => {
      vi.mocked(getBackingTrackUrl).mockRejectedValue(new Error("That file isn't available. It may have been removed."));
      withBacking([backingRow(1, 'a', { label: 'No drums' })]);
      await screen.findByText('Song a');
      await openPanel('a', 1);
      fireEvent.click(within(row('Song a')).getByRole('button', { name: 'Play No drums' }));
      expect(await screen.findByRole('alert')).toHaveTextContent("That file isn't available. It may have been removed.");
      expect(within(row('Song a')).getByRole('button', { name: 'Play No drums' })).toBeEnabled();
    });

    it('Download asks for an attachment link', async () => {
      vi.mocked(getBackingTrackUrl).mockResolvedValue('https://signed.example/dl');
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      withBacking([backingRow(1, 'a', { label: 'No drums' })]);
      await screen.findByText('Song a');
      await openPanel('a', 1);
      fireEvent.click(within(row('Song a')).getByRole('button', { name: 'Download No drums' }));
      await waitFor(() => expect(getBackingTrackUrl).toHaveBeenCalledWith(expect.objectContaining({ id: trackId(1) }), { download: true }));
    });
  });
});
