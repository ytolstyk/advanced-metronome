import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: 'authenticated' }),
  Authenticator: () => null,
}));
vi.mock('aws-amplify/data', () => ({ generateClient: vi.fn(() => ({ models: {}, graphql: vi.fn() })) }));
vi.mock('../api/authUtils', () => ({
  isAuthenticated: vi.fn().mockResolvedValue(true),
  getCurrentUserSub: vi.fn().mockResolvedValue('sub-me'),
}));
vi.mock('../api/availabilityApi', () => {
  class AvailabilityBlockedError extends Error {}
  return {
    AvailabilityBlockedError,
    loadAvailabilityPage: vi.fn(),
    saveMyAvailability: vi.fn(),
    deleteMyAvailabilityWithin: vi.fn(),
  };
});
// Pin the viewer's zone so the labels in these tests do not depend on the machine running them.
vi.mock('../availabilityCalendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../availabilityCalendar')>()),
  getViewerTimeZone: () => 'UTC',
}));

import { deleteMyAvailabilityWithin, loadAvailabilityPage, saveMyAvailability } from '../api/availabilityApi';
import type { AvailabilityPageResult } from '../api/availabilityApi';
import type { AvailabilityRead } from '../bandTypes';
import { ME, NOW, OWNER, BOB, at, band, makeView, ok, row, time } from '../availabilityTestHelpers';
import { AvailabilityPage } from './AvailabilityPage';

type Ok = Extract<AvailabilityPageResult, { status: 'ok' }>;

const evening = [at(19), at(19, 30), at(20), at(20, 30)];
function pageData(over: Partial<Ok> = {}, reads?: Record<string, AvailabilityRead>): Ok {
  const defaults: Record<string, AvailabilityRead> = {
    [OWNER]: ok(row(OWNER, evening)),
    [ME]: ok(null),
    [BOB]: ok(row(BOB, evening)),
  };
  return {
    status: 'ok',
    view: makeView(),
    participants: { subs: [OWNER, ME, BOB], excluded: 0 },
    reads: new Map(Object.entries({ ...defaults, ...reads })),
    fetchedAt: NOW - 1_000,
    ...over,
  };
}
const load = (result: AvailabilityPageResult) => vi.mocked(loadAvailabilityPage).mockResolvedValue(result);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/bands/band-1/availability']}>
      <Routes>
        <Route path="/bands/:bandId/availability" element={<AvailabilityPage />} />
        <Route path="/bands/:bandId" element={<p>band page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  vi.mocked(loadAvailabilityPage).mockReset();
  vi.mocked(saveMyAvailability).mockReset();
  vi.mocked(deleteMyAvailabilityWithin).mockReset();
  vi.mocked(deleteMyAvailabilityWithin).mockResolvedValue(undefined);
  vi.mocked(saveMyAvailability).mockImplementation(async (_b, edits) => ({
    row: row(ME, [...edits].filter(([, mark]) => mark).map(([slot]) => slot)),
    reset: false,
  }));
});
afterEach(() => vi.useRealTimers());

/** A cell of the week grid by its time on Wed, Nov 4 (the day the test marks are on). */
const cell = (label: string) => screen.getByRole('button', { name: time(`Wed, Nov 4, ${label}`) });

