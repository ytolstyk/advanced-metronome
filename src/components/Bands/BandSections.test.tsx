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
  const handlers = () => ({ onCreate: vi.fn(), onRename: vi.fn(), onArchive: vi.fn(), onToggleShared: vi.fn() });

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

describe('SetListsSection public sharing', () => {
  const handlers = () => ({ onCreate: vi.fn(), onRename: vi.fn(), onArchive: vi.fn(), onToggleShared: vi.fn() });
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
    render(<MembersSection view={view({ isOwner: true, removedMembers: removed })} onRemove={() => {}} onRestore={onRestore} />);
    expect(screen.getByRole('heading', { name: 'Removed' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore Bob' }));
    expect(onRestore).toHaveBeenCalledWith('sub-bob');
  });

  it('a non-owner never sees the removed section even when the data is present', () => {
    render(<MembersSection view={view({ isOwner: false, removedMembers: removed })} onRemove={() => {}} onRestore={() => {}} />);
    expect(screen.queryByRole('heading', { name: 'Removed' })).not.toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('omits the removed section when nobody was removed', () => {
    render(<MembersSection view={view({ isOwner: true })} onRemove={() => {}} onRestore={() => {}} />);
    expect(screen.queryByRole('heading', { name: 'Removed' })).not.toBeInTheDocument();
  });

  it('only wires Remove for the owner', () => {
    const onRemove = vi.fn();
    const base = {
      band: band(),
      members: [{ bandId: 'b1', owner: 'sub-amy', displayName: 'Amy', createdAt: 'c' }] as BandView['members'],
      displayNames: new Map([['sub-amy', 'Amy']]),
    };
    const { unmount } = render(<MembersSection view={view({ ...base, isOwner: false })} onRemove={onRemove} onRestore={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Remove Amy' })).not.toBeInTheDocument();
    unmount();
    render(<MembersSection view={view({ ...base, isOwner: true })} onRemove={onRemove} onRestore={() => {}} />);
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
