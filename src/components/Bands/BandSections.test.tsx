import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BandRecord, BandView, ValidSetList } from '../../bandTypes';
import { DangerZone, MembersSection, SetListsSection } from './BandSections';

const band = (over: Partial<BandRecord> = {}): BandRecord => ({
  id: 'b1',
  owner: 'sub-owner',
  name: 'The Band',
  inviteCode: 'ABCDEFGHJK',
  deletedAt: null,
  version: 1,
  setListIds: [],
  archivedSetListIds: [],
  bannedSubs: [],
  hiddenSongIds: [],
  sharedSetListIds: [],
  inviteTtlDays: 1,
  ...over,
});
const setList = (id: string, name: string): ValidSetList =>
  ({ id, owner: 'sub-owner', bandId: 'b1', name, archivedAt: null }) as ValidSetList;

const view = (over: Partial<BandView> = {}): BandView => ({
  band: band(),
  sub: 'sub-me',
  isOwner: false,
  isMember: true,
  members: [],
  memberSubs: new Set(),
  displayNames: new Map(),
  setLists: [],
  removedMembers: [],
  incomplete: false,
  ...over,
});

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('SetListsSection', () => {
  const handlers = () => ({ onCreate: vi.fn(), onRename: vi.fn(), onArchive: vi.fn(), onToggleShared: vi.fn(), onReorder: vi.fn().mockResolvedValue(true) });

  it('tells the owner to create the first set list, and offers the create button', () => {
    const h = handlers();
    inRouter(<SetListsSection view={view({ isOwner: true })} {...h} />);
    expect(screen.getByText('Create your first set list.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New set list' }));
    expect(h.onCreate).toHaveBeenCalledTimes(1);
  });

  it('tells a member to wait for the owner and shows no create button', () => {
    inRouter(<SetListsSection view={view()} {...handlers()} />);
    expect(screen.getByText('The owner hasn’t created a set list yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New set list' })).not.toBeInTheDocument();
  });

  it('hides "New set list" once the band holds the maximum, counting by band ids', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `sl-${i}`);
    inRouter(
      <SetListsSection view={view({ isOwner: true, band: band({ setListIds: ids }), setLists: [setList('sl-0', 'A')] })} {...handlers()} />,
    );
    expect(screen.queryByRole('button', { name: 'New set list' })).not.toBeInTheDocument();
  });

  it('still offers "New set list" one below the maximum', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `sl-${i}`);
    inRouter(<SetListsSection view={view({ isOwner: true, band: band({ setListIds: ids }) })} {...handlers()} />);
    expect(screen.getByRole('button', { name: 'New set list' })).toBeInTheDocument();
  });

  it('links each set list with encoded ids', () => {
    inRouter(
      <SetListsSection
        view={view({ band: band({ id: 'b/1' }), setLists: [setList('sl 1', 'Weird/Name')] })}
        {...handlers()}
      />,
    );
    expect(screen.getByRole('link', { name: /^Weird\/Name/ })).toHaveAttribute('href', '/bands/b%2F1/setlists/sl%201');
  });

  it('members get no rename/archive controls', () => {
    inRouter(<SetListsSection view={view({ setLists: [setList('sl-1', 'Main Set')] })} {...handlers()} />);
    expect(screen.getByRole('link', { name: /^Main Set/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rename|Archive/ })).not.toBeInTheDocument();
  });

  it('the owner can rename and archive with the set list id and name', () => {
    const h = handlers();
    inRouter(<SetListsSection view={view({ isOwner: true, setLists: [setList('sl-1', 'Main Set')] })} {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Main Set' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive Main Set' }));
    expect(h.onRename).toHaveBeenCalledWith('sl-1', 'Main Set');
    expect(h.onArchive).toHaveBeenCalledWith('sl-1', 'Main Set');
  });
});

