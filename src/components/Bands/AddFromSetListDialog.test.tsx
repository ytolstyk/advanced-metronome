import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BandRecord, BandView, ValidSetList, ValidSong } from '../../bandTypes';
import { BAND_LIMITS } from '../../bandTypes';
import type { SongChoices } from '../../bandViews';

vi.mock('../../api/bandsApi', () => ({ loadMemberBandView: vi.fn() }));
vi.mock('../../api/setListsApi', () => ({ fetchSongChoices: vi.fn() }));

import { AddFromSetListDialog } from './AddFromSetListDialog';
import { loadMemberBandView } from '../../api/bandsApi';
import { fetchSongChoices } from '../../api/setListsApi';
import { PartialCopyError } from '../../api/partialCopyError';

// Radix Select leans on pointer-capture and scrolling APIs jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

const ME = 'sub-me';
const BOB = 'sub-bob';

const band = (setListIds: string[]): BandRecord =>
  ({ id: 'band-1', owner: 'sub-owner', name: 'The Band', inviteCode: 'ABCDEFGHJK', deletedAt: null, version: 1, setListIds, archivedSetListIds: [], bannedSubs: [], hiddenSongIds: [], sharedSetListIds: [], inviteTtlDays: 1 }) as BandRecord;

const listRow = (id: string, name: string) => ({ id, owner: 'sub-owner', bandId: 'band-1', name, archivedAt: null });

const view = (lists: Array<[string, string]>): BandView =>
  ({
    band: band(lists.map(([id]) => id)),
    sub: ME,
    isOwner: false,
    isMember: true,
    members: [],
    memberSubs: new Set([ME, BOB]),
    displayNames: new Map(),
    setLists: lists.map(([id, name]) => listRow(id, name)) as unknown as ValidSetList[],
    removedMembers: [],
    incomplete: false,
  }) as BandView;

const THIS = ['sl-1', 'Main Set'] as [string, string];
const OLD = ['sl-2', 'Old Gig'] as [string, string];
const SUMMER = ['sl-3', 'Summer'] as [string, string];

const song = (id: string, title: string, over: Record<string, unknown> = {}): ValidSong =>
  ({ id, owner: BOB, bandId: 'band-1', setListId: 'sl-2', title, artist: null, key: null, tuning: null, bpm: null, notes: null, songUrl: null, tabUrl: null, ...over }) as unknown as ValidSong;

const choices = (songs: ValidSong[], incomplete = false): SongChoices => ({ songs, incomplete });

const OLD_SONGS = [song('a', 'Black Dog'), song('b', 'Kashmir'), song('c', 'Ramble On')];

interface Setup {
  lists?: Array<[string, string]>;
  existing?: ValidSong[];
  bySource?: Record<string, SongChoices>;
  onAdd?: (songs: ValidSong[]) => Promise<void>;
}

function setup({ lists = [THIS, OLD], existing = [], bySource = { 'sl-2': choices(OLD_SONGS) }, onAdd }: Setup = {}) {
  const v = view(lists);
  vi.mocked(loadMemberBandView).mockResolvedValue(v);
  vi.mocked(fetchSongChoices).mockImplementation(async (_view, id) => bySource[id] ?? choices([]));
  const add = vi.fn(onAdd ?? (async () => undefined));
  const onOpenChange = vi.fn();
  const props = { onOpenChange, bandId: 'band-1', setListId: 'sl-1', onAdd: add };
  const utils = render(<AddFromSetListDialog {...props} existingSongs={existing} />);
  const rerenderWith = (nextExisting: ValidSong[]) => utils.rerender(<AddFromSetListDialog {...props} existingSongs={nextExisting} />);
  return { onAdd: add, onOpenChange, view: v, rerenderWith };
}

