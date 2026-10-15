import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { BandRecord, MyBandEntry } from '../bandTypes';

const auth = vi.hoisted(() => ({ status: 'authenticated' as 'authenticated' | 'unauthenticated' }));

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: auth.status }),
  Authenticator: () => null,
}));
vi.mock('aws-amplify/data', () => ({ generateClient: vi.fn(() => ({ models: {}, graphql: vi.fn() })) }));
vi.mock('../api/authUtils', () => ({
  getDefaultDisplayName: vi.fn().mockResolvedValue('Alice'),
  isAuthenticated: vi.fn().mockResolvedValue(true),
  getCurrentUserSub: vi.fn().mockResolvedValue('sub-me'),
}));
vi.mock('../api/bandsApi', () => ({
  loadMyBands: vi.fn(),
  pruneDeadBands: vi.fn().mockResolvedValue(undefined),
  createBand: vi.fn(),
  lookupInvite: vi.fn(),
  previewBand: vi.fn(),
  joinBand: vi.fn(),
  dismissBand: vi.fn(),
}));

import { BandsPage } from './BandsPage';
import { createBand, dismissBand, joinBand, loadMyBands, lookupInvite, pruneDeadBands } from '../api/bandsApi';

const band = (over: Partial<BandRecord> = {}): BandRecord => ({
  id: 'band-1',
  owner: 'sub-owner',
  name: 'The Band',
  inviteCode: 'ABCDEFGHJK',
  deletedAt: null,
  version: 1,
  setListIds: [],
  archivedSetListIds: [],
  bannedSubs: [],
  hiddenSongIds: [],
  ...over,
});
const entry = (over: Partial<MyBandEntry> = {}): MyBandEntry => ({ band: band(), status: 'active', isOwner: false, ...over });
const result = (entries: MyBandEntry[] = [], extra: { failedCount?: number; deadBandIds?: string[] } = {}) => ({
  entries,
  failedCount: 0,
  deadBandIds: [],
  ...extra,
});

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}
function renderAt(url = '/bands') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/bands" element={<><BandsPage /><Where /></>} />
        <Route path="/bands/:bandId" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.status = 'authenticated';
  sessionStorage.clear();
  vi.mocked(loadMyBands).mockResolvedValue(result());
});

describe('BandsPage signed out', () => {
  it('shows the sign-in gate and calls no APIs', () => {
    auth.status = 'unauthenticated';
    renderAt();
    expect(screen.getByText('Sign in to create or join a band')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create a band' })).not.toBeInTheDocument();
    expect(loadMyBands).not.toHaveBeenCalled();
  });

  it('keeps a shared join code in session storage and strips it from the URL', async () => {
    auth.status = 'unauthenticated';
    renderAt('/bands?join=ABCDE-FGHJK');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/bands$/));
    expect(sessionStorage.getItem('band-join-code')).toBe('ABCDE-FGHJK');
    expect(localStorage.getItem('band-join-code')).toBeNull();
  });
});