describe('SetListsSection reordering', () => {
  const lists = () => [setList('sl-1', 'Alpha'), setList('sl-2', 'Bravo'), setList('sl-3', 'Charlie')];
  const ownerView = (over: Partial<BandView> = {}) =>
    view({ isOwner: true, band: band({ setListIds: ['sl-3', 'sl-2', 'sl-1'] }), setLists: lists(), ...over });
  const handlers = (onReorder = vi.fn().mockResolvedValue(true)) => ({
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onArchive: vi.fn(),
    onToggleShared: vi.fn(),
    onReorder,
  });
  const linkNames = () => screen.getAllByRole('link').map((a) => /^(Alpha|Bravo|Charlie|Delta)/.exec(a.textContent ?? '')?.[1]);
  const startReordering = () => fireEvent.click(screen.getByRole('button', { name: 'Reorder' }));
  const reorderRows = () => within(screen.getByRole('list', { name: 'Set list order' })).getAllByRole('listitem');
  const rowNames = () => reorderRows().map((r) => within(r).getByLabelText(/^Position of /).getAttribute('aria-label')?.replace('Position of ', ''));

  it('shows the lists in the order of the view (top first)', () => {
    inRouter(<SetListsSection view={ownerView()} {...handlers()} />);
    expect(linkNames()).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('offers Reorder to the owner when there are two or more lists', () => {
    inRouter(<SetListsSection view={ownerView({ setLists: lists().slice(0, 2) })} {...handlers()} />);
    expect(screen.getByRole('button', { name: 'Reorder' })).toBeEnabled();
  });

  it('hides Reorder from a non-owner member', () => {
    inRouter(<SetListsSection view={ownerView({ isOwner: false })} {...handlers()} />);
    expect(screen.queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument();
  });

  it('hides Reorder with one list or none', () => {
    const { unmount } = inRouter(<SetListsSection view={ownerView({ setLists: [setList('sl-1', 'Alpha')] })} {...handlers()} />);
    expect(screen.queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument();
    unmount();
    inRouter(<SetListsSection view={ownerView({ setLists: [] })} {...handlers()} />);
    expect(screen.queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument();
  });

  it('enters reorder mode with Done and Cancel, hides New set list and the normal links', () => {
    inRouter(<SetListsSection view={ownerView()} {...handlers()} />);
    expect(screen.getByRole('button', { name: 'New set list' })).toBeInTheDocument();
    startReordering();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New set list' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(rowNames()).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('does not call onReorder while moving, only when Done is pressed (once, top first)', async () => {
    const h = handlers();
    inRouter(<SetListsSection view={ownerView()} {...h} />);
    startReordering();
    fireEvent.click(screen.getByRole('button', { name: 'Move Charlie up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Charlie up' }));
    expect(rowNames()).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(h.onReorder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(h.onReorder).toHaveBeenCalledTimes(1));
    expect(h.onReorder).toHaveBeenCalledWith(['sl-3', 'sl-1', 'sl-2']);
  });

  it('keeps showing the draft while the save runs, then the saved order once it succeeds', async () => {
    let finish: (ok: boolean) => void = () => undefined;
    const onReorder = vi.fn().mockReturnValue(new Promise<boolean>((resolve) => (finish = resolve)));
    inRouter(<SetListsSection view={ownerView()} {...handlers(onReorder)} />);
    startReordering();
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onReorder).toHaveBeenCalledWith(['sl-2', 'sl-1', 'sl-3']);
    expect(rowNames()).toEqual(['Bravo', 'Alpha', 'Charlie']); // still reordering until the save lands
    finish(true);
    await waitFor(() => expect(linkNames()).toEqual(['Bravo', 'Alpha', 'Charlie']));
  });

  it('a position typed in the number box is part of the draft and saved by Done', async () => {
    const h = handlers();
    inRouter(<SetListsSection view={ownerView()} {...h} />);
    startReordering();
    const input = screen.getByRole('spinbutton', { name: 'Position of Alpha' });
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    expect(h.onReorder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(h.onReorder).toHaveBeenCalledWith(['sl-2', 'sl-3', 'sl-1']));
  });

  it('Cancel discards the draft and does not call onReorder', () => {
    const h = handlers();
    inRouter(<SetListsSection view={ownerView()} {...h} />);
    startReordering();
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.onReorder).not.toHaveBeenCalled();
    expect(linkNames()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(screen.getByRole('button', { name: 'Reorder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New set list' })).toBeInTheDocument();
    // A fresh session starts from the view's order again.
    startReordering();
    expect(rowNames()).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('Done with no change does not call onReorder', () => {
    const h = handlers();
    inRouter(<SetListsSection view={ownerView()} {...h} />);
    startReordering();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(h.onReorder).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reorder' })).toBeInTheDocument();
  });

  it('moving a row away and back then Done does not call onReorder', () => {
    const h = handlers();
    inRouter(<SetListsSection view={ownerView()} {...h} />);
    startReordering();
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(h.onReorder).not.toHaveBeenCalled();
  });

  it('keeps the draft and reorder mode when the save fails, so Done can retry', async () => {
    const onReorder = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    inRouter(<SetListsSection view={ownerView()} {...handlers(onReorder)} />);
    startReordering();
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onReorder).toHaveBeenCalledTimes(1));
    expect(rowNames()).toEqual(['Bravo', 'Alpha', 'Charlie']); // the arrangement survives the failure
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onReorder).toHaveBeenCalledTimes(2));
    expect(onReorder).toHaveBeenLastCalledWith(['sl-2', 'sl-1', 'sl-3']);
    await waitFor(() => expect(linkNames()).toEqual(['Bravo', 'Alpha', 'Charlie']));
  });

  it('keeps the new order after onReorder resolves true', async () => {
    const onReorder = vi.fn().mockResolvedValue(true);
    inRouter(<SetListsSection view={ownerView()} {...handlers(onReorder)} />);
    startReordering();
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onReorder).toHaveBeenCalled());
    await Promise.resolve();
    expect(linkNames()).toEqual(['Bravo', 'Alpha', 'Charlie']);
  });

  it('lets a reloaded view (a new setLists array) replace the optimistic order', async () => {
    const h = handlers();
    const first = ownerView();
    const { rerender } = inRouter(<SetListsSection view={first} {...h} />);
    startReordering();
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(h.onReorder).toHaveBeenCalled());
    const reloaded = ownerView({ setLists: [setList('sl-2', 'Bravo'), setList('sl-3', 'Charlie'), setList('sl-1', 'Alpha')] });
    rerender(
      <MemoryRouter>
        <SetListsSection view={reloaded} {...h} />
      </MemoryRouter>,
    );
    expect(linkNames()).toEqual(['Bravo', 'Charlie', 'Alpha']);
  });

  it('puts a list that arrives while reordering at the top of the draft', () => {
    const h = handlers();
    const first = ownerView();
    const { rerender } = inRouter(<SetListsSection view={first} {...h} />);
    startReordering();
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    rerender(
      <MemoryRouter>
        <SetListsSection view={ownerView({ setLists: [setList('sl-4', 'Delta'), ...lists()] })} {...h} />
      </MemoryRouter>,
    );
    expect(rowNames()).toEqual(['Delta', 'Bravo', 'Alpha', 'Charlie']);
  });

  it('leaves reorder mode when the lists drop below two (only one is left)', () => {
    const h = handlers();
    const { rerender } = inRouter(<SetListsSection view={ownerView()} {...h} />);
    startReordering();
    rerender(
      <MemoryRouter>
        <SetListsSection view={ownerView({ setLists: [setList('sl-1', 'Alpha')] })} {...h} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('list', { name: 'Set list order' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Alpha/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('disables Reorder (and Done) while reorderBusy is set', () => {
    const h = handlers();
    const { rerender } = inRouter(<SetListsSection view={ownerView()} {...h} reorderBusy />);
    expect(screen.getByRole('button', { name: 'Reorder' })).toBeDisabled();
    rerender(
      <MemoryRouter>
        <SetListsSection view={ownerView()} {...h} reorderBusy={false} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Reorder' })).toBeEnabled();
  });

  it('disables Done while a save is running, even in the middle of a reorder', () => {
    const h = handlers();
    const { rerender } = inRouter(<SetListsSection view={ownerView()} {...h} />);
    startReordering();
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    rerender(
      <MemoryRouter>
        <SetListsSection view={ownerView()} {...h} reorderBusy />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(h.onReorder).not.toHaveBeenCalled();
  });

  it('does not show the reorder help text outside reorder mode', () => {
    inRouter(<SetListsSection view={ownerView()} {...handlers()} />);
    expect(screen.queryByText(/press Done to save/)).not.toBeInTheDocument();
    startReordering();
    expect(screen.getByText(/press Done to save/)).toBeInTheDocument();
  });

  it('announces moves in the status region while reordering', () => {
    inRouter(<SetListsSection view={ownerView()} {...handlers()} />);
    startReordering();
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    expect(screen.getByRole('status')).toHaveTextContent('Alpha moved to position 2 of 3');
  });
});

describe('SetListsSection public sharing', () => {
  const handlers = () => ({ onCreate: vi.fn(), onRename: vi.fn(), onArchive: vi.fn(), onToggleShared: vi.fn(), onReorder: vi.fn().mockResolvedValue(true) });
  const writeText = vi.fn();
  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });
  const sharedBand = (over: Partial<BandRecord> = {}) =>
    band({ setListIds: ['sl-1', 'sl-2'], sharedSetListIds: ['sl-1'], ...over });
  const lists = [setList('sl-1', 'Main Set'), setList('sl-2', 'Acoustic')];
  const rowOf = (name: string) => screen.getByRole('link', { name: new RegExp(`^${name}`) }).closest('li') as HTMLElement;

  it('labels each set list Shared or Not shared', () => {
    inRouter(<SetListsSection view={view({ band: sharedBand(), setLists: lists })} {...handlers()} />);
    expect(within(rowOf('Main Set')).getByText('Shared')).toBeInTheDocument();
    expect(within(rowOf('Acoustic')).getByText('Not shared')).toBeInTheDocument();
  });

  it('explains that nothing is public until the owner turns it on', () => {
    inRouter(<SetListsSection view={view()} {...handlers()} />);
    expect(screen.getByText(/Nothing is\s+shared until the owner turns it on/)).toBeInTheDocument();
  });

  it('the owner sees Share on an unshared list and Stop sharing on a shared one, and each calls onToggleShared(id, !shared)', () => {
    const h = handlers();
    inRouter(<SetListsSection view={view({ isOwner: true, band: sharedBand(), setLists: lists })} {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share Acoustic' }));
    expect(h.onToggleShared).toHaveBeenLastCalledWith('sl-2', true);
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing Main Set' }));
    expect(h.onToggleShared).toHaveBeenLastCalledWith('sl-1', false);
    expect(screen.queryByRole('button', { name: 'Stop sharing Acoustic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share Main Set' })).not.toBeInTheDocument();
    expect(h.onToggleShared).toHaveBeenCalledTimes(2);
  });

  it('members get no Share / Stop sharing controls', () => {
    const h = handlers();
    inRouter(<SetListsSection view={view({ isOwner: false, band: sharedBand(), setLists: lists })} {...h} />);
    expect(screen.queryByRole('button', { name: /^(Share|Stop sharing) / })).not.toBeInTheDocument();
  });

  it('shows Copy link only for shared lists (to owners and members alike)', () => {
    for (const isOwner of [true, false]) {
      const { unmount } = inRouter(<SetListsSection view={view({ isOwner, band: sharedBand(), setLists: lists })} {...handlers()} />);
      expect(within(rowOf('Main Set')).getByRole('button', { name: 'Copy share link for Main Set' })).toBeInTheDocument();
      expect(within(rowOf('Acoustic')).queryByRole('button', { name: /Copy share link/ })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('Copy link copies the public /shared/<id> URL', async () => {
    writeText.mockResolvedValue(undefined);
    inRouter(<SetListsSection view={view({ band: sharedBand(), setLists: lists })} {...handlers()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link for Main Set' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/shared/sl-1`));
  });

  it('a set list whose id is only in sharedSetListIds (not in setListIds) or whose band is deleted shows Not shared', () => {
    const { unmount } = inRouter(
      <SetListsSection
        view={view({ band: band({ setListIds: ['sl-1'], sharedSetListIds: ['sl-1'], deletedAt: '2026-02-01T00:00:00Z' }), setLists: [setList('sl-1', 'Main Set')] })}
        {...handlers()}
      />,
    );
    expect(screen.getByText('Not shared')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy share link/ })).not.toBeInTheDocument();
    unmount();
    inRouter(
      <SetListsSection
        view={view({ band: band({ setListIds: ['sl-9'], sharedSetListIds: ['sl-1'] }), setLists: [setList('sl-1', 'Main Set')] })}
        {...handlers()}
      />,
    );
    expect(screen.getByText('Not shared')).toBeInTheDocument();
  });

  it('the share toggle accessible name uses the set list name, so lists are distinguishable', () => {
    inRouter(<SetListsSection view={view({ isOwner: true, band: sharedBand(), setLists: lists })} {...handlers()} />);
    expect(screen.getAllByRole('button', { name: /^(Share|Stop sharing) / })).toHaveLength(2);
  });
});

describe('MembersSection', () => {
  const removed = [{ sub: 'sub-bob', name: 'Bob' }];

  it('the owner sees removed members and can restore one by sub', () => {
    const onRestore = vi.fn();
    render(<MembersSection view={view({ isOwner: true, removedMembers: removed })} onRemove={() => {}} onRestore={onRestore} onEditProfile={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Removed' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore Bob' }));
    expect(onRestore).toHaveBeenCalledWith('sub-bob');
  });

  it('a non-owner never sees the removed section even when the data is present', () => {
    render(<MembersSection view={view({ isOwner: false, removedMembers: removed })} onRemove={() => {}} onRestore={() => {}} onEditProfile={() => {}} />);
    expect(screen.queryByRole('heading', { name: 'Removed' })).not.toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('passes onEditProfile through to the current user own row', () => {
    const onEditProfile = vi.fn();
    const mine = { bandId: 'b1', owner: 'sub-me', displayName: 'Me', instruments: ['guitar'], createdAt: 'c' } as unknown as BandView['members'][number];
    render(
      <MembersSection
        view={view({ sub: 'sub-me', members: [mine], displayNames: new Map([['sub-me', 'Me']]) })}
        onRemove={() => {}}
        onRestore={() => {}}
        onEditProfile={onEditProfile}
      />,
    );
    expect(screen.getByRole('list', { name: 'Me plays' })).toHaveTextContent('Guitar');
    fireEvent.click(screen.getByRole('button', { name: 'Edit your name and instruments' }));
    expect(onEditProfile).toHaveBeenCalledTimes(1);
  });

  it('omits the removed section when nobody was removed', () => {
    render(<MembersSection view={view({ isOwner: true })} onRemove={() => {}} onRestore={() => {}} onEditProfile={() => {}} />);
    expect(screen.queryByRole('heading', { name: 'Removed' })).not.toBeInTheDocument();
  });

  it('only wires Remove for the owner', () => {
    const onRemove = vi.fn();
    const base = {
      band: band(),
      members: [{ bandId: 'b1', owner: 'sub-amy', displayName: 'Amy', createdAt: 'c' }] as BandView['members'],
      displayNames: new Map([['sub-amy', 'Amy']]),
    };
    const { unmount } = render(<MembersSection view={view({ ...base, isOwner: false })} onRemove={onRemove} onRestore={() => {}} onEditProfile={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Remove Amy' })).not.toBeInTheDocument();
    unmount();
    render(<MembersSection view={view({ ...base, isOwner: true })} onRemove={onRemove} onRestore={() => {}} onEditProfile={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Amy' }));
    expect(onRemove).toHaveBeenCalledWith('sub-amy', 'Amy');
  });
});

describe('DangerZone', () => {
  it('owners are offered Delete band with the "closes for everyone" explanation', () => {
    const onClick = vi.fn();
    render(<DangerZone isOwner onClick={onClick} />);
    const section = screen.getByRole('region', { name: 'Delete band' });
    expect(within(section).getByText(/closes the band for everyone/)).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('button', { name: 'Delete band' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('members are offered Leave band', () => {
    const onClick = vi.fn();
    render(<DangerZone isOwner={false} onClick={onClick} />);
    const section = screen.getByRole('region', { name: 'Leave band' });
    expect(within(section).getByText(/Leaving removes you/)).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('button', { name: 'Leave band' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