const box = (title: string) => screen.getByRole('checkbox', { name: new RegExp(`^${title}`) });
const addButton = () => screen.getByRole('button', { name: /^(Add \d+ songs?|Adding…)$/ });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AddFromSetListDialog states', () => {
  it('shows a loading note while the band loads', () => {
    vi.mocked(loadMemberBandView).mockReturnValue(new Promise(() => undefined));
    render(<AddFromSetListDialog onOpenChange={vi.fn()} bandId="band-1" setListId="sl-1" existingSongs={[]} onAdd={vi.fn()} />);
    expect(screen.getByText('Loading set lists…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Copy from')).not.toBeInTheDocument();
  });

  it('asks for the band the dialog was opened on', async () => {
    setup();
    await screen.findByText('Black Dog');
    expect(loadMemberBandView).toHaveBeenCalledWith('band-1');
  });

  it('shows the failure when the band cannot be loaded', async () => {
    vi.mocked(loadMemberBandView).mockRejectedValue(new Error('network down'));
    render(<AddFromSetListDialog onOpenChange={vi.fn()} bandId="band-1" setListId="sl-1" existingSongs={[]} onAdd={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
  });

  it('says so when the caller is not a member of the band', async () => {
    vi.mocked(loadMemberBandView).mockResolvedValue('unavailable');
    render(<AddFromSetListDialog onOpenChange={vi.fn()} bandId="band-1" setListId="sl-1" existingSongs={[]} onAdd={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('You can’t add songs to this band right now.');
    expect(fetchSongChoices).not.toHaveBeenCalled();
  });

  it('says there is nothing to copy from when this is the only set list', async () => {
    setup({ lists: [THIS] });
    expect(await screen.findByText('This band has no other set lists to copy from.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Copy from')).not.toBeInTheDocument();
    expect(fetchSongChoices).not.toHaveBeenCalled();
    expect(addButton()).toBeDisabled();
  });

  it('never offers the current set list as a source', async () => {
    const user = userEvent.setup();
    setup({ lists: [THIS, OLD, SUMMER] });
    await user.click(await screen.findByRole('combobox', { name: 'Copy from' }));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Old Gig', 'Summer']);
  });

  it('shows a loading note, then an error, for the chosen list\'s songs', async () => {
    let fail!: (e: unknown) => void;
    vi.mocked(loadMemberBandView).mockResolvedValue(view([THIS, OLD]));
    vi.mocked(fetchSongChoices).mockReturnValue(new Promise((_res, rej) => { fail = rej; }));
    render(<AddFromSetListDialog onOpenChange={vi.fn()} bandId="band-1" setListId="sl-1" existingSongs={[]} onAdd={vi.fn()} />);
    expect(await screen.findByText('Loading songs…')).toBeInTheDocument();
    fail(new Error('songs failed'));
    expect(await screen.findByRole('alert')).toHaveTextContent('songs failed');
    expect(screen.queryByRole('list', { name: 'Songs to copy' })).not.toBeInTheDocument();
  });

  it('says when the chosen list has no songs', async () => {
    setup({ bySource: { 'sl-2': choices([]) } });
    expect(await screen.findByText('That set list has no songs yet.')).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });

  it('warns when the source list was too long to load completely', async () => {
    setup({ bySource: { 'sl-2': choices(OLD_SONGS, true) } });
    await screen.findByText('Black Dog');
    expect(screen.getByText(/too long to load completely/)).toBeInTheDocument();
  });
});

describe('AddFromSetListDialog source choice', () => {
  it('picks the only other set list without asking and loads its songs', async () => {
    const { view: v } = setup();
    expect(await screen.findByText('Black Dog')).toBeInTheDocument();
    expect(fetchSongChoices).toHaveBeenCalledTimes(1);
    expect(fetchSongChoices).toHaveBeenCalledWith(v, 'sl-2');
    expect(screen.getByRole('combobox', { name: 'Copy from' })).toHaveTextContent('Old Gig');
  });

  it('loads no songs until one of several lists is chosen', async () => {
    const user = userEvent.setup();
    setup({ lists: [THIS, OLD, SUMMER], bySource: { 'sl-2': choices(OLD_SONGS), 'sl-3': choices([song('x', 'Hurt', { setListId: 'sl-3' })]) } });
    const trigger = await screen.findByRole('combobox', { name: 'Copy from' });
    expect(trigger).toHaveTextContent('Choose a set list');
    expect(fetchSongChoices).not.toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: 'Songs to copy' })).not.toBeInTheDocument();
    expect(addButton()).toBeDisabled();

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Summer' }));
    expect(await screen.findByText('Hurt')).toBeInTheDocument();
    expect(fetchSongChoices).toHaveBeenCalledWith(expect.anything(), 'sl-3');
  });

  it('forgets the ticked songs and shows only the new list\'s songs when the source changes', async () => {
    const user = userEvent.setup();
    setup({ lists: [THIS, OLD, SUMMER], bySource: { 'sl-2': choices(OLD_SONGS), 'sl-3': choices([song('x', 'Hurt', { setListId: 'sl-3' })]) } });
    await user.click(await screen.findByRole('combobox', { name: 'Copy from' }));
    await user.click(await screen.findByRole('option', { name: 'Old Gig' }));
    await user.click(await screen.findByRole('checkbox', { name: /Black Dog/ }));
    expect(screen.getByText(/1 selected/)).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Copy from' }));
    await user.click(await screen.findByRole('option', { name: 'Summer' }));
    await screen.findByText('Hurt');
    expect(screen.queryByText('Black Dog')).not.toBeInTheDocument();
    expect(screen.getByText(/0 selected/)).toBeInTheDocument();
    expect(addButton()).toBeDisabled();

    // Back to the first list: the earlier tick did not come back.
    await user.click(screen.getByRole('combobox', { name: 'Copy from' }));
    await user.click(await screen.findByRole('option', { name: 'Old Gig' }));
    expect(await screen.findByRole('checkbox', { name: /Black Dog/ })).not.toBeChecked();
    expect(screen.getByText(/0 selected/)).toBeInTheDocument();
  });
});

