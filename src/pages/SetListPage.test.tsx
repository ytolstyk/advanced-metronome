import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { BandRecord, BandView, SongRecord, VoteRecord, ValidMember, ValidSetList } from '../bandTypes';

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: 'authenticated' }),
  Authenticator: () => null,
}));
vi.mock('aws-amplify/data', () => ({ generateClient: vi.fn(() => ({ models: {}, graphql: vi.fn() })) }));
vi.mock('../api/bandsApi', () => ({
  loadBandView: vi.fn(),
  hideSong: vi.fn(),
  unhideSong: vi.fn(),
}));
vi.mock('../api/songVotesApi', () => ({ castVote: vi.fn() }));
vi.mock('../api/setListsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/setListsApi')>()),
  fetchSetListRows: vi.fn(),
  suggestSong: vi.fn(),
  updateSong: vi.fn(),
  deleteSong: vi.fn(),
}));

import { SetListPage } from './SetListPage';
import { hideSong, loadBandView, unhideSong } from '../api/bandsApi';
import { deleteSong, fetchSetListRows, suggestSong } from '../api/setListsApi';
import { castVote } from '../api/songVotesApi';

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

function setup(view: BandView = makeView(), songs = [song('a', BOB, '2026-01-02T00:00:00Z'), song('b', ME, '2026-01-02T00:00:01Z')], votes = [vote('b', BOB, 'up')]) {
  vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view });
  vi.mocked(fetchSetListRows).mockResolvedValue({ songs: emptyPage(songs), votes: emptyPage(votes) });
  return render(
    <MemoryRouter initialEntries={['/bands/band-1/setlists/sl-1']}>
      <Routes>
        <Route path="/bands/:bandId/setlists/:setListId" element={<SetListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const row = (title: string) => screen.getByText(title).closest('li') as HTMLElement;
const score = (title: string) => within(row(title)).getByLabelText(/^Score/);

beforeEach(() => {
  vi.clearAllMocks();
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

  it('shows an empty state with a prompt', async () => {
    setup(makeView(), [], []);
    expect(await screen.findByText('No songs yet. Suggest the first one!')).toBeInTheDocument();
  });

  it('warns when the member roster was too long to load (members, songs or votes may be missing)', async () => {
    setup(makeView({ incomplete: true }));
    await screen.findByText('Song a');
    expect(screen.getByText(/some members, songs or votes may be missing/)).toBeInTheDocument();
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
});
