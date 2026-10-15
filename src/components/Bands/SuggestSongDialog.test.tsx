import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SuggestSongDialog } from './SuggestSongDialog';

const setup = (props: Partial<React.ComponentProps<typeof SuggestSongDialog>> = {}) => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(<SuggestSongDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />);
  return { onSubmit, onOpenChange };
};
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('SuggestSongDialog', () => {
  it('submits the entered fields and closes', async () => {
    const { onSubmit, onOpenChange } = setup();
    type('Title', 'Wonderwall');
    type('Artist (optional)', 'Oasis');
    type('Key (optional)', 'F#m');
    type('BPM (optional)', '87');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Wonderwall', artist: 'Oasis', key: 'F#m', bpm: '87', notes: '' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('blocks invalid input with a readable message and never calls the API', async () => {
    const { onSubmit } = setup();
    type('Title', 'x');
    type('BPM (optional)', '999');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('BPM must be a whole number from 40 to 300');
    type('BPM (optional)', '');
    type('Key (optional)', 'H');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Key must look like');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows API failures inline and stays open', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('This set list is full (100 songs)'));
    const { onOpenChange } = setup({ onSubmit });
    type('Title', 'Another');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This set list is full');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Suggest' })).toBeEnabled();
  });

  it('edit mode is prefilled and says Save', async () => {
    const { onSubmit } = setup({ initial: { title: 'Old', artist: 'A', key: 'C', bpm: 100, notes: 'n' } });
    expect(screen.getByRole('heading', { name: 'Edit song' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Old');
    expect(screen.getByLabelText('BPM (optional)')).toHaveValue('100');
    type('Title', 'New');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'New', artist: 'A' });
  });
});
