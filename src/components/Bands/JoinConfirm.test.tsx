import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InvitePreview } from '../../bandTypes';

vi.mock('../../api/bandsApi', () => ({ joinBand: vi.fn() }));

import { joinBand } from '../../api/bandsApi';
import { JoinConfirm } from './JoinConfirm';

const preview = (over: Partial<InvitePreview> = {}): InvitePreview => ({
  bandId: 'band-9',
  bandName: 'Cream',
  memberCount: 3,
  alreadyMember: false,
  ...over,
});

function setup(p: InvitePreview = preview(), defaultDisplayName = 'Alice') {
  const onJoined = vi.fn();
  render(<JoinConfirm preview={p} defaultDisplayName={defaultDisplayName} onJoined={onJoined} />);
  return { onJoined };
}

beforeEach(() => {
  vi.mocked(joinBand).mockReset();
  vi.mocked(joinBand).mockResolvedValue(undefined as never);
});

describe('JoinConfirm', () => {
  it('names the band and pluralises the member count', () => {
    setup(preview({ memberCount: 3 }));
    expect(screen.getByText('Cream')).toBeInTheDocument();
    expect(screen.getByText(/It has 3 members\./)).toBeInTheDocument();
  });

  it('uses the singular for exactly one member', () => {
    setup(preview({ memberCount: 1 }));
    expect(screen.getByText(/It has 1 member\./)).toBeInTheDocument();
  });

  it('prefills the display name and labels the button by membership', () => {
    setup(preview(), 'Alice');
    expect(screen.getByLabelText('Your name in this band')).toHaveValue('Alice');
    expect(screen.getByRole('button', { name: 'Join band' })).toBeInTheDocument();
  });

  it('says "Open band" for someone who is already a member', () => {
    setup(preview({ alreadyMember: true }));
    expect(screen.getByRole('button', { name: 'Open band' })).toBeInTheDocument();
  });

  it('joins with the edited display name and reports the band id', async () => {
    const { onJoined } = setup();
    fireEvent.change(screen.getByLabelText('Your name in this band'), { target: { value: 'Al' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join band' }));
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith('band-9'));
    expect(joinBand).toHaveBeenCalledWith('band-9', 'Al');
  });

  it('translates an invite failure into friendly text and does not report a join', async () => {
    vi.mocked(joinBand).mockRejectedValue(Object.assign(new Error('internal'), { reason: 'full' }));
    const { onJoined } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Join band' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This band is full (15 members).');
    expect(onJoined).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Join band' })).toBeEnabled();
  });

  it('shows a plain failure message as is', async () => {
    vi.mocked(joinBand).mockRejectedValue(new Error('Not authenticated'));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Join band' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not authenticated');
  });

  it('disables the button and says Joining… while the request runs', async () => {
    let release!: () => void;
    vi.mocked(joinBand).mockReturnValue(
      new Promise<void>((r) => {
        release = r;
      }) as never,
    );
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Join band' }));
    expect(await screen.findByRole('button', { name: 'Joining…' })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Join band' })).toBeEnabled());
  });
});
