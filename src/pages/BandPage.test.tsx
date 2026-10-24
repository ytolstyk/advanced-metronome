import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { BandRecord, BandView, ValidMember, ValidSetList } from '../bandTypes';

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: 'authenticated' }),
  Authenticator: () => null,
}));
vi.mock('aws-amplify/data', () => ({ generateClient: vi.fn(() => ({ models: {}, graphql: vi.fn() })) }));
vi.mock('../api/authUtils', () => ({
  getDefaultDisplayName: vi.fn().mockResolvedValue('Alice'),
  isAuthenticated: vi.fn().mockResolvedValue(true),
  getCurrentUserSub: vi.fn().mockResolvedValue('sub-me'),
}));
vi.mock('../api/bandsApi', () => ({
  loadBandView: vi.fn(),
  previewBand: vi.fn(),
  joinBand: vi.fn(),
  dismissBand: vi.fn(),
  ensureMyBandRow: vi.fn().mockResolvedValue(undefined),
  banMember: vi.fn(),
  unbanMember: vi.fn(),
  updateMyProfile: vi.fn(),
  renameBand: vi.fn(),
  resetInviteCode: vi.fn(),
  deleteBand: vi.fn(),
  getInviteIssuedAt: vi.fn().mockResolvedValue(new Date().toISOString()),
  ensureFreshInvite: vi.fn(),
  setInviteTtlDays: vi.fn(),
}));
vi.mock('../api/setListsApi', () => ({
  createSetList: vi.fn(),
  renameSetList: vi.fn(),
  archiveSetList: vi.fn(),
  setSetListShared: vi.fn(),
  deleteMyContent: vi.fn(),
}));

import { BandPage } from './BandPage';
import {
  banMember,
  deleteBand,
  dismissBand,
  ensureMyBandRow,
  joinBand,
  loadBandView,
  previewBand,
  renameBand,
  resetInviteCode,
  setInviteTtlDays,
  unbanMember,
  updateMyProfile,
} from '../api/bandsApi';
import { archiveSetList, createSetList, deleteMyContent, renameSetList, setSetListShared } from '../api/setListsApi';

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
  inviteTtlDays: 1,
  ...over,
});

function makeView(over: Partial<BandView> = {}, b: BandRecord = band()): BandView {
  const members = [
    { bandId: 'band-1', owner: OWNER, displayName: 'Olivia', createdAt: '2026-01-01T00:00:00Z' },
    { bandId: 'band-1', owner: ME, displayName: 'Me', createdAt: '2026-01-01T00:00:01Z' },
    { bandId: 'band-1', owner: BOB, displayName: 'Bob', createdAt: '2026-01-01T00:00:02Z' },
  ] as unknown as ValidMember[];
  return {
    band: b,
    sub: ME,
    isOwner: false,
    isMember: true,
    members,
    memberSubs: new Set([OWNER, ME, BOB]),
    displayNames: new Map([[OWNER, 'Olivia'], [ME, 'Me'], [BOB, 'Bob']]),
    setLists: [{ id: 'sl-1', owner: OWNER, bandId: 'band-1', name: 'Main Set', archivedAt: null }] as unknown as ValidSetList[],
    removedMembers: [],
    incomplete: false,
    ...over,
  };
}
const ownerView = (over: Partial<BandView> = {}) => makeView({ isOwner: true, sub: OWNER, ...over });

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}</div>;
}
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/bands/band-1']}>
      <Routes>
        <Route path="/bands/:bandId" element={<><BandPage /><Where /></>} />
        <Route path="/bands" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}
const load = (view: BandView) => vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BandPage availability link', () => {
  it('a member can open the availability calendar for this band', async () => {
    load(makeView());
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    const section = screen.getByRole('region', { name: 'Availability' });
    expect(within(section).getByRole('link', { name: /Open the availability calendar/ })).toHaveAttribute(
      'href',
      '/bands/band-1/availability',
    );
  });
});