describe('BandsPage signed in', () => {
  it('shows an empty state with both actions', async () => {
    renderAt();
    expect(await screen.findByText(/not in a band yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a band' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join with a code' })).toBeInTheDocument();
  });

  it('lists bands with a role label and links to each band', async () => {
    vi.mocked(loadMyBands).mockResolvedValue(
      result([
        entry({ band: band({ id: 'b1', name: 'Alpha' }), isOwner: true }),
        entry({ band: band({ id: 'b2', name: 'Bravo' }) }),
      ]),
    );
    renderAt();
    const alpha = await screen.findByRole('link', { name: /Alpha/ });
    expect(alpha).toHaveAttribute('href', '/bands/b1');
    expect(alpha).toHaveTextContent('Owner');
    expect(screen.getByRole('link', { name: /Bravo/ })).toHaveTextContent('Member');
  });

  it('offers Dismiss for a band you were removed from, then reloads', async () => {
    vi.mocked(loadMyBands).mockResolvedValueOnce(result([entry({ status: 'removed' })])).mockResolvedValue(result());
    vi.mocked(dismissBand).mockResolvedValue(undefined);
    renderAt();
    expect(await screen.findByText('You were removed from this band.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(dismissBand).toHaveBeenCalledWith('band-1'));
    expect(await screen.findByText(/not in a band yet/)).toBeInTheDocument();
  });

  it('shows a retryable error instead of an empty list when loading fails', async () => {
    vi.mocked(loadMyBands).mockRejectedValueOnce(new Error('network')).mockResolvedValue(result([entry()]));
    renderAt();
    expect(await screen.findByRole('alert')).toHaveTextContent('network');
    expect(screen.queryByText(/not in a band yet/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /The Band/ })).toBeInTheDocument();
  });

  it('warns when some bands could not be loaded instead of pretending the list is complete', async () => {
    vi.mocked(loadMyBands).mockResolvedValue(result([entry()], { failedCount: 2 }));
    renderAt();
    expect(await screen.findByRole('status')).toHaveTextContent('2 bands couldn’t be loaded');
    expect(screen.getByRole('link', { name: /The Band/ })).toBeInTheDocument();
  });

  it('does not claim "no bands" when every read failed', async () => {
    vi.mocked(loadMyBands).mockResolvedValue(result([], { failedCount: 1 }));
    renderAt();
    expect(await screen.findByRole('status')).toHaveTextContent('1 band couldn’t be loaded');
    expect(screen.queryByText(/not in a band yet/)).not.toBeInTheDocument();
  });

  it('drops tombstoned bands from the list explicitly (loading itself never writes)', async () => {
    vi.mocked(loadMyBands).mockResolvedValue(result([], { deadBandIds: ['b-dead'] }));
    renderAt();
    await waitFor(() => expect(pruneDeadBands).toHaveBeenCalledWith(['b-dead']));
  });

  it('creates a band with a prefilled display name and opens it', async () => {
    vi.mocked(createBand).mockResolvedValue(band({ id: 'new-band' }));
    renderAt();
    await screen.findByText(/not in a band yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Create a band' }));
    fireEvent.change(await screen.findByLabelText('Band name'), { target: { value: 'My Band' } });
    await waitFor(() => expect(screen.getByLabelText('Your name in this band')).toHaveValue('Alice'));
    fireEvent.click(screen.getByRole('button', { name: 'Create band' }));
    await waitFor(() => expect(createBand).toHaveBeenCalledWith('My Band', 'Alice'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/bands/new-band'));
  });

  it('shows create errors inline and does not navigate', async () => {
    vi.mocked(createBand).mockRejectedValue(new Error('You can own at most 10 bands'));
    renderAt();
    await screen.findByText(/not in a band yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Create a band' }));
    fireEvent.change(await screen.findByLabelText('Band name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create band' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at most 10 bands');
  });

  it('joins by code: lookup → confirm name → join → opens the band', async () => {
    vi.mocked(lookupInvite).mockResolvedValue({ bandId: 'band-9', bandName: 'Nine', memberCount: 3, alreadyMember: false });
    vi.mocked(joinBand).mockResolvedValue(undefined);
    renderAt();
    await screen.findByText(/not in a band yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Join with a code' }));
    fireEvent.change(await screen.findByLabelText('Invite code'), { target: { value: 'abcde-fghjk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Nine')).toBeInTheDocument();
    expect(screen.getByText(/3 members/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your name in this band'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join band' }));
    await waitFor(() => expect(joinBand).toHaveBeenCalledWith('band-9', 'Bob'));
    expect(lookupInvite).toHaveBeenCalledWith('abcde-fghjk');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/bands/band-9'));
  });

  it.each([
    ['not-found', 'No band found for that code.'],
    ['revoked', 'no longer valid'],
    ['deleted', 'has been deleted'],
    ['banned', 'You were removed from this band.'],
    ['full', 'This band is full (15 members).'],
    ['invalid-code', 'doesn’t look right'],
  ] as const)('explains a %s invite in plain words', async (reason, text) => {
    vi.mocked(lookupInvite).mockRejectedValue(Object.assign(new Error(reason), { reason }));
    renderAt();
    await screen.findByText(/not in a band yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Join with a code' }));
    fireEvent.change(await screen.findByLabelText('Invite code'), { target: { value: 'whatever' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(joinBand).not.toHaveBeenCalled();
  });

  it('opens the join dialog with the code from a shared link', async () => {
    sessionStorage.setItem('band-join-code', 'ABCDE-FGHJK');
    renderAt();
    expect(await screen.findByLabelText('Invite code')).toHaveValue('ABCDE-FGHJK');
  });

  it('forgets the shared code once the dialog is dismissed', async () => {
    sessionStorage.setItem('band-join-code', 'ABCDE-FGHJK');
    renderAt();
    await screen.findByLabelText('Invite code');
    fireEvent.keyDown(screen.getByLabelText('Invite code'), { key: 'Escape' });
    await waitFor(() => expect(sessionStorage.getItem('band-join-code')).toBeNull());
  });
});
