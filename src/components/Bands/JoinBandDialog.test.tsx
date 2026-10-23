import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InvitePreview } from '../../bandTypes';

vi.mock('../../api/bandsApi', () => ({ lookupInvite: vi.fn(), joinBand: vi.fn() }));

import { joinBand, lookupInvite } from '../../api/bandsApi';
import { JoinBandDialog } from './JoinBandDialog';

const preview: InvitePreview = { bandId: 'band-9', bandName: 'Cream', memberCount: 2, alreadyMember: false };

function setup(props: Partial<React.ComponentProps<typeof JoinBandDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onJoined = vi.fn();
  const utils = render(
    <JoinBandDialog open onOpenChange={onOpenChange} defaultDisplayName="Alice" onJoined={onJoined} {...props} />,
  );
  return { onOpenChange, onJoined, ...utils };
}

beforeEach(() => {
  vi.mocked(lookupInvite).mockReset();
  vi.mocked(joinBand).mockReset();
  vi.mocked(lookupInvite).mockResolvedValue(preview);
  vi.mocked(joinBand).mockResolvedValue(undefined as never);
});

describe('JoinBandDialog', () => {
  it('disables Continue until a non-blank code is typed', () => {
    setup();
    const btn = screen.getByRole('button', { name: 'Continue' });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: '   ' } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'abcde-fghjk' } });
    expect(btn).toBeEnabled();
  });

  it('prefills the code from a shared link', () => {
    setup({ initialCode: 'ABCDEFGHJK' });
    expect(screen.getByLabelText('Invite code')).toHaveValue('ABCDEFGHJK');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('opens on the confirm step when the link was already looked up', () => {
    setup({ initialCode: 'ABCDEFGHJK', initialPreview: preview });
    expect(screen.getByText(/Cream/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument();
    expect(lookupInvite).not.toHaveBeenCalled();
  });

  it('shows a failure carried in from the landing check, and drops it on the next lookup', async () => {
    setup({ initialCode: 'ABCDEFGHJK', initialError: 'You were removed from this band.' });
    expect(screen.getByRole('alert')).toHaveTextContent('You were removed from this band.');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText(/Cream/);
    expect(screen.queryByText('You were removed from this band.')).not.toBeInTheDocument();
  });

  it('looks the code up exactly as typed and moves to the confirm step', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'abcde fghjk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('button', { name: 'Join band' })).toBeInTheDocument();
    expect(lookupInvite).toHaveBeenCalledWith('abcde fghjk');
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument();
    expect(screen.getByText('Cream')).toBeInTheDocument();
  });

  it('shows the friendly message for a failed lookup and stays on the code step', async () => {
    vi.mocked(lookupInvite).mockRejectedValue(Object.assign(new Error('x'), { reason: 'revoked' }));
    setup({ initialCode: 'ABCDEFGHJK' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer valid');
    expect(screen.getByLabelText('Invite code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('clears the previous error when the lookup is retried', async () => {
    vi.mocked(lookupInvite).mockRejectedValueOnce(Object.assign(new Error('x'), { reason: 'not-found' }));
    setup({ initialCode: 'ABCDEFGHJK' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No band found');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('button', { name: 'Join band' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('joining closes the dialog and reports the band id', async () => {
    const { onOpenChange, onJoined } = setup({ initialCode: 'ABCDEFGHJK' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Join band' }));
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith('band-9'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(joinBand).toHaveBeenCalledWith('band-9', 'Alice');
  });

  it('reopening after closing from the confirm step goes back to the code step', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <JoinBandDialog open onOpenChange={onOpenChange} initialCode="ABCDEFGHJK" defaultDisplayName="Alice" onJoined={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('button', { name: 'Join band' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(
      <JoinBandDialog open onOpenChange={onOpenChange} initialCode="ABCDEFGHJK" defaultDisplayName="Alice" onJoined={() => {}} />,
    );
    expect(await screen.findByLabelText('Invite code')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join band' })).not.toBeInTheDocument();
  });

  it('closing clears a lookup error', async () => {
    vi.mocked(lookupInvite).mockRejectedValue(Object.assign(new Error('x'), { reason: 'deleted' }));
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <JoinBandDialog open onOpenChange={onOpenChange} initialCode="ABCDEFGHJK" defaultDisplayName="A" onJoined={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That band has been deleted.');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    rerender(
      <JoinBandDialog open onOpenChange={onOpenChange} initialCode="ABCDEFGHJK" defaultDisplayName="A" onJoined={() => {}} />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cannot be dismissed while the lookup is running', async () => {
    let release!: (p: InvitePreview) => void;
    vi.mocked(lookupInvite).mockReturnValue(
      new Promise<InvitePreview>((r) => {
        release = r;
      }),
    );
    const { onOpenChange } = setup({ initialCode: 'ABCDEFGHJK' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('button', { name: 'Looking up…' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    release(preview);
    await screen.findByRole('button', { name: 'Join band' });
  });
});
