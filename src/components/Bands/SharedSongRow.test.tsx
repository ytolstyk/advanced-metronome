import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SharedSongRow } from './SharedSongRow';
import type { ValidSong } from '../../bandTypes';

const song = (over: Partial<ValidSong> = {}): ValidSong =>
  ({
    id: 's1',
    owner: 'sub-bob',
    bandId: 'b1',
    setListId: 'sl1',
    title: 'Wonderwall',
    artist: 'Oasis',
    key: 'F#m',
    bpm: 87,
    notes: null,
    songUrl: 'https://open.spotify.com/track/1',
    tabUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as ValidSong;

const renderRow = (tally = { up: 3, down: 1, score: 2 }, s = song(), rank = 2) =>
  render(
    <ul>
      <SharedSongRow song={s} rank={rank} tally={tally} />
    </ul>,
  );

describe('SharedSongRow', () => {
  it('shows the rank, the song details and its links', () => {
    renderRow();
    expect(screen.getByLabelText('Rank 2')).toHaveTextContent('2');
    expect(screen.getByText('Wonderwall')).toBeInTheDocument();
    expect(screen.getByText('Oasis · F#m · 87 BPM')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Song link for Wonderwall/ })).toHaveAttribute(
      'href',
      'https://open.spotify.com/track/1',
    );
  });

  it('exposes the score to screen readers as one phrase, with up and down counts', () => {
    renderRow({ up: 3, down: 1, score: 2 });
    expect(screen.getByText('Score 2, 3 up, 1 down')).toBeInTheDocument();
  });

  it('shows negative scores and zero tallies faithfully', () => {
    renderRow({ up: 0, down: 4, score: -4 });
    expect(screen.getByText('Score -4, 0 up, 4 down')).toBeInTheDocument();
  });

  it('is read-only: no vote, edit, delete or hide buttons at all', () => {
    renderRow();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('never shows who suggested the song', () => {
    renderRow();
    expect(screen.queryByText(/Suggested by/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sub-bob/)).not.toBeInTheDocument();
  });

  it('renders as a list item', () => {
    renderRow();
    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });

  it('uses the shared card surface and has no color stripe or picker (colors are not shown publicly)', () => {
    renderRow();
    const li = screen.getByRole('listitem');
    expect(li).toHaveClass('border', 'bg-surface');
    expect(li).not.toHaveClass('border-l-4');
    expect(screen.queryByRole('button', { name: /Set color/ })).not.toBeInTheDocument();
  });
});
