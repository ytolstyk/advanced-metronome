import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../api/bandsApi', () => ({ updateMyProfile: vi.fn() }));

import { updateMyProfile } from '../../api/bandsApi';
import { EditProfileDialog } from './EditProfileDialog';

function setup(props: Partial<React.ComponentProps<typeof EditProfileDialog>> = {}) {
  const onClose = vi.fn();
  const onSettled = vi.fn();
  render(
    <EditProfileDialog
      bandId="band-1"
      bandName="The Band"
      initialName="Alice"
      initialInstruments={['guitar']}
      onClose={onClose}
      onSettled={onSettled}
      {...props}
    />,
  );
  return { onClose, onSettled };
}

beforeEach(() => {
  vi.mocked(updateMyProfile).mockReset();
  vi.mocked(updateMyProfile).mockResolvedValue(undefined);
});

describe('EditProfileDialog', () => {
  it('names the band and is prefilled with the current name and instruments', () => {
    setup({ initialInstruments: ['bass', 'vocals'] });
    expect(screen.getByRole('heading', { name: 'Your profile in The Band' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your name in this band')).toHaveValue('Alice');
    expect(screen.getByRole('button', { name: 'Bass' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Vocals' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Guitar' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('seeds from cleaned instruments: unknown keys are dropped, duplicates collapse', () => {
    setup({ initialInstruments: ['laser-harp', 'drums', 'drums', ''] });
    expect(screen.getAllByRole('button', { pressed: true }).map((b) => b.textContent)).toEqual(['Drums']);
  });

  it('saves the edited name and instruments, settles, then closes', async () => {
    const order: string[] = [];
    const { onClose, onSettled } = setup();
    onSettled.mockImplementation(() => void order.push('settled'));
    onClose.mockImplementation(() => void order.push('closed'));
    fireEvent.change(screen.getByLabelText('Your name in this band'), { target: { value: 'Ally' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guitar' })); // off
    fireEvent.click(screen.getByRole('button', { name: 'Keys' })); // on
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateMyProfile).toHaveBeenCalledExactlyOnceWith('band-1', 'Ally', ['keys']);
    expect(order).toEqual(['settled', 'closed']);
  });

  it('can save with every instrument cleared', async () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Guitar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateMyProfile).toHaveBeenCalledWith('band-1', 'Alice', []);
  });

  it('on failure shows the message inline, stays open, but still settles so the page can refresh', async () => {
    vi.mocked(updateMyProfile).mockRejectedValue(new Error('Join the band first'));
    const { onClose, onSettled } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Join the band first');
    expect(onClose).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByLabelText('Your name in this band')).toHaveValue('Alice');
  });

  it('shows Saving… and cannot be dismissed (button, Escape) while the request runs', async () => {
    let release!: () => void;
    vi.mocked(updateMyProfile).mockReturnValue(
      new Promise<void>((r) => {
        release = r;
      }),
    );
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Cancel closes without saving or settling', () => {
    const { onClose, onSettled } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateMyProfile).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('Escape closes when idle', () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it('limits the name length like every other display name field', () => {
    setup();
    expect(screen.getByLabelText('Your name in this band')).toHaveAttribute('maxlength', '30');
  });
});