describe('AddFromSetListDialog duplicates', () => {
  it('disables a song already on this list (same title and artist, any case) and says so', async () => {
    const existing = [song('e1', 'black dog', { setListId: 'sl-1' })];
    setup({ existing });
    await screen.findByText('Black Dog');
    expect(box('Black Dog')).toBeDisabled();
    expect(box('Black Dog')).not.toBeChecked();
    expect(screen.getByText('Already on this list')).toBeInTheDocument();
    expect(box('Kashmir')).toBeEnabled();
  });

  it('does not treat the same title by a different artist as a duplicate', async () => {
    const existing = [song('e1', 'Black Dog', { setListId: 'sl-1', artist: 'Someone Else' })];
    setup({ existing, bySource: { 'sl-2': choices([song('a', 'Black Dog', { artist: 'Led Zeppelin' })]) } });
    await screen.findByText('Black Dog');
    expect(box('Black Dog')).toBeEnabled();
    expect(screen.queryByText('Already on this list')).not.toBeInTheDocument();
  });

  it('shows artist, key and BPM for songs that have them', async () => {
    setup({ bySource: { 'sl-2': choices([song('a', 'Kashmir', { artist: 'Led Zeppelin', key: 'Dm', bpm: 80 })]) } });
    expect(await screen.findByText('Led Zeppelin · Dm · 80 BPM')).toBeInTheDocument();
  });

  it('Select all skips duplicates and Clear selection empties the ticks', async () => {
    const user = userEvent.setup();
    setup({ existing: [song('e1', 'Kashmir', { setListId: 'sl-1' })] });
    await screen.findByText('Black Dog');
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(box('Black Dog')).toBeChecked();
    expect(box('Kashmir')).not.toBeChecked();
    expect(box('Ramble On')).toBeChecked();
    expect(screen.getByText(/2 selected/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByText(/0 selected/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select all' })).toBeInTheDocument();
  });

  it('disables Select all when every song is already on the list', async () => {
    setup({ existing: OLD_SONGS.map((s) => song(`e-${s.id}`, s.title, { setListId: 'sl-1' })) });
    await screen.findByText('Black Dog');
    expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled();
    expect(addButton()).toBeDisabled();
  });
});

describe('AddFromSetListDialog room', () => {
  const existingFor = (n: number) => Array.from({ length: n }, (_, i) => song(`e${i}`, `Existing ${i}`, { setListId: 'sl-1' }));
  const MAX = BAND_LIMITS.maxSongsPerSetList;

  it('says how much room is left', async () => {
    setup({ existing: existingFor(3) });
    await screen.findByText('Black Dog');
    expect(screen.getByText(`0 selected · room for ${MAX - 3} more`)).toBeInTheDocument();
  });

  it('Select all picks only as many as fit, and the cap locks the unticked boxes', async () => {
    const user = userEvent.setup();
    setup({ existing: existingFor(MAX - 2) });
    await screen.findByText('Black Dog');
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(box('Black Dog')).toBeChecked();
    expect(box('Kashmir')).toBeChecked();
    expect(box('Ramble On')).not.toBeChecked();
    expect(box('Ramble On')).toBeDisabled();
    expect(screen.getByText('2 selected · room for 2 more')).toBeInTheDocument();
    // Ticked boxes stay usable so one can be swapped.
    expect(box('Black Dog')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
  });

  it('unticking a song at the cap frees the others again', async () => {
    const user = userEvent.setup();
    setup({ existing: existingFor(MAX - 1) });
    await screen.findByText('Black Dog');
    await user.click(box('Black Dog'));
    expect(box('Kashmir')).toBeDisabled();
    await user.click(box('Black Dog'));
    expect(box('Kashmir')).toBeEnabled();
  });

  it('locks every box and Select all when the list is already full', async () => {
    setup({ existing: existingFor(MAX) });
    await screen.findByText('Black Dog');
    for (const t of ['Black Dog', 'Kashmir', 'Ramble On']) expect(box(t)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled();
    expect(screen.getByText('0 selected · room for 0 more')).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });
});

describe('AddFromSetListDialog submit', () => {
  it('sends only the ticked songs, then closes', async () => {
    const user = userEvent.setup();
    const { onAdd, onOpenChange } = setup();
    await screen.findByText('Black Dog');
    await user.click(box('Black Dog'));
    await user.click(box('Ramble On'));
    await user.click(addButton());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('labels the button by how many are ticked and is disabled with none', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('Black Dog');
    expect(screen.getByRole('button', { name: 'Add 0 songs' })).toBeDisabled();
    await user.click(box('Black Dog'));
    expect(screen.getByRole('button', { name: 'Add 1 song' })).toBeEnabled();
    await user.click(box('Kashmir'));
    expect(screen.getByRole('button', { name: 'Add 2 songs' })).toBeEnabled();
  });

  it('shows Adding… and locks the form while the add is in flight', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    const { onOpenChange } = setup({ onAdd: () => new Promise<void>((r) => { finish = r; }) });
    await screen.findByText('Black Dog');
    await user.click(box('Black Dog'));
    await user.click(addButton());
    expect(await screen.findByRole('button', { name: 'Adding…' })).toBeDisabled();
    expect(box('Kashmir')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    finish();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('Cancel closes without adding', async () => {
    const user = userEvent.setup();
    const { onAdd, onOpenChange } = setup();
    await screen.findByText('Black Dog');
    await user.click(box('Black Dog'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and shows the failure inline when the add fails', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup({ onAdd: async () => { throw new Error('Added 1 of 2 songs. write failed'); } });
    await screen.findByText('Black Dog');
    await user.click(box('Black Dog'));
    await user.click(box('Kashmir'));
    await user.click(addButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Added 1 of 2 songs. write failed');
    expect(onOpenChange).not.toHaveBeenCalled();
    // The ticks survive so the person can retry.
    expect(box('Black Dog')).toBeChecked();
    expect(box('Kashmir')).toBeChecked();
    expect(addButton()).toBeEnabled();
  });

  it('clears the failure message when the next attempt starts', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn<(songs: ValidSong[]) => Promise<void>>().mockRejectedValueOnce(new Error('first failure')).mockResolvedValue(undefined);
    const { onOpenChange } = setup({ onAdd });
    await screen.findByText('Black Dog');
    await user.click(box('Black Dog'));
    await user.click(addButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('first failure');
    await user.click(addButton());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByText('first failure')).not.toBeInTheDocument();
  });

  // REGRESSION: a partial failure reloads the list, so songs that landed now match "already here". The
  // retry must not send them again (that would create duplicates) and the count must not include them.
  it('after a partial failure, a ticked song that became a duplicate is not retried or counted', async () => {
    const user = userEvent.setup();
    const onAdd = vi
      .fn<(songs: ValidSong[]) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Added 1 of 3 songs. write failed'))
      .mockResolvedValue(undefined);
    const { onOpenChange, rerenderWith } = setup({ onAdd });
    await screen.findByText('Black Dog');
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(addButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Added 1 of 3 songs');
    expect(onAdd.mock.calls[0][0].map((s) => s.id)).toEqual(['a', 'b', 'c']);

    // The page reloads: "Black Dog" landed, so it is now on this list.
    rerenderWith([song('landed', 'Black Dog', { setListId: 'sl-1' })]);

    expect(box('Black Dog')).toBeDisabled();
    expect(box('Black Dog')).not.toBeChecked();
    expect(within(screen.getByRole('list', { name: 'Songs to copy' })).getByText('Already on this list')).toBeInTheDocument();
    expect(screen.getByText(/^2 selected/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add 2 songs' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Add 2 songs' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd.mock.calls[1][0].map((s) => s.id)).toEqual(['b', 'c']);
  });

  it('after a partial failure, disables Add when every ticked song became a duplicate', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn<(songs: ValidSong[]) => Promise<void>>().mockRejectedValue(new Error('Added 1 of 1 songs. x'));
    const { rerenderWith } = setup({ onAdd });
    await screen.findByText('Black Dog');
    await user.click(box('Black Dog'));
    await user.click(addButton());
    await screen.findByRole('alert');
    rerenderWith([song('landed', 'Black Dog', { setListId: 'sl-1' })]);
    expect(screen.getByRole('button', { name: 'Add 0 songs' })).toBeDisabled();
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('counts room against the refreshed list after a partial failure', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn<(songs: ValidSong[]) => Promise<void>>().mockRejectedValue(new Error('partial'));
    const { rerenderWith } = setup({ onAdd });
    await screen.findByText('Black Dog');
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(addButton());
    await screen.findByRole('alert');
    rerenderWith([song('landed', 'Black Dog', { setListId: 'sl-1' })]);
    expect(screen.getByText(`2 selected · room for ${BAND_LIMITS.maxSongsPerSetList - 1} more`)).toBeInTheDocument();
  });

  // REGRESSION: the page's reload can lag or fail. The dialog must remember what landed on its own.
  it('after a partial failure, never re-sends songs the error says landed, even if the list never refreshes', async () => {
    const user = userEvent.setup();
    const onAdd = vi
      .fn<(songs: ValidSong[]) => Promise<void>>()
      .mockRejectedValueOnce(new PartialCopyError('Added 2 of 3 songs. write failed', new Set(['a', 'c']), new Error('write failed')))
      .mockResolvedValue(undefined);
    const { onOpenChange } = setup({ onAdd });
    await screen.findByText('Black Dog');
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(addButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Added 2 of 3 songs');

    // No rerender: existingSongs is still the old list.
    expect(box('Black Dog')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add 1 song' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Add 1 song' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onAdd.mock.calls[1][0].map((s) => s.id)).toEqual(['b']);
  });
});
