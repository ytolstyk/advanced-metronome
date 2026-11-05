import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { TrackPiece } from '@/audio/ClickTrackEngine';
import type { BandRecord, BandView, MyBandEntry, ValidSetList, ValidSong } from '@/bandTypes';
import type { SongTargets } from '@/bandViews';

// `loadMemberBandView` is the member-only wrapper the dialog calls; it is built on the mocked `loadBandView`
// with the same rule as the real one, so these tests keep driving the band through `loadBandView`.
vi.mock('@/api/bandsApi', () => {
  const loadBandView = vi.fn<(bandId: string) => Promise<{ status: string; view?: { isMember: boolean } }>>();
  return {
    loadMyBands: vi.fn(),
    loadBandView,
    loadMemberBandView: async (bandId: string) => {
      const result = await loadBandView(bandId);
      return result.status === 'ok' && result.view?.isMember ? result.view : 'unavailable';
    },
  };
});
vi.mock('@/api/setListsApi', () => ({ fetchSongTargets: vi.fn() }));
vi.mock('@/api/songTracksApi', () => ({ saveSongTrack: vi.fn() }));

import { SaveToBandDialog } from './SaveToBandDialog';
import { loadBandView, loadMyBands } from '@/api/bandsApi';
import { fetchSongTargets } from '@/api/setListsApi';
import { saveSongTrack } from '@/api/songTracksApi';

// Radix Select leans on pointer-capture and scrolling APIs jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

const ME = 'sub-me';
const BOB = 'sub-bob';

const band = (id: string, name: string): BandRecord =>
  ({ id, owner: 'sub-owner', name, inviteCode: 'ABCDEFGHJK', deletedAt: null, version: 1, setListIds: ['sl-1'], archivedSetListIds: [], bannedSubs: [], hiddenSongIds: [], sharedSetListIds: [], uploaderSubs: [], inviteTtlDays: 1 }) as BandRecord;
const entry = (id: string, name: string, status: MyBandEntry['status'] = 'active'): MyBandEntry => ({ band: band(id, name), status, isOwner: false });

const setLists = [{ id: 'sl-1', owner: 'sub-owner', bandId: 'band-1', name: 'Main Set', archivedAt: null }] as unknown as ValidSetList[];
const view = (over: Partial<BandView> = {}): BandView =>
  ({
    band: band('band-1', 'The Band'),
    sub: ME,
    isOwner: false,
    isMember: true,
    canUpload: true,
    members: [],
    memberSubs: new Set([ME, BOB]),
    displayNames: new Map([[ME, 'Me'], [BOB, 'Bob']]),
    setLists,
    removedMembers: [],
    incomplete: false,
    ...over,
  }) as BandView;

const song = (id: string, title: string) =>
  ({ id, owner: BOB, bandId: 'band-1', setListId: 'sl-1', title, artist: null, key: null, tuning: null, bpm: null, notes: null, songUrl: null, tabUrl: null }) as unknown as ValidSong;
const targets = (over: Partial<SongTargets> = {}): SongTargets => ({
  songs: [song('s1', 'Black Dog'), song('s2', 'Kashmir')],
  tracks: new Map(),
  myTrackSongIds: new Set(),
  incomplete: false,
  ...over,
});

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

function setup(pieces: TrackPiece[] = [piece()]) {
  const onOpenChange = vi.fn();
  render(
    <MemoryRouter>
      <SaveToBandDialog open onOpenChange={onOpenChange} pieces={pieces} groups={[]} />
    </MemoryRouter>,
  );
  return { onOpenChange, user: userEvent.setup() };
}

type User = ReturnType<typeof userEvent.setup>;
async function choose(user: User, label: string, option: string | RegExp) {
  await user.click(await screen.findByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadMyBands).mockResolvedValue({ entries: [entry('band-1', 'The Band'), entry('band-2', 'Other Band')], failedCount: 0, deadBandIds: [] });
  vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view: view() });
  vi.mocked(fetchSongTargets).mockResolvedValue(targets());
  vi.mocked(saveSongTrack).mockResolvedValue(undefined);
});