describe('BandPage states', () => {
  it('not found', async () => {
    vi.mocked(loadBandView).mockResolvedValue({ status: 'not-found' });
    renderPage();
    expect(await screen.findByText('Band not found')).toBeInTheDocument();
  });

  it.each([
    ['deleted', 'This band was deleted'],
    ['removed', 'You were removed from this band'],
  ] as const)('%s: offers Dismiss, which drops the rows and returns to the list', async (status, title) => {
    vi.mocked(loadBandView).mockResolvedValue(status === 'removed' ? { status, band: band() } : { status });
    vi.mocked(dismissBand).mockResolvedValue(undefined);
    renderPage();
    expect(await screen.findByText(title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(dismissBand).toHaveBeenCalledWith('band-1'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/bands'));
  });

  it('fails closed with a retry button', async () => {
    vi.mocked(loadBandView).mockRejectedValueOnce(new Error('network')).mockResolvedValue({ status: 'ok', view: makeView() });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('network');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'The Band' })).toBeInTheDocument();
  });

  it('a non-member (shared link) sees a join prompt, not the band contents', async () => {
    load(makeView({ isMember: false }));
    vi.mocked(previewBand).mockResolvedValue({ bandId: 'band-1', bandName: 'The Band', memberCount: 3, alreadyMember: false });
    vi.mocked(joinBand).mockResolvedValue(undefined);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Join The Band?' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Members' })).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Your name in this band'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join band' }));
    await waitFor(() => expect(joinBand).toHaveBeenCalledWith('band-1', 'Bob', []));
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2)); // reloads in place
  });

  it('a banned user cannot join from the link (the API says so)', async () => {
    load(makeView({ isMember: false }));
    vi.mocked(previewBand).mockRejectedValue(Object.assign(new Error('banned'), { reason: 'banned' }));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('You were removed from this band.');
  });
});

