import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BandRecord, MyBandEntry } from '../../bandTypes';

vi.mock('../../api/bandsApi', () => ({ dismissBand: vi.fn() }));

import { dismissBand } from '../../api/bandsApi';
import { BandCard } from './BandCard';

const band = (over: Partial<BandRecord> = {}): BandRecord => ({
  id: 'band-7',
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
const entry = (over: Partial<MyBandEntry> = {}): MyBandEntry => ({ band: band(), status: 'active', isOwner: false, ...over });

function setup(e: MyBandEntry) {
  const onDismissed = vi.fn();
  render(
    <MemoryRouter>
      <ul>
        <BandCard entry={e} onDismissed={onDismissed} />
      </ul>
    </MemoryRouter>,
  );
  return { onDismissed };
}

beforeEach(() => {
  vi.mocked(dismissBand).mockReset();
  vi.mocked(dismissBand).mockResolvedValue(undefined as never);
});

describe('BandCard', () => {
  it('links an active band to its page and labels the caller as a Member', () => {
    setup(entry());
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/bands/band-7');
    expect(link).toHaveTextContent('The Band');
    expect(link).toHaveTextContent('Member');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('labels the owner as Owner', () => {
    setup(entry({ isOwner: true }));
    expect(screen.getByRole('link')).toHaveTextContent('Owner');
  });

  it('a removed band is not a link: it explains and offers Dismiss', () => {
    setup(entry({ status: 'removed' }));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('The Band')).toBeInTheDocument();
    expect(screen.getByText('You were removed from this band.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
  });

  it('dismissing deletes through the API for that band, then notifies the page', async () => {
    const { onDismissed } = setup(entry({ status: 'removed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(onDismissed).toHaveBeenCalledTimes(1));
    expect(dismissBand).toHaveBeenCalledWith('band-7');
  });

  it('a failed dismiss shows the error inline and does not notify the page', async () => {
    vi.mocked(dismissBand).mockRejectedValue(new Error('Could not dismiss'));
    const { onDismissed } = setup(entry({ status: 'removed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not dismiss');
    expect(onDismissed).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
  });

  it('shows Dismissing… and disables the button while the request runs', async () => {
    let release!: () => void;
    vi.mocked(dismissBand).mockReturnValue(
      new Promise<void>((r) => {
        release = r;
      }) as never,
    );
    const { onDismissed } = setup(entry({ status: 'removed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByRole('button', { name: 'Dismissing…' })).toBeDisabled();
    release();
    await waitFor(() => expect(onDismissed).toHaveBeenCalled());
  });
});
