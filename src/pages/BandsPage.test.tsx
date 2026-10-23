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
  sharedSetListIds: [],
  inviteTtlDays: 1,
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
  localStorage.clear();
  vi.mocked(loadMyBands).mockResolvedValue(result());
});

describe('BandsPage signed out', () => {
  it('shows the sign-in gate and calls no APIs', () => {
    auth.status = 'unauthenticated';
    renderAt();
    expect(screen.getByRole('heading', { name: 'Bands are for signed-in users' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in or create an account' })).toBeInTheDocument();
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

describe('BandsPage shared invite link', () => {
  const failWith = (reason: string) => vi.mocked(lookupInvite).mockRejectedValue(Object.assign(new Error(reason), { reason }));
  const preview = { bandId: 'band-9', bandName: 'Cream', memberCount: 2, alreadyMember: false };

  it('an expired link gets a friendly page telling them to ask the owner for a new one', async () => {
    failWith('expired');
    renderAt('/bands?join=ABCDE-FGHJK');
    expect(await screen.findByRole('heading', { name: 'This invite link has expired' })).toBeInTheDocument();
    expect(screen.getByText(/Ask the band owner to send you a new link/)).toBeInTheDocument();
    expect(lookupInvite).toHaveBeenCalledWith('ABCDE-FGHJK');
    expect(sessionStorage.getItem('band-join-code')).toBeNull(); // a dead code is forgotten at once
    // the notice replaces the list and the join dialog is not opened over it
    expect(screen.queryByRole('button', { name: 'Create a band' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a link the owner replaced gets the same page with its own wording', async () => {
    failWith('revoked');
    renderAt('/bands?join=ABCDE-FGHJK');
    expect(await screen.findByRole('heading', { name: 'This invite link is no longer valid' })).toBeInTheDocument();
    expect(screen.getByText(/replaced this link with a newer one/)).toBeInTheDocument();
  });

  it('"Back to my bands" shows the normal page and forgets the dead code', async () => {
    failWith('expired');
    vi.mocked(loadMyBands).mockResolvedValue(result([entry({ band: band({ name: 'Alpha' }) })]));
    renderAt('/bands?join=ABCDE-FGHJK');
    fireEvent.click(await screen.findByRole('button', { name: 'Back to my bands' }));
    expect(await screen.findByRole('link', { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'This invite link has expired' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('band-join-code')).toBeNull();
  });

  it('"Enter a new code" opens the join dialog with an empty code', async () => {
    failWith('expired');
    renderAt('/bands?join=ABCDE-FGHJK');
    fireEvent.click(await screen.findByRole('button', { name: 'Enter a new code' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Invite code')).toHaveValue('');
    expect(sessionStorage.getItem('band-join-code')).toBeNull();
  });

  it('a good link goes straight to "Join <band>?" without asking for the code again', async () => {
    vi.mocked(lookupInvite).mockResolvedValue(preview);
    renderAt('/bands?join=ABCDE-FGHJK');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText(/Cream/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument();
    expect(lookupInvite).toHaveBeenCalledTimes(1);
  });

  it('other failures (banned, full, offline) open the dialog with the code filled in AND the reason shown', async () => {
    failWith('banned');
    renderAt('/bands?join=ABCDE-FGHJK');
    expect(await screen.findByLabelText('Invite code')).toHaveValue('ABCDE-FGHJK');
    expect(screen.getByRole('alert')).toHaveTextContent('You were removed from this band.');
    expect(screen.queryByRole('heading', { name: /invite link/ })).not.toBeInTheDocument();
    expect(lookupInvite).toHaveBeenCalledTimes(1); // the failure is shown, not re-fetched
  });

  it('shows nothing clickable (and no flash of the band list) while the link is being checked', async () => {
    vi.mocked(loadMyBands).mockResolvedValue(result([entry({ band: band({ name: 'Alpha' }) })]));
    let finish: (e: unknown) => void = () => {};
    vi.mocked(lookupInvite).mockReturnValue(new Promise((_, reject) => { finish = reject; }));
    renderAt('/bands?join=ABCDE-FGHJK');
    expect(await screen.findByText('Checking your invite link…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create a band' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Alpha/ })).not.toBeInTheDocument();
    finish(Object.assign(new Error('x'), { reason: 'expired' }));
    expect(await screen.findByRole('heading', { name: 'This invite link has expired' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Alpha/ })).not.toBeInTheDocument();
  });

  it('the notice is a second-level heading under the page\u2019s own title', async () => {
    failWith('expired');
    renderAt('/bands?join=ABCDE-FGHJK');
    expect(await screen.findByRole('heading', { level: 2, name: 'This invite link has expired' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('no link means no lookup and no dialog', async () => {
    renderAt('/bands');
    expect(await screen.findByRole('button', { name: 'Create a band' })).toBeInTheDocument();
    expect(lookupInvite).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a code kept across sign-in is checked too', async () => {
    sessionStorage.setItem('band-join-code', 'ABCDEFGHJK');
    failWith('expired');
    renderAt('/bands');
    expect(await screen.findByRole('heading', { name: 'This invite link has expired' })).toBeInTheDocument();
    expect(lookupInvite).toHaveBeenCalledWith('ABCDEFGHJK');
  });
});

describe('BandsPage "Only bands I’m in" filter', () => {
  const KEY = 'bands-only-mine';
  const checkbox = () => screen.findByRole('checkbox', { name: 'Only bands I’m in' });
  const mixed = () =>
    result([
      entry({ band: band({ id: 'b1', name: 'Alpha' }), isOwner: true }),
      entry({ band: band({ id: 'b2', name: 'Bravo' }) }),
      entry({ band: band({ id: 'b3', name: 'Gone Band' }), status: 'removed' }),
    ]);

  it('is checked by default and hides bands you were removed from', async () => {
    vi.mocked(loadMyBands).mockResolvedValue(mixed());
    renderAt();
    expect(await checkbox()).toBeChecked();
    expect(await screen.findByRole('link', { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bravo/ })).toBeInTheDocument();
    expect(screen.queryByText('Gone Band')).not.toBeInTheDocument();
    expect(screen.queryByText('You were removed from this band.')).not.toBeInTheDocument();
  });

  it('unchecking reveals removed bands alongside the active ones', async () => {
    vi.mocked(loadMyBands).mockResolvedValue(mixed());
    renderAt();
    fireEvent.click(await checkbox());
    expect(screen.getByRole('checkbox', { name: 'Only bands I’m in' })).not.toBeChecked();
    expect(screen.getByText('Gone Band')).toBeInTheDocument();
    expect(screen.getByText('You were removed from this band.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('re-checking hides them again', async () => {
    vi.mocked(loadMyBands).mockResolvedValue(mixed());
    renderAt();
    fireEvent.click(await checkbox());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only bands I’m in' }));
    expect(screen.queryByText('Gone Band')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alpha/ })).toBeInTheDocument();
  });

  it('does not reload bands when toggling (it is a pure client-side filter)', async () => {
    vi.mocked(loadMyBands).mockResolvedValue(mixed());
    renderAt();
    fireEvent.click(await checkbox());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only bands I’m in' }));
    expect(loadMyBands).toHaveBeenCalledTimes(1);
  });

  it('persists the choice in localStorage under bands-only-mine', async () => {
    renderAt();
    expect(localStorage.getItem(KEY)).toBeNull(); // nothing written until the user chooses
    fireEvent.click(await checkbox());
    expect(localStorage.getItem(KEY)).toBe('false');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only bands I’m in' }));
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it('restores an unchecked choice from storage on the next visit', async () => {
    localStorage.setItem(KEY, 'false');
    vi.mocked(loadMyBands).mockResolvedValue(mixed());
    renderAt();
    expect(await checkbox()).not.toBeChecked();
    expect(await screen.findByText('Gone Band')).toBeInTheDocument();
  });

  it('restores a checked choice from storage', async () => {
    localStorage.setItem(KEY, 'true');
    vi.mocked(loadMyBands).mockResolvedValue(mixed());
    renderAt();
    expect(await checkbox()).toBeChecked();
    expect(screen.queryByText('Gone Band')).not.toBeInTheDocument();
  });

  it.each(['not json', 'null', '0', '"false"', '{}', ''])('falls back to checked for an unrecognised stored value %j', async (stored) => {
    localStorage.setItem(KEY, stored);
    renderAt();
    expect(await checkbox()).toBeChecked();
  });

  it('keeps working when storage rejects the write (the choice just is not remembered)', async () => {
    vi.mocked(loadMyBands).mockResolvedValue(mixed());
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      renderAt();
      fireEvent.click(await checkbox());
      expect(screen.getByRole('checkbox', { name: 'Only bands I’m in' })).not.toBeChecked();
      expect(screen.getByText('Gone Band')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps working when storage cannot be read', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    try {
      renderAt();
      expect(await checkbox()).toBeChecked();
    } finally {
      spy.mockRestore();
    }
  });

  describe('hidden-bands note', () => {
    const removed = (id: string) => entry({ band: band({ id, name: `Gone ${id}` }), status: 'removed' });
    const active = (id: string) => entry({ band: band({ id, name: `Active ${id}` }) });

    it('says one removed band is hidden (singular) when some others are visible', async () => {
      vi.mocked(loadMyBands).mockResolvedValue(mixed());
      renderAt();
      expect(await screen.findByText('1 band you were removed from is hidden.')).toBeInTheDocument();
    });

    it('says how many removed bands are hidden (plural)', async () => {
      vi.mocked(loadMyBands).mockResolvedValue(result([active('a1'), removed('r1'), removed('r2'), removed('r3')]));
      renderAt();
      expect(await screen.findByText('3 bands you were removed from are hidden.')).toBeInTheDocument();
    });

    it('goes away when the filter is unchecked (the removed bands are shown instead)', async () => {
      vi.mocked(loadMyBands).mockResolvedValue(mixed());
      renderAt();
      await screen.findByText(/you were removed from is hidden/);
      fireEvent.click(await checkbox());
      expect(screen.queryByText(/you were removed from (is|are) hidden/)).not.toBeInTheDocument();
    });

    it('is not shown when no band is hidden', async () => {
      vi.mocked(loadMyBands).mockResolvedValue(result([active('a1'), active('a2')]));
      renderAt();
      await screen.findByRole('link', { name: /Active a1/ });
      expect(screen.queryByText(/removed from (is|are) hidden/)).not.toBeInTheDocument();
    });

    it('is replaced by the "No bands to show" message when every band is hidden', async () => {
      vi.mocked(loadMyBands).mockResolvedValue(result([removed('r1'), removed('r2')]));
      renderAt();
      expect(await screen.findByText(/No bands to show/)).toBeInTheDocument();
      expect(screen.queryByText(/removed from (is|are) hidden/)).not.toBeInTheDocument();
    });

    it('still shows alongside the failed-to-load warning when some bands are visible', async () => {
      vi.mocked(loadMyBands).mockResolvedValue(result([active('a1'), removed('r1')], { failedCount: 2 }));
      renderAt();
      expect(await screen.findByRole('status')).toHaveTextContent('2 bands couldn’t be loaded');
      expect(screen.getByText('1 band you were removed from is hidden.')).toBeInTheDocument();
    });

    it('re-appears when the filter is checked again', async () => {
      vi.mocked(loadMyBands).mockResolvedValue(mixed());
      renderAt();
      fireEvent.click(await checkbox());
      fireEvent.click(screen.getByRole('checkbox', { name: 'Only bands I’m in' }));
      expect(screen.getByText('1 band you were removed from is hidden.')).toBeInTheDocument();
    });
  });

  it('when only removed bands exist, explains why the list is empty and how to see them', async () => {
    vi.mocked(loadMyBands).mockResolvedValue(result([entry({ status: 'removed' })]));
    renderAt();
    expect(await screen.findByText(/No bands to show/)).toHaveTextContent('Uncheck “Only bands I’m in” to see bands you were removed from.');
    expect(screen.queryByText(/not in a band yet/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only bands I’m in' }));
    expect(screen.queryByText(/No bands to show/)).not.toBeInTheDocument();
    expect(screen.getByText('You were removed from this band.')).toBeInTheDocument();
  });

  it('with no bands at all, keeps the original "not in a band yet" message in either state', async () => {
    renderAt();
    expect(await screen.findByText(/not in a band yet/)).toBeInTheDocument();
    expect(screen.queryByText(/No bands to show/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only bands I’m in' }));
    expect(screen.getByText(/not in a band yet/)).toBeInTheDocument();
  });

  it('shows no empty message while some bands failed to load, even if every loaded one is filtered out', async () => {
    vi.mocked(loadMyBands).mockResolvedValue(result([entry({ status: 'removed' })], { failedCount: 1 }));
    renderAt();
    expect(await screen.findByRole('status')).toHaveTextContent('1 band couldn’t be loaded');
    expect(screen.queryByText(/No bands to show/)).not.toBeInTheDocument();
    expect(screen.queryByText(/not in a band yet/)).not.toBeInTheDocument();
  });

  it('dismissing a removed band while unchecked reloads and keeps the choice', async () => {
    vi.mocked(loadMyBands).mockResolvedValueOnce(mixed()).mockResolvedValue(result([entry({ band: band({ id: 'b1', name: 'Alpha' }) })]));
    vi.mocked(dismissBand).mockResolvedValue(undefined);
    renderAt();
    fireEvent.click(await checkbox());
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(dismissBand).toHaveBeenCalledWith('b3'));
    await waitFor(() => expect(screen.queryByText('Gone Band')).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Only bands I’m in' })).not.toBeChecked();
  });

  it('is not rendered when signed out', () => {
    auth.status = 'unauthenticated';
    renderAt();
    expect(screen.queryByRole('checkbox', { name: 'Only bands I’m in' })).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Only bands I’m in' })); // removed bands are hidden by default
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