describe('BandPage as a member', () => {
  it('shows set lists, the roster with names and badges, and the invite code', async () => {
    load(makeView());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'The Band' })).toBeInTheDocument();
    expect(screen.getByText('3 members')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Main Set/ })).toHaveAttribute('href', '/bands/band-1/setlists/sl-1');
    const roster = screen.getByRole('heading', { name: 'Members' }).closest('section') as HTMLElement;
    expect(within(roster).getByText('Olivia')).toBeInTheDocument();
    expect(within(roster).getByText('Owner')).toBeInTheDocument();
    expect(within(roster).getByText('You')).toBeInTheDocument();
    expect(screen.getByText('ABCDE-FGHJK')).toBeInTheDocument();
  });

  it('members cannot manage the band', async () => {
    load(makeView());
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    for (const name of ['New set list', 'Rename', 'Reset code', 'Delete band']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave band' })).toBeInTheDocument();
  });

  const openLeaveDialog = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Leave band' }));
    await screen.findByRole('heading', { name: 'Leave this band?' });
  };
  const confirmLeave = (label = 'Leave band') => {
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: label }));
  };

  it('leaving deletes my content (songs too by default), then leaves and returns to the list', async () => {
    load(makeView());
    vi.mocked(deleteMyContent).mockResolvedValue(undefined);
    vi.mocked(dismissBand).mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    await openLeaveDialog();
    expect(dismissBand).not.toHaveBeenCalled(); // confirm first
    confirmLeave();
    await waitFor(() => expect(dismissBand).toHaveBeenCalledWith('band-1'));
    expect(deleteMyContent).toHaveBeenCalledWith(expect.objectContaining({ id: 'band-1' }), true);
    expect(vi.mocked(deleteMyContent).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(dismissBand).mock.invocationCallOrder[0]);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/bands'));
  });

  it('unticking "also delete my songs" keeps them', async () => {
    load(makeView());
    vi.mocked(deleteMyContent).mockResolvedValue(undefined);
    vi.mocked(dismissBand).mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    await openLeaveDialog();
    fireEvent.click(screen.getByLabelText('Also delete the songs I suggested'));
    confirmLeave();
    await waitFor(() => expect(dismissBand).toHaveBeenCalled());
    expect(deleteMyContent).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('when the cleanup fails it says so and offers "Leave anyway" (it does not silently leave data behind)', async () => {
    load(makeView());
    vi.mocked(deleteMyContent).mockRejectedValue(new Error('throttled'));
    vi.mocked(dismissBand).mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    await openLeaveDialog();
    confirmLeave();
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t remove all of your content');
    expect(dismissBand).not.toHaveBeenCalled(); // still a member until they choose
    expect(screen.getByTestId('where')).toHaveTextContent('/bands/band-1');

    confirmLeave('Leave anyway');
    await waitFor(() => expect(dismissBand).toHaveBeenCalledWith('band-1'));
    expect(deleteMyContent).toHaveBeenCalledTimes(1); // the retry skipped the cleanup
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/bands'));
  });

  it('repairs a missing "my bands" row for a member who opens the band by link', async () => {
    load(makeView());
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    await waitFor(() => expect(ensureMyBandRow).toHaveBeenCalledWith('band-1'));
  });

  it('copies the invite link', async () => {
    load(makeView());
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/bands?join=ABCDEFGHJK`));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('says so when the invite link could not be copied, and clears the warning once a copy works', async () => {
    load(makeView());
    const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(await screen.findByText(/Couldn’t copy automatically/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
    await waitFor(() => expect(screen.queryByText(/Couldn’t copy automatically/)).not.toBeInTheDocument());
  });

  it('locks the "also delete my songs" choice once the cleanup has failed (the retry ignores it)', async () => {
    load(makeView());
    vi.mocked(deleteMyContent).mockRejectedValue(new Error('throttled'));
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    await openLeaveDialog();
    expect(screen.getByLabelText('Also delete the songs I suggested')).toBeEnabled();
    confirmLeave();
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Also delete the songs I suggested')).toBeDisabled();
  });

  it('warns when the roster may be incomplete', async () => {
    load(makeView({ incomplete: true }));
    renderPage();
    expect(await screen.findByRole('status')).toHaveTextContent('Some members may be missing');
  });
});

describe('BandPage profile', () => {
  const withProfile = (instruments?: string[]): BandView => {
    const view = makeView();
    return {
      ...view,
      members: view.members.map((m) => (m.owner === ME ? ({ ...m, instruments } as ValidMember) : m)),
    };
  };
  const roster = () => screen.getByRole('region', { name: 'Members' });

  it('shows members instruments in the roster', async () => {
    load(withProfile(['guitar', 'vocals']));
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    expect(within(roster()).getByRole('list', { name: 'Me plays' })).toHaveTextContent('GuitarVocals');
  });

  it('opens a dialog prefilled from my own Member row, saves, then reloads in place', async () => {
    load(withProfile(['bass']));
    vi.mocked(updateMyProfile).mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    fireEvent.click(within(roster()).getByRole('button', { name: 'Edit your name and instruments' }));
    expect(await screen.findByRole('heading', { name: 'Your profile in The Band' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your name in this band')).toHaveValue('Me');
    expect(screen.getByRole('button', { name: 'Bass' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Your name in this band'), { target: { value: 'Mo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Drums' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith('band-1', 'Mo', ['bass', 'drums']));
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Your profile in The Band' })).not.toBeInTheDocument());
  });

  it('a member with no instruments gets an "Add instruments" entry point and an empty picker', async () => {
    load(withProfile(undefined));
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    fireEvent.click(within(roster()).getByRole('button', { name: 'Add instruments to your profile' }));
    expect(await screen.findByRole('heading', { name: 'Your profile in The Band' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
  });

  it('only my own row has the edit button (never other members)', async () => {
    load(withProfile(['keys']));
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    expect(within(roster()).getAllByRole('button', { name: 'Edit your name and instruments' })).toHaveLength(1);
  });

  it('starts with an empty name (never a disambiguated label) when the viewer (the owner) has no Member row', async () => {
    const view = ownerView();
    load({
      ...view,
      members: view.members.filter((m) => m.owner !== OWNER),
      displayNames: new Map([[OWNER, 'Owner Olivia'], [BOB, 'Bob']]),
    });
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    fireEvent.click(within(roster()).getByRole('button', { name: 'Add instruments to your profile' }));
    expect(await screen.findByLabelText('Your name in this band')).toHaveValue('');
  });

  it('a failed save stays open with the message and still reloads the page data', async () => {
    load(withProfile(['bass']));
    vi.mocked(updateMyProfile).mockRejectedValue(new Error('Join the band first'));
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    fireEvent.click(within(roster()).getByRole('button', { name: 'Edit your name and instruments' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Join the band first');
    expect(screen.getByRole('heading', { name: 'Your profile in The Band' })).toBeInTheDocument();
  });
});

describe('BandPage as the owner', () => {
  it('can remove a member after confirming, then reloads', async () => {
    load(ownerView());
    vi.mocked(banMember).mockResolvedValue(band());
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    expect(screen.queryByRole('button', { name: 'Remove Olivia' })).not.toBeInTheDocument(); // never the owner
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bob' }));
    expect(banMember).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(banMember).toHaveBeenCalledWith('band-1', BOB));
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
  });

  it('can restore a removed member', async () => {
    load(ownerView({ removedMembers: [{ sub: 'sub-carl', name: 'Carl' }] }));
    vi.mocked(unbanMember).mockResolvedValue(band());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Carl' }));
    await waitFor(() => expect(unbanMember).toHaveBeenCalledWith('band-1', 'sub-carl'));
  });

  it('members never see the Removed section', async () => {
    load(makeView({ removedMembers: [{ sub: 'sub-carl', name: 'Carl' }] }));
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    expect(screen.queryByText('Carl')).not.toBeInTheDocument();
  });

  it('reset code explains it only stops new joiners, then resets and reloads', async () => {
    load(ownerView());
    vi.mocked(resetInviteCode).mockResolvedValue(band());
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset code' }));
    expect(await screen.findByText(/only stops people who don’t already have/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset code' }).at(-1)!);
    await waitFor(() => expect(resetInviteCode).toHaveBeenCalledWith('band-1'));
  });

  it('the owner changes how long invite links work, and the page reloads', async () => {
    load(ownerView());
    vi.mocked(setInviteTtlDays).mockResolvedValue(band({ inviteTtlDays: 4 }));
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    const loadsBefore = vi.mocked(loadBandView).mock.calls.length;
    fireEvent.change(screen.getByLabelText('Invite links work for'), { target: { value: '4' } });
    await waitFor(() => expect(setInviteTtlDays).toHaveBeenCalledWith('band-1', 4));
    await waitFor(() => expect(vi.mocked(loadBandView).mock.calls.length).toBeGreaterThan(loadsBefore));
  });

  it('members do not get the lifetime setting', async () => {
    load(makeView());
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    expect(screen.queryByLabelText('Invite links work for')).not.toBeInTheDocument();
  });

  it('creates, renames and archives set lists', async () => {
    load(ownerView());
    vi.mocked(createSetList).mockResolvedValue('sl-2');
    vi.mocked(renameSetList).mockResolvedValue(undefined);
    vi.mocked(archiveSetList).mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });

    fireEvent.click(screen.getByRole('button', { name: 'New set list' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Gig 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(createSetList).toHaveBeenCalledWith('band-1', 'Gig 1'));

    fireEvent.click(screen.getByRole('button', { name: 'Rename Main Set' }));
    const field = await screen.findByLabelText('Name');
    expect(field).toHaveValue('Main Set');
    fireEvent.change(field, { target: { value: 'Opening' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(renameSetList).toHaveBeenCalledWith('sl-1', 'Opening'));

    fireEvent.click(screen.getByRole('button', { name: 'Archive Main Set' }));
    expect(archiveSetList).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(archiveSetList).toHaveBeenCalledWith('band-1', 'sl-1'));
  });

  it('the owner can share a set list: calls setSetListShared(band, list, true), then reloads', async () => {
    load(ownerView());
    vi.mocked(setSetListShared).mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    expect(screen.getByText('Not shared')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy share link/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share Main Set' }));
    // Sharing publishes more than the list, so nothing is written until the owner confirms.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('invite code');
    expect(dialog).toHaveTextContent('can’t take that access back');
    // The exposure includes members' availability, so the owner is told before agreeing.
    expect(dialog).toHaveTextContent('each member’s availability');
    expect(setSetListShared).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(setSetListShared).toHaveBeenCalledWith('band-1', 'sl-1', true));
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
  });

  it('cancelling the share confirmation writes nothing', async () => {
    load(ownerView());
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    fireEvent.click(screen.getByRole('button', { name: 'Share Main Set' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(setSetListShared).not.toHaveBeenCalled();
  });

  it('the owner can stop sharing a shared set list (and sees its copy-link button meanwhile)', async () => {
    load(ownerView({ band: band({ sharedSetListIds: ['sl-1'] }) }));
    vi.mocked(setSetListShared).mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    expect(screen.getByText('Shared')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy share link for Main Set' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing Main Set' }));
    await waitFor(() => expect(setSetListShared).toHaveBeenCalledWith('band-1', 'sl-1', false));
  });

  it('a failed share toggle shows the error and STILL reloads, so the label never lies', async () => {
    load(ownerView());
    vi.mocked(setSetListShared).mockRejectedValue(new Error('The band changed while you were editing. Please retry.'));
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    fireEvent.click(screen.getByRole('button', { name: 'Share Main Set' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Share' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The band changed');
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
  });

  it('members see the Shared status and a copy link, but cannot toggle sharing', async () => {
    load(makeView({ band: band({ sharedSetListIds: ['sl-1'] }) }));
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    expect(screen.getByText('Shared')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy share link for Main Set' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Share|Stop sharing) / })).not.toBeInTheDocument();
    expect(setSetListShared).not.toHaveBeenCalled();
  });

  it('hides "New set list" at the cap', async () => {
    const full = band({ setListIds: Array.from({ length: 10 }, (_, i) => `sl-${i}`) });
    vi.mocked(loadBandView).mockResolvedValue({ status: 'ok', view: ownerView({ band: full }) });
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    expect(screen.queryByRole('button', { name: 'New set list' })).not.toBeInTheDocument();
  });

  it('renames the band', async () => {
    load(ownerView());
    vi.mocked(renameBand).mockResolvedValue(band());
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(await screen.findByLabelText('Band name'), { target: { value: 'New Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(renameBand).toHaveBeenCalledWith('band-1', 'New Name'));
  });

  it('deleting the band shows progress, then dismisses it and returns to the list', async () => {
    load(ownerView());
    vi.mocked(deleteBand).mockImplementation(async (_id, onProgress) => {
      onProgress?.('tombstone');
      onProgress?.('done');
    });
    vi.mocked(dismissBand).mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    expect(screen.queryByRole('button', { name: 'Leave band' })).not.toBeInTheDocument(); // owner can only delete
    fireEvent.click(screen.getByRole('button', { name: 'Delete band' }));
    expect(deleteBand).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete band' }).at(-1)!);
    await waitFor(() => expect(deleteBand).toHaveBeenCalledWith('band-1', expect.any(Function)));
    await waitFor(() => expect(dismissBand).toHaveBeenCalledWith('band-1'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/bands'));
  });

  it('a failed delete refreshes the page, so it never keeps showing state the attempt changed', async () => {
    load(ownerView());
    vi.mocked(deleteBand).mockRejectedValue(new Error('throttled'));
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete band' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete band' }).at(-1)!);
    await waitFor(() => expect(loadBandView).toHaveBeenCalledTimes(2));
  });

  it('a failed delete shows the error and keeps the band open', async () => {
    load(ownerView());
    vi.mocked(deleteBand).mockRejectedValue(new Error('The band changed while you were editing. Please retry.'));
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete band' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete band' }).at(-1)!);
    expect(await screen.findByRole('alert')).toHaveTextContent('The band changed');
    expect(dismissBand).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/bands/band-1');
  });
});
