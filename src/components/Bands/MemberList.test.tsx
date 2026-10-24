import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemberList } from './MemberList';
import type { BandRecord, BandView, ValidMember } from '../../bandTypes';

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
const member = (owner: string, instruments?: string[]): ValidMember =>
  ({ bandId: 'b1', owner, displayName: owner, instruments, createdAt: '2026-01-01T00:00:00Z' }) as ValidMember;

function makeView(opts: {
  members: string[];
  instruments?: Record<string, string[]>;
  names: Record<string, string>;
  me?: string;
  owner?: string;
}): BandView {
  const owner = opts.owner ?? 'sub-owner';
  return {
    band: band({ owner }),
    sub: opts.me ?? 'sub-me',
    isOwner: (opts.me ?? 'sub-me') === owner,
    isMember: true,
    members: opts.members.map((sub) => member(sub, opts.instruments?.[sub])),
    memberSubs: new Set(opts.members),
    displayNames: new Map(Object.entries(opts.names)),
    setLists: [],
    removedMembers: [],
    incomplete: false,
  };
}

const rowNames = () =>
  screen.getAllByRole('listitem').map((li) => (li.querySelector('span')?.firstChild?.textContent ?? '').trim());

describe('MemberList', () => {
  it('lists the owner first, then everyone else alphabetically by display name', () => {
    const view = makeView({
      members: ['sub-zed', 'sub-owner', 'sub-amy', 'sub-me'],
      names: { 'sub-zed': 'Zed', 'sub-owner': 'Zoe (owner)', 'sub-amy': 'Amy', 'sub-me': 'Mo' },
    });
    render(<MemberList view={view} />);
    expect(rowNames()).toEqual(['Zoe (owner)', 'Amy', 'Mo', 'Zed']);
  });

  it('still shows the owner when they have no Member row, labelled "Owner" when no name is known', () => {
    const view = makeView({ members: ['sub-amy'], names: { 'sub-amy': 'Amy' } });
    render(<MemberList view={view} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Owner');
    expect(within(items[0]).getAllByText('Owner')).toHaveLength(2); // fallback name + badge
    expect(items[1]).toHaveTextContent('Amy');
  });

  it('does not duplicate the owner when they do have a Member row', () => {
    const view = makeView({ members: ['sub-owner', 'sub-amy'], names: { 'sub-owner': 'Olga', 'sub-amy': 'Amy' } });
    render(<MemberList view={view} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByText('Olga')).toHaveLength(1);
  });

  it('marks the owner and the current user with badges', () => {
    const view = makeView({
      members: ['sub-owner', 'sub-me', 'sub-amy'],
      names: { 'sub-owner': 'Olga', 'sub-me': 'Mo', 'sub-amy': 'Amy' },
    });
    render(<MemberList view={view} />);
    const [olga, amy, mo] = screen.getAllByRole('listitem');
    expect(olga).toHaveTextContent('OlgaOwner');
    expect(olga).not.toHaveTextContent('You');
    expect(amy).not.toHaveTextContent('Owner');
    expect(amy).not.toHaveTextContent('You');
    expect(mo).toHaveTextContent('MoYou');
  });

  it('shows both badges when the current user is the owner', () => {
    const view = makeView({ members: ['sub-owner'], names: { 'sub-owner': 'Olga' }, me: 'sub-owner' });
    render(<MemberList view={view} />);
    expect(screen.getByRole('listitem')).toHaveTextContent('OlgaOwnerYou');
  });

  it('shows no Remove buttons without an onRemove handler', () => {
    const view = makeView({ members: ['sub-owner', 'sub-amy'], names: { 'sub-owner': 'Olga', 'sub-amy': 'Amy' } });
    render(<MemberList view={view} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers Remove on every row except the owner and reports the sub and name', () => {
    const onRemove = vi.fn();
    const view = makeView({
      members: ['sub-owner', 'sub-amy', 'sub-me'],
      names: { 'sub-owner': 'Olga', 'sub-amy': 'Amy', 'sub-me': 'Mo' },
      me: 'sub-owner',
    });
    render(<MemberList view={view} onRemove={onRemove} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Remove Olga' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Amy' }));
    expect(onRemove).toHaveBeenCalledWith('sub-amy', 'Amy');
  });

  it('falls back to the "Owner" name for a member whose display name is unknown', () => {
    const view = makeView({ members: ['sub-owner', 'sub-ghost'], names: { 'sub-owner': 'Olga' } });
    render(<MemberList view={view} onRemove={() => {}} />);
    expect(screen.getByRole('button', { name: 'Remove Owner' })).toBeInTheDocument();
  });

  describe('instruments', () => {
    const playsList = (name: string) => screen.getByRole('list', { name: `${name} plays` });

    it('shows each member instruments as a labelled list, in palette order', () => {
      const view = makeView({
        members: ['sub-owner', 'sub-amy'],
        names: { 'sub-owner': 'Olga', 'sub-amy': 'Amy' },
        instruments: { 'sub-amy': ['vocals', 'guitar'] },
      });
      render(<MemberList view={view} />);
      expect(within(playsList('Amy')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Guitar', 'Vocals']);
    });

    it('shows no instrument list for a member with none or with an absent field', () => {
      const view = makeView({
        members: ['sub-owner', 'sub-amy'],
        names: { 'sub-owner': 'Olga', 'sub-amy': 'Amy' },
        instruments: { 'sub-owner': [] },
      });
      render(<MemberList view={view} />);
      expect(screen.queryByRole('list', { name: /plays/ })).not.toBeInTheDocument();
    });

    it('ignores unknown keys in a hostile row: the known ones show, the member stays on the roster', () => {
      const view = makeView({
        members: ['sub-owner', 'sub-amy'],
        names: { 'sub-owner': 'Olga', 'sub-amy': 'Amy' },
        instruments: { 'sub-amy': ['<script>', 'laser-harp', 'drums', 'drums'] },
      });
      render(<MemberList view={view} />);
      expect(screen.getByText('Amy')).toBeInTheDocument();
      expect(within(playsList('Amy')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Drums']);
      expect(screen.queryByText('laser-harp')).not.toBeInTheDocument();
    });

    it('shows no list at all when every key is unknown', () => {
      const view = makeView({
        members: ['sub-owner', 'sub-amy'],
        names: { 'sub-owner': 'Olga', 'sub-amy': 'Amy' },
        instruments: { 'sub-amy': ['laser-harp'] },
      });
      render(<MemberList view={view} />);
      expect(screen.queryByRole('list', { name: /plays/ })).not.toBeInTheDocument();
    });

    it('keeps the instruments with the right member when the owner has no Member row', () => {
      const view = makeView({ members: ['sub-amy'], names: { 'sub-amy': 'Amy' }, instruments: { 'sub-amy': ['bass'] } });
      render(<MemberList view={view} />);
      expect(within(playsList('Amy')).getByText('Bass')).toBeInTheDocument();
    });
  });

  describe('edit profile button', () => {
    const names = { 'sub-owner': 'Olga', 'sub-me': 'Mo', 'sub-amy': 'Amy' };
    const editButtons = () => screen.queryAllByRole('button', { name: /^(Edit your name and instruments|Add instruments to your profile)$/ });

    it('is not shown without an onEditProfile handler', () => {
      render(<MemberList view={makeView({ members: ['sub-owner', 'sub-me'], names })} />);
      expect(editButtons()).toHaveLength(0);
    });

    it('appears only on the current user own row, and says "Add instruments" when they have none', () => {
      const onEditProfile = vi.fn();
      const view = makeView({ members: ['sub-owner', 'sub-me', 'sub-amy'], names });
      render(<MemberList view={view} onEditProfile={onEditProfile} />);
      expect(editButtons()).toHaveLength(1);
      const mine = screen.getByText('Mo').closest('li')!;
      expect(within(mine).getByRole('button', { name: 'Add instruments to your profile' })).toHaveTextContent('Add instruments');
      fireEvent.click(editButtons()[0]);
      expect(onEditProfile).toHaveBeenCalledTimes(1);
    });

    it('says "Edit" once the current user has picked instruments', () => {
      const view = makeView({ members: ['sub-owner', 'sub-me'], names, instruments: { 'sub-me': ['keys'] } });
      render(<MemberList view={view} onEditProfile={() => {}} />);
      expect(editButtons()[0]).toHaveTextContent(/^Edit$/);
    });

    it('still says "Add instruments" when the only stored keys are unknown', () => {
      const view = makeView({ members: ['sub-owner', 'sub-me'], names, instruments: { 'sub-me': ['laser-harp'] } });
      render(<MemberList view={view} onEditProfile={() => {}} />);
      expect(editButtons()[0]).toHaveTextContent('Add instruments');
    });

    it('is on the owner row when the owner is the current user, next to no Remove button', () => {
      const view = makeView({ members: ['sub-owner', 'sub-amy'], names, me: 'sub-owner' });
      render(<MemberList view={view} onEditProfile={() => {}} onRemove={() => {}} />);
      const olga = screen.getByText('Olga').closest('li')!;
      expect(within(olga).getByRole('button', { name: 'Add instruments to your profile' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remove Olga' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove Amy' })).toBeInTheDocument();
    });

    it('is not shown at all when the current user is not on the roster', () => {
      const view = makeView({ members: ['sub-owner', 'sub-amy'], names, me: 'sub-stranger' });
      render(<MemberList view={view} onEditProfile={() => {}} />);
      expect(editButtons()).toHaveLength(0);
    });
  });
});