describe('SaveToBandDialog', () => {
  it('walks band -> set list -> song and attaches the track to the chosen song', async () => {
    const { user } = setup();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await choose(user, 'Band', 'The Band');
    expect(loadBandView).toHaveBeenCalledWith('band-1');
    await choose(user, 'Set list', 'Main Set');
    expect(fetchSongTargets).toHaveBeenCalledWith(expect.objectContaining({ sub: ME }), 'sl-1');
    await choose(user, 'Song', 'Kashmir');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveSongTrack).toHaveBeenCalledTimes(1));
    const [bandView, target, pieces, groups, exists] = vi.mocked(saveSongTrack).mock.calls[0]!;
    expect(bandView.band.id).toBe('band-1');
    expect(target).toMatchObject({ id: 's2', title: 'Kashmir' });
    expect(pieces).toEqual([piece()]);
    expect(groups).toEqual([]);
    expect(exists).toBe(false);

    expect(await screen.findByText(/Saved to “Kashmir”/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the set list' })).toHaveAttribute('href', '/bands/band-1/setlists/sl-1');
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument(); // the footer now offers Close
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('lists only bands the person is still in', async () => {
    vi.mocked(loadMyBands).mockResolvedValue({ entries: [entry('band-1', 'The Band'), entry('band-2', 'Kicked Band', 'removed')], failedCount: 0, deadBandIds: [] });
    const { user } = setup();
    await user.click(await screen.findByRole('combobox', { name: 'Band' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['The Band']);
  });

  it('points to the Bands page when the person is in no band', async () => {
    vi.mocked(loadMyBands).mockResolvedValue({ entries: [], failedCount: 0, deadBandIds: [] });
    setup();
    expect(await screen.findByText(/not in a band yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create or join one' })).toHaveAttribute('href', '/bands');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('says when some bands could not be loaded, and when the list read fails outright', async () => {
    vi.mocked(loadMyBands).mockResolvedValue({ entries: [entry('band-1', 'The Band')], failedCount: 2, deadBandIds: [] });
    setup();
    expect(await screen.findByText(/Some of your bands couldn’t be loaded/)).toBeInTheDocument();
  });

  it('shows a failure to read the bands', async () => {
    vi.mocked(loadMyBands).mockRejectedValue(new Error('network down'));
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('refuses a band the person cannot write to', async () => {
    vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view: view({ isMember: false }) });
    const { user } = setup();
    await choose(user, 'Band', 'The Band');
    expect(await screen.findByText(/can’t add to this band right now/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Set list' })).not.toBeInTheDocument();
  });

  it('explains a band with no set lists and a set list with no songs', async () => {
    vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view: view({ setLists: [] }) });
    const { user } = setup();
    await choose(user, 'Band', 'The Band');
    expect(await screen.findByText(/no set lists yet/)).toBeInTheDocument();
  });

  it('explains a set list with no songs', async () => {
    vi.mocked(fetchSongTargets).mockResolvedValue(targets({ songs: [] }));
    const { user } = setup();
    await choose(user, 'Band', 'The Band');
    await choose(user, 'Set list', 'Main Set');
    expect(await screen.findByText(/no songs yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Suggest one' })).toHaveAttribute('href', '/bands/band-1/setlists/sl-1');
  });

  it('marks songs that already have a track and says who the new one replaces', async () => {
    vi.mocked(fetchSongTargets).mockResolvedValue(
      targets({ tracks: new Map([['s1', { owner: BOB, format: 1, bytes: 300, stamp: '2026-02-01T00:00:00Z' }]]) }),
    );
    const { user } = setup();
    await choose(user, 'Band', 'The Band');
    await choose(user, 'Set list', 'Main Set');
    await choose(user, 'Song', /Black Dog \(has a click track\)/);

    expect(screen.getByRole('status')).toHaveTextContent('This replaces Bob’s click track for everyone in the band.');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    await waitFor(() => expect(saveSongTrack).toHaveBeenCalledTimes(1));
  });

  it('updates my own row when I already wrote one for the song', async () => {
    vi.mocked(fetchSongTargets).mockResolvedValue(
      targets({
        tracks: new Map([['s1', { owner: ME, format: 1, bytes: 300, stamp: 's' }]]),
        myTrackSongIds: new Set(['s1']),
      }),
    );
    const { user } = setup();
    await choose(user, 'Band', 'The Band');
    await choose(user, 'Set list', 'Main Set');
    await choose(user, 'Song', /Black Dog/);
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    await waitFor(() => expect(saveSongTrack).toHaveBeenCalled());
    expect(vi.mocked(saveSongTrack).mock.calls[0]![4]).toBe(true);
  });

  it('warns when the set list was too long to load completely', async () => {
    vi.mocked(fetchSongTargets).mockResolvedValue(targets({ incomplete: true }));
    const { user } = setup();
    await choose(user, 'Band', 'The Band');
    await choose(user, 'Set list', 'Main Set');
    expect(await screen.findByText(/too long to load completely/)).toBeInTheDocument();
  });

  it('shows a failed save and lets the person try again', async () => {
    vi.mocked(saveSongTrack).mockRejectedValueOnce(new Error('Could not save the click track. Please try again.'));
    const { user } = setup();
    await choose(user, 'Band', 'The Band');
    await choose(user, 'Set list', 'Main Set');
    await choose(user, 'Song', 'Kashmir');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Could not save the click track. Please try again.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Saved to “Kashmir”/)).toBeInTheDocument();
  });

  it('explains a track over a limit up front and offers no Save', async () => {
    const tooMany = Array.from({ length: 400 }, (_, i) => piece({ id: `p${i}`, repeats: 1 }));
    setup(tooMany);
    expect(await screen.findByRole('alert')).toHaveTextContent(/hold up to \d+ segments; this one has 400/);
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('tells the person what is and is not saved', async () => {
    setup();
    expect(await screen.findByText(/saved at 100% speed, without count-in or loop/i)).toBeInTheDocument();
  });

  it('forgets the picks when closed', async () => {
    const { user, onOpenChange } = setup();
    await choose(user, 'Band', 'The Band');
    expect(await screen.findByRole('combobox', { name: 'Set list' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // (the parent here keeps it open) the band pick is gone, so the set list step is too
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Set list' })).not.toBeInTheDocument());
  });

  it('forgets a save that finishes after the dialog was closed and reopened', async () => {
    let finish!: () => void;
    vi.mocked(saveSongTrack).mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <MemoryRouter>
          <button onClick={() => setOpen(true)}>reopen</button>
          <SaveToBandDialog open={open} onOpenChange={setOpen} pieces={[piece()]} groups={[]} />
        </MemoryRouter>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    await choose(user, 'Band', 'The Band');
    await choose(user, 'Set list', 'Main Set');
    await choose(user, 'Song', 'Kashmir');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' })); // closes while the save is in flight
    await user.click(screen.getByRole('button', { name: 'reopen' }));
    finish();
    // back at the first step: no "Saved" panel from the earlier save, and nothing is pre-selected
    expect(await screen.findByRole('combobox', { name: 'Band' })).toHaveTextContent('Choose a band');
    expect(screen.queryByText(/Saved to/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Set list' })).not.toBeInTheDocument();
  });

  it('reloads the bands each time it is opened rather than showing the previous session\'s answer', async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <MemoryRouter>
          <button onClick={() => setOpen(true)}>reopen</button>
          <SaveToBandDialog open={open} onOpenChange={setOpen} pieces={[piece()]} groups={[]} />
        </MemoryRouter>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole('combobox', { name: 'Band' });
    expect(loadMyBands).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'reopen' }));
    await screen.findByRole('combobox', { name: 'Band' });
    expect(loadMyBands).toHaveBeenCalledTimes(2);
  });
});

describe('SaveToBandDialog pre-selection of a sole option', () => {
  const soleBand = () =>
    vi.mocked(loadMyBands).mockResolvedValue({ entries: [entry('band-1', 'The Band')], failedCount: 0, deadBandIds: [] });
  const soleSong = () => vi.mocked(fetchSongTargets).mockResolvedValue(targets({ songs: [song('s1', 'Black Dog')] }));
  const secondSetList = { id: 'sl-2', owner: 'sub-owner', bandId: 'band-1', name: 'Encore', archivedAt: null } as unknown as ValidSetList;

  it('picks the only band, then its only set list, then its only song, and enables Save without any clicks', async () => {
    soleBand();
    soleSong();
    const { user } = setup();

    expect(await screen.findByRole('combobox', { name: 'Band' })).toHaveTextContent('The Band');
    expect(await screen.findByRole('combobox', { name: 'Set list' })).toHaveTextContent('Main Set');
    expect(await screen.findByRole('combobox', { name: 'Song' })).toHaveTextContent('Black Dog');
    expect(loadBandView).toHaveBeenCalledWith('band-1');
    expect(fetchSongTargets).toHaveBeenCalledWith(expect.objectContaining({ sub: ME }), 'sl-1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveSongTrack).toHaveBeenCalledTimes(1));
    const [bandView, target, , , exists] = vi.mocked(saveSongTrack).mock.calls[0]!;
    expect(bandView.band.id).toBe('band-1');
    expect(target).toMatchObject({ id: 's1', title: 'Black Dog' });
    expect(exists).toBe(false);
    expect(await screen.findByText(/Saved to “Black Dog”/)).toBeInTheDocument();
  });

  it('warns about replacing a track when the pre-selected song already has one', async () => {
    soleBand();
    vi.mocked(fetchSongTargets).mockResolvedValue(
      targets({ songs: [song('s1', 'Black Dog')], tracks: new Map([['s1', { owner: BOB, format: 1, bytes: 300, stamp: 's' }]]) }),
    );
    setup();
    expect(await screen.findByRole('status')).toHaveTextContent('This replaces Bob’s click track');
    expect(await screen.findByRole('button', { name: 'Replace' })).toBeEnabled();
  });

  it('does not pick a band when there are two', async () => {
    setup(); // default fixture: two active bands
    expect(await screen.findByRole('combobox', { name: 'Band' })).toHaveTextContent('Choose a band');
    expect(loadBandView).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox', { name: 'Set list' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('does not pick a set list when there are two, but still picks the band', async () => {
    soleBand();
    vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view: view({ setLists: [...setLists, secondSetList] }) });
    setup();
    expect(await screen.findByRole('combobox', { name: 'Band' })).toHaveTextContent('The Band');
    expect(await screen.findByRole('combobox', { name: 'Set list' })).toHaveTextContent('Choose a set list');
    expect(fetchSongTargets).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox', { name: 'Song' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('does not pick a set list when the band lists two ids but only one loaded', async () => {
    soleBand();
    const bandRow = { ...band('band-1', 'The Band'), setListIds: ['sl-1', 'sl-2'] };
    vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view: view({ band: bandRow }) }); // sl-2 failed to load
    setup();
    expect(await screen.findByRole('combobox', { name: 'Set list' })).toHaveTextContent('Choose a set list');
    expect(fetchSongTargets).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('picks the only set list when the other one the band lists is archived', async () => {
    soleBand();
    const bandRow = { ...band('band-1', 'The Band'), setListIds: ['sl-1', 'sl-2'], archivedSetListIds: ['sl-2'] };
    vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view: view({ band: bandRow }) });
    setup();
    expect(await screen.findByRole('combobox', { name: 'Set list' })).toHaveTextContent('Main Set');
    await waitFor(() => expect(fetchSongTargets).toHaveBeenCalledWith(expect.anything(), 'sl-1'));
  });

  it('applies the sole-option fallback again below a band the person switches to', async () => {
    const setListFor = (id: string, name: string, bandId: string) =>
      ({ id, owner: 'sub-owner', bandId, name, archivedSetListIds: [], archivedAt: null }) as unknown as ValidSetList;
    vi.mocked(loadBandView).mockImplementation(async (id: string) =>
      id === 'band-2'
        ? { status: 'ok', view: view({ band: { ...band('band-2', 'Other Band'), setListIds: ['sl-b'] }, setLists: [setListFor('sl-b', 'Other Set', 'band-2')] }) }
        : { status: 'ok', view: view() },
    );
    vi.mocked(fetchSongTargets).mockImplementation(async (_view, id) =>
      targets({ songs: [id === 'sl-b' ? song('x1', 'Other Song') : song('s1', 'Black Dog')] }),
    );
    const { user } = setup();
    await choose(user, 'Band', 'The Band');
    expect(await screen.findByRole('combobox', { name: 'Song' })).toHaveTextContent('Black Dog');

    await choose(user, 'Band', 'Other Band');
    expect(await screen.findByRole('combobox', { name: 'Set list' })).toHaveTextContent('Other Set');
    expect(await screen.findByRole('combobox', { name: 'Song' })).toHaveTextContent('Other Song');
    expect(fetchSongTargets).toHaveBeenLastCalledWith(expect.anything(), 'sl-b');
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveSongTrack).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveSongTrack).mock.calls[0]![1]).toMatchObject({ id: 'x1' });
  });

  it('does not pick a song when there are two', async () => {
    soleBand(); // one band and one set list, but two songs (the default fixture)
    setup();
    expect(await screen.findByRole('combobox', { name: 'Song' })).toHaveTextContent('Choose a song');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(saveSongTrack).not.toHaveBeenCalled();
  });

  it('still lets the person choose a song by hand after the band and set list were filled in', async () => {
    soleBand();
    const { user } = setup();
    await choose(user, 'Song', 'Kashmir');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveSongTrack).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveSongTrack).mock.calls[0]![1]).toMatchObject({ id: 's2', title: 'Kashmir' });
  });

  it('lets a manual set list choice win over the sole-band fill-in and resets the song below it', async () => {
    soleBand();
    vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view: view({ setLists: [...setLists, secondSetList] }) });
    const { user } = setup();
    await choose(user, 'Set list', 'Encore');
    expect(fetchSongTargets).toHaveBeenCalledWith(expect.anything(), 'sl-2');
    expect(await screen.findByRole('combobox', { name: 'Song' })).toHaveTextContent('Choose a song');
  });

  it('does not fill in a sole band that is not active', async () => {
    vi.mocked(loadMyBands).mockResolvedValue({ entries: [entry('band-1', 'Kicked Band', 'removed')], failedCount: 0, deadBandIds: [] });
    setup();
    expect(await screen.findByText(/not in a band yet/)).toBeInTheDocument();
    expect(loadBandView).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('fills in the one active band even when the person was also removed from another', async () => {
    vi.mocked(loadMyBands).mockResolvedValue({
      entries: [entry('band-1', 'The Band'), entry('band-9', 'Kicked Band', 'removed')],
      failedCount: 0,
      deadBandIds: [],
    });
    setup();
    expect(await screen.findByRole('combobox', { name: 'Set list' })).toHaveTextContent('Main Set');
    expect(loadBandView).toHaveBeenCalledWith('band-1');
  });

  it('does not fill in the band when some bands failed to load, since the failed one might be the intended one', async () => {
    vi.mocked(loadMyBands).mockResolvedValue({ entries: [entry('band-1', 'The Band')], failedCount: 1, deadBandIds: [] });
    setup();
    expect(await screen.findByText(/Some of your bands couldn’t be loaded/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Band' })).toHaveTextContent('Choose a band');
    expect(loadBandView).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox', { name: 'Set list' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('still lets the person pick the band by hand when some bands failed to load', async () => {
    vi.mocked(loadMyBands).mockResolvedValue({ entries: [entry('band-1', 'The Band')], failedCount: 1, deadBandIds: [] });
    const { user } = setup();
    await choose(user, 'Band', 'The Band');
    expect(loadBandView).toHaveBeenCalledWith('band-1');
  });

  it('does not fill in a sole song when the set list loaded only partly', async () => {
    soleBand();
    vi.mocked(fetchSongTargets).mockResolvedValue(targets({ songs: [song('s1', 'Black Dog')], incomplete: true }));
    const { user } = setup();
    expect(await screen.findByText(/too long to load completely/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Song' })).toHaveTextContent('Choose a song');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // choosing it by hand still works
    await choose(user, 'Song', 'Black Dog');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveSongTrack).toHaveBeenCalledTimes(1));
  });

  it('pre-fills nothing when the band view cannot be loaded', async () => {
    soleBand();
    vi.mocked(loadBandView).mockRejectedValue(new Error('band down'));
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('band down');
    expect(screen.queryByRole('combobox', { name: 'Set list' })).not.toBeInTheDocument();
    expect(fetchSongTargets).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('pre-fills no song when the songs cannot be loaded', async () => {
    soleBand();
    vi.mocked(fetchSongTargets).mockRejectedValue(new Error('songs down'));
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('songs down');
    expect(screen.queryByRole('combobox', { name: 'Song' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('pre-fills nothing for a sole band the person cannot write to', async () => {
    soleBand();
    vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view: view({ isMember: false }) });
    setup();
    expect(await screen.findByText(/can’t add to this band right now/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Set list' })).not.toBeInTheDocument();
  });

  it('starts again from the sole option after the dialog is closed and reopened', async () => {
    soleBand();
    soleSong();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <MemoryRouter>
          <button onClick={() => setOpen(true)}>reopen</button>
          <SaveToBandDialog open={open} onOpenChange={setOpen} pieces={[piece()]} groups={[]} />
        </MemoryRouter>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'reopen' }));
    expect(await screen.findByRole('combobox', { name: 'Song' })).toHaveTextContent('Black Dog');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(loadMyBands).toHaveBeenCalledTimes(2);
  });
});