describe('AvailabilityPage states', () => {
  it('says the feature is not available on a backend without it', async () => {
    load({ status: 'unavailable' });
    renderPage();
    expect(await screen.findByText('Availability isn’t available yet')).toBeInTheDocument();
  });

  it('not found', async () => {
    load({ status: 'not-found' });
    renderPage();
    expect(await screen.findByText('Band not found')).toBeInTheDocument();
  });

  it.each(['deleted', 'removed'] as const)('a %s band points back to the band page', async (status) => {
    load(status === 'removed' ? { status, band: band() } : { status });
    renderPage();
    const title = status === 'deleted' ? 'This band was deleted' : 'You were removed from this band';
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the band page' })).toHaveAttribute('href', '/bands/band-1');
  });

  it('asks a non-member to join first', async () => {
    load(pageData({ view: makeView({ isMember: false }) }));
    renderPage();
    expect(await screen.findByText('Join this band first')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Group' })).not.toBeInTheDocument();
  });

  it('fails closed with a retry button', async () => {
    vi.mocked(loadAvailabilityPage).mockRejectedValueOnce(new Error('network')).mockResolvedValue(pageData());
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('network');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Availability' })).toBeInTheDocument();
  });

  it('has a way back to the band', async () => {
    load(pageData());
    renderPage();
    await screen.findByRole('heading', { name: 'Availability' });
    expect(screen.getByRole('link', { name: '← Back to band' })).toHaveAttribute('href', '/bands/band-1');
  });
});

describe('AvailabilityPage for a member', () => {
  it('opens on My times for someone who has not saved yet, and states the time zone and who can read their times', async () => {
    load(pageData());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Availability' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'My times' })).toBeChecked();
    expect(screen.getByText(/Times are shown in UTC/)).toBeInTheDocument();
    expect(screen.getByText(/Anyone with an account who has this band’s link/)).toBeInTheDocument();
  });

  it('opens on the group view for someone who already has times, with the best times', async () => {
    load(pageData({}, { [ME]: ok(row(ME, evening)) }));
    renderPage();
    expect(await screen.findByRole('radio', { name: 'Group' })).toBeChecked();
    const card = screen.getByRole('region', { name: 'Best times' });
    expect(within(card).getByText(/Wed, Nov 4, 7:00\sPM – 9:00\sPM/)).toBeInTheDocument();
    expect(within(card).getByText(/3 of 3 free: Olivia, Me, Bob/)).toBeInTheDocument();
  });

  it('shows a short summary under each day’s name', async () => {
    load(pageData({}, { [ME]: ok(row(ME, evening)) }));
    renderPage();
    expect(await screen.findAllByText('peak 3/3')).toHaveLength(1);
    expect(screen.getAllByText('none').length).toBeGreaterThan(0);
  });

  it('jumps to a suggested window’s day and slot with "Show"', async () => {
    load(pageData({}, { [ME]: ok(row(ME, evening)) }));
    renderPage();
    await screen.findByRole('radio', { name: 'Group' });
    fireEvent.click(within(screen.getByRole('region', { name: 'Best times' })).getAllByRole('button', { name: 'Show' })[0]);
    expect(await screen.findByRole('heading', { name: /Wed, Nov 4, 7:00\sPM/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: time('Wed, Nov 4, 7:00 PM') })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the person’s own saved marks as pressed in My times', async () => {
    load(pageData({}, { [ME]: ok(row(ME, evening)) }));
    renderPage();
    await screen.findByRole('radio', { name: 'Group' });
    fireEvent.click(screen.getByRole('radio', { name: 'My times' }));
    expect(cell('7:00 PM')).toHaveAttribute('aria-pressed', 'true');
    expect(cell('9:00 PM')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/Last saved yesterday/)).toBeInTheDocument();
  });
});

describe('saving, and the notice before the first save', () => {
  it('keeps a change but writes nothing until the person accepts the notice, then saves it', async () => {
    load(pageData());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Before you save' })).toBeInTheDocument();
    fireEvent.click(cell('7:00 PM'));
    expect(cell('7:00 PM')).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText(/Waiting for you to accept the notice/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 1_000));
    expect(saveMyAvailability).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'I understand' }));
    await waitFor(() => expect(saveMyAvailability).toHaveBeenCalledTimes(1), { timeout: 3_000 });
    const edits = vi.mocked(saveMyAvailability).mock.calls[0][1] as Map<number, boolean>;
    expect([...edits]).toEqual([[at(19), true]]);
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Before you save' })).not.toBeInTheDocument();
  });

  it('remembers the accepted notice for this band and person', async () => {
    load(pageData());
    const first = renderPage();
    await screen.findByRole('heading', { name: 'Before you save' });
    fireEvent.click(screen.getByRole('button', { name: 'I understand' }));
    first.unmount();
    renderPage();
    await screen.findByRole('heading', { name: 'Availability' });
    expect(screen.queryByRole('heading', { name: 'Before you save' })).not.toBeInTheDocument();
  });

  it('shows a failed save with a way to retry', async () => {
    localStorage.setItem('availability-notice:band-1:sub-me', 'true');
    load(pageData());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(saveMyAvailability).mockRejectedValueOnce(new Error('offline'));
    renderPage();
    await screen.findByRole('heading', { name: 'Availability' });
    fireEvent.click(cell('7:00 PM'));
    expect(await screen.findByRole('alert', {}, { timeout: 3_000 })).toHaveTextContent('Could not save your availability');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(saveMyAvailability).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });
});

describe('the week shown', () => {
  it('draws a column per day with only the practice hours, 8 AM to 10 PM', async () => {
    load(pageData({}, { [ME]: ok(row(ME, evening)) }));
    renderPage();
    await screen.findByRole('radio', { name: 'Group' });
    const grid = screen.getByRole('group', { name: 'How many members are free' });
    for (const day of ['Tue, Nov 3', 'Wed, Nov 4', 'Mon, Nov 9']) expect(within(grid).getByText(day)).toBeInTheDocument();
    expect(within(grid).queryByText('Tue, Nov 10')).not.toBeInTheDocument();
    expect(within(grid).getAllByRole('button', { name: /^Wed, Nov 4,/ })).toHaveLength(28);
    expect(within(grid).queryByRole('button', { name: time('Wed, Nov 4, 7:30 AM') })).not.toBeInTheDocument();
    expect(within(grid).queryByRole('button', { name: time('Wed, Nov 4, 10:00 PM') })).not.toBeInTheDocument();
  });

  it('pages to the next week and back, and names the dates shown', async () => {
    load(pageData({}, { [ME]: ok(row(ME, evening)) }));
    renderPage();
    await screen.findByRole('radio', { name: 'Group' });
    expect(screen.getByText('Tue, Nov 3 – Mon, Nov 9')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Later/ }));
    expect(screen.getByText('Tue, Nov 10 – Mon, Nov 16')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Wed, Nov 4,/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Earlier/ }));
    expect(screen.getByRole('button', { name: time('Wed, Nov 4, 7:00 PM') })).toBeInTheDocument();
  });

  it('marks times in a later week and keeps them there', async () => {
    localStorage.setItem('availability-notice:band-1:sub-me', 'true');
    load(pageData());
    renderPage();
    await screen.findByRole('radio', { name: 'My times' });
    fireEvent.click(screen.getByRole('button', { name: /Later/ }));
    fireEvent.click(screen.getByRole('button', { name: time('Wed, Nov 11, 7:00 PM') }));
    expect(screen.getByRole('button', { name: time('Wed, Nov 11, 7:00 PM') })).toHaveAttribute('aria-pressed', 'true');
  });

  it('has no control for hours outside practice time', async () => {
    load(pageData());
    renderPage();
    await screen.findByRole('radio', { name: 'My times' });
    expect(screen.queryByRole('button', { name: /all hours/i })).not.toBeInTheDocument();
  });
});

