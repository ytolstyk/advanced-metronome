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
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Wonderwall', artist: 'Oasis', key: 'F#m', bpm: '87', notes: '', songUrl: '', tabUrl: '' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('submits the typed song and tab links as raw text', async () => {
    const { onSubmit } = setup();
    type('Title', 'Wonderwall');
    type('Song link (optional)', 'open.spotify.com/track/1');
    type('Tab link (optional)', 'https://tabs.example.com/w');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      songUrl: 'open.spotify.com/track/1',
      tabUrl: 'https://tabs.example.com/w',
    });
  });

  it('renders both link inputs as optional url inputs', () => {
    setup();
    for (const label of ['Song link (optional)', 'Tab link (optional)']) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveValue('');
      expect(input).toHaveAttribute('inputmode', 'url');
      expect(input).not.toBeRequired();
    }
  });

  it('blocks a javascript: song link or an invalid tab link with a readable message', async () => {
    const { onSubmit } = setup();
    type('Title', 'x');
    type('Song link (optional)', 'javascript:alert(1)');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Song link must be a web address');
    type('Song link (optional)', '');
    type('Tab link (optional)', 'https://user:pw@example.com/x');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tab link must be a web address');
    expect(onSubmit).not.toHaveBeenCalled();
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

  it('edit mode prefills the existing links', () => {
    setup({
      initial: { title: 'Old', songUrl: 'https://a.example/s', tabUrl: 'https://b.example/t' },
    });
    expect(screen.getByLabelText('Song link (optional)')).toHaveValue('https://a.example/s');
    expect(screen.getByLabelText('Tab link (optional)')).toHaveValue('https://b.example/t');
  });
});
