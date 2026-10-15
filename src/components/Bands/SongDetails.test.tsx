import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SongDetails } from './SongDetails';
import type { ValidSong } from '../../bandTypes';

const song = (over: Partial<ValidSong> = {}): ValidSong =>
  ({
    id: 's1',
    owner: 'sub-a',
    bandId: 'b1',
    setListId: 'sl1',
    title: 'Wonderwall',
    artist: null,
    key: null,
    bpm: null,
    notes: null,
    songUrl: null,
    tabUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as ValidSong;

describe('SongDetails', () => {
  it('renders just the title for a bare song (no artist line, links or notes)', () => {
    const { container } = render(<SongDetails song={song()} />);
    expect(screen.getByText('Wonderwall')).toBeInTheDocument();
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('joins artist, key and BPM with a middle dot, skipping a BPM of 0', () => {
    const { rerender } = render(<SongDetails song={song({ artist: 'Oasis', key: 'F#m', bpm: 87 })} />);
    expect(screen.getByText('Oasis · F#m · 87 BPM')).toBeInTheDocument();
    rerender(<SongDetails song={song({ artist: 'Oasis', bpm: 0 })} />);
    expect(screen.getByText('Oasis')).toBeInTheDocument();
    expect(screen.queryByText(/BPM/)).not.toBeInTheDocument();
  });

  it('renders song and tab links as new-tab links showing their host, only for safe http(s) URLs', () => {
    render(<SongDetails song={song({ songUrl: 'https://www.example.com/x', tabUrl: 'javascript:alert(1)' })} />);
    const a = screen.getByRole('link', { name: /Song link for Wonderwall/ });
    expect(a).toHaveAttribute('href', 'https://www.example.com/x');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    expect(a).toHaveTextContent('example.com');
    expect(screen.queryByRole('link', { name: /Tab link/ })).not.toBeInTheDocument();
  });

  it('linkifies notes but never a javascript: URL', () => {
    render(<SongDetails song={song({ notes: 'See https://example.com/a and javascript:alert(1)' })} />);
    expect(screen.getByRole('link', { name: 'https://example.com/a' })).toHaveAttribute('href', 'https://example.com/a');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('shows "edited" only when the update is more than a minute after creation', () => {
    const { rerender } = render(<SongDetails song={song({ updatedAt: '2026-01-01T00:01:00.000Z' })} />);
    expect(screen.queryByText('edited')).not.toBeInTheDocument();
    rerender(<SongDetails song={song({ updatedAt: '2026-01-01T00:01:00.001Z' })} />);
    expect(screen.getByText('edited')).toBeInTheDocument();
    rerender(<SongDetails song={song({ updatedAt: undefined })} />);
    expect(screen.queryByText('edited')).not.toBeInTheDocument();
  });

  it('renders children after the details (the members\' row adds "Suggested by" there)', () => {
    render(
      <SongDetails song={song({ notes: 'Capo 2' })}>
        <p>Suggested by Alice</p>
      </SongDetails>,
    );
    const notes = screen.getByText('Capo 2');
    const extra = screen.getByText('Suggested by Alice');
    expect(notes.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders markup in a title as plain text (no HTML injection)', () => {
    const { container } = render(<SongDetails song={song({ title: '<img src=x onerror=alert(1)>' })} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });
});