describe('deleting', () => {
  it('asks first, then deletes the row', async () => {
    localStorage.setItem('availability-notice:band-1:sub-me', 'true');
    load(pageData({}, { [ME]: ok(row(ME, evening)) }));
    renderPage();
    await screen.findByRole('radio', { name: 'Group' });
    fireEvent.click(screen.getByRole('radio', { name: 'My times' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete my availability' }));
    const dialog = await screen.findByRole('dialog');
    expect(deleteMyAvailabilityWithin).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteMyAvailabilityWithin).toHaveBeenCalledWith('band-1'));
  });

  it('keeps the dialog open with the reason when the delete fails', async () => {
    localStorage.setItem('availability-notice:band-1:sub-me', 'true');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    load(pageData({}, { [ME]: ok(row(ME, evening)) }));
    vi.mocked(deleteMyAvailabilityWithin).mockRejectedValue(new Error('refused'));
    renderPage();
    await screen.findByRole('radio', { name: 'Group' });
    fireEvent.click(screen.getByRole('radio', { name: 'My times' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete my availability' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete your availability');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('cancelling deletes nothing', async () => {
    load(pageData());
    renderPage();
    await screen.findByRole('radio', { name: 'My times' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my availability' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(deleteMyAvailabilityWithin).not.toHaveBeenCalled();
  });
});

describe('warnings', () => {
  it('says when the member list is too long to load completely', async () => {
    load(pageData({ view: makeView({ incomplete: true }) }));
    renderPage();
    expect(await screen.findByText(/Some members may be missing from this list/)).toBeInTheDocument();
  });

  it('says how many members are left out by the read limit', async () => {
    load(pageData({ participants: { subs: [OWNER, ME, BOB], excluded: 2 } }));
    renderPage();
    expect(await screen.findByText(/2 more members aren’t shown/)).toBeInTheDocument();
  });

  it('names members whose times could not be read, with a retry', async () => {
    load(pageData({}, { [BOB]: { status: 'failed' } }));
    renderPage();
    const alert = await screen.findByText(/Couldn’t read the times of Bob/);
    expect(alert).toBeInTheDocument();
    expect(within(alert.closest('p')!).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('turns editing off, and says why, when a newer app version wrote the person’s row', async () => {
    load(pageData({}, { [ME]: ok(row(ME, [], { format: 2 })) }));
    renderPage();
    expect(await screen.findByText(/saved by a newer version of the app/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'My times' }));
    expect(cell('7:00 PM')).toBeDisabled();
    // Deleting stays possible.
    expect(screen.getByRole('button', { name: 'Delete my availability' })).toBeEnabled();
  });

  it('warns that saving will replace a row that cannot be read', async () => {
    load(pageData({}, { [ME]: ok(row(ME, [], { mask: 'zz' })) }));
    renderPage();
    expect(await screen.findByText(/Saving will replace them/)).toBeInTheDocument();
  });
});

describe('preferences', () => {
  it('remembers the shortest time to suggest', async () => {
    load(pageData({}, { [ME]: ok(row(ME, evening)) }));
    const first = renderPage();
    await screen.findByRole('radio', { name: 'Group' });
    fireEvent.click(screen.getByRole('radio', { name: '3 hours' }));
    expect(JSON.parse(localStorage.getItem('availability-prefs')!)).toEqual({ minSlots: 6 });
    first.unmount();
    renderPage();
    expect(await screen.findByRole('radio', { name: '3 hours' })).toBeChecked();
  });

  it('ignores a damaged stored preference', async () => {
    localStorage.setItem('availability-prefs', JSON.stringify({ minSlots: 99 }));
    load(pageData({}, { [ME]: ok(row(ME, evening)) }));
    renderPage();
    expect(await screen.findByRole('radio', { name: '2 hours' })).toBeChecked();
  });
});
