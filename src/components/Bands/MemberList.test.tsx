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
  ...over,
});
const member = (owner: string): ValidMember =>
  ({ bandId: 'b1', owner, displayName: owner, createdAt: '2026-01-01T00:00:00Z' }) as ValidMember;

function makeView(opts: {
  members: string[];
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
    members: opts.members.map(member),
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
});
