import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SongRecord, ValidSong } from '../../bandTypes';
import { SongListTextDialog } from './SongListTextDialog';

const writeText = vi.fn();

/** The dialog has two "Close" buttons: the corner X (icon + sr-only text) and the footer one (text only). */
const footerClose = () => {
  const button = screen.getAllByRole('button', { name: 'Close' }).find((b) => !b.querySelector('svg'));
  if (!button) throw new Error('footer Close button not found');
  return button;
};

beforeEach(() => {
  writeText.mockReset();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
});

const song = (id: string, title: string, artist: string | null): ValidSong =>
  ({
    id,
    owner: 'sub-a',
    bandId: 'band-1',
    setListId: 'sl-1',
    title,
    artist,
    key: null,
    bpm: null,
    notes: null,
    songUrl: null,
    tabUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
  }) as SongRecord as ValidSong;

const songs = [song('1', 'Zebra', 'Band Z'), song('2', 'Alpha', null)];
const EXPECTED = '1. Zebra - Band Z\n2. Alpha';

function renderDialog(over: Partial<{ open: boolean; songs: ValidSong[]; incomplete: boolean; onOpenChange: (o: boolean) => void }> = {}) {
  const onOpenChange = over.onOpenChange ?? vi.fn();
  render(
    <SongListTextDialog
      open={over.open ?? true}
      onOpenChange={onOpenChange}
      setListName="Main Set"
      songs={over.songs ?? songs}
      incomplete={over.incomplete}
    />,
  );
  return { onOpenChange };
}

describe('SongListTextDialog', () => {
  it('shows the set list name and the numbered text in the order given', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Main Set')).toBeInTheDocument();
    expect(screen.getByLabelText('Song list').textContent).toBe(EXPECTED);
  });

  it('describes the song count, singular and plural', () => {
    const { unmount } = render(
      <SongListTextDialog open onOpenChange={vi.fn()} setListName="X" songs={songs} />,
    );
    expect(screen.getByText(/2 songs, in the order shown/)).toBeInTheDocument();
    unmount();
    render(<SongListTextDialog open onOpenChange={vi.fn()} setListName="X" songs={[songs[0]]} />);
    expect(screen.getByText(/1 song, in the order shown/)).toBeInTheDocument();
    expect(screen.queryByText(/1 songs/)).not.toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('starts with the "Copy to clipboard" label and copies the exact text, then shows "Copied!"', async () => {
    writeText.mockResolvedValue(undefined);
    renderDialog();
    const button = screen.getByRole('button', { name: 'Copy to clipboard' });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(EXPECTED);
  });

  it('shows "Couldn’t copy" when the browser refuses, never "Copied!"', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Couldn’t copy' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Copied!' })).not.toBeInTheDocument();
  });

  it('recovers: a later successful copy replaces the failure label', async () => {
    writeText.mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined);
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Couldn’t copy' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Couldn’t copy' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument());
  });

  it('the "Copied!" flash reverts to "Copy to clipboard" after two seconds', async () => {
    vi.useFakeTimers();
    writeText.mockResolvedValue(undefined);
    renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2001);
    });
    expect(screen.getByRole('button', { name: 'Copy to clipboard' })).toBeInTheDocument();
  });

  it('Close asks the parent to close without copying', () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(footerClose());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('warns that the list may be missing songs only when it is incomplete', () => {
    const { unmount } = render(
      <SongListTextDialog open onOpenChange={vi.fn()} setListName="Main Set" songs={songs} incomplete />,
    );
    expect(screen.getByText(/may be missing some/)).toBeInTheDocument();
    unmount();
    renderDialog();
    expect(screen.queryByText(/may be missing some/)).not.toBeInTheDocument();
  });

  it('keeps the text it opened with when the songs change underneath it', () => {
    const { rerender } = render(
      <SongListTextDialog open onOpenChange={vi.fn()} setListName="Main Set" songs={songs} />,
    );
    rerender(<SongListTextDialog open onOpenChange={vi.fn()} setListName="Main Set" songs={[song('3', 'New', null)]} />);
    expect(screen.getByLabelText('Song list').textContent).toBe(EXPECTED);
    expect(screen.getByText(/^2 songs/)).toBeInTheDocument();
  });
});
