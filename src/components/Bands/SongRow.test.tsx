import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SongRow } from './SongRow';
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as ValidSong;

function setup(
  songOver: Partial<ValidSong> = {},
  props: Partial<React.ComponentProps<typeof SongRow>> = {},
) {
  const handlers = { onVote: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onHide: vi.fn() };
  render(
    <ul>
      <SongRow
        song={song(songOver)}
        rank={3}
        tally={{ up: 2, down: 1, score: 1 }}
        myVote={undefined}
        suggestedBy="Alice"
        isAuthor={false}
        isOwner={false}
        isVoting={false}
        {...handlers}
        {...props}
      />
    </ul>,
  );
  return handlers;
}

describe('SongRow', () => {
  it('shows rank, title and who suggested it', () => {
    setup();
    expect(screen.getByLabelText('Rank 3')).toHaveTextContent('3');
    expect(screen.getByText('Wonderwall')).toBeInTheDocument();
    expect(screen.getByText('Suggested by Alice')).toBeInTheDocument();
  });

  describe('details line', () => {
    it('is omitted entirely when there is no artist, key or BPM', () => {
      setup();
      expect(screen.queryByText(/BPM/)).not.toBeInTheDocument();
      expect(screen.queryByText(/·/)).not.toBeInTheDocument();
    });

    it('joins artist, key and BPM with a middle dot', () => {
      setup({ artist: 'Oasis', key: 'F#m', bpm: 87 });
      expect(screen.getByText('Oasis · F#m · 87 BPM')).toBeInTheDocument();
    });

    it('shows key/BPM alone when there is no artist', () => {
      setup({ key: 'Am', bpm: 120 });
      expect(screen.getByText('Am · 120 BPM')).toBeInTheDocument();
    });

    it('shows the artist alone when key and BPM are missing', () => {
      setup({ artist: 'Oasis' });
      expect(screen.getByText('Oasis')).toBeInTheDocument();
    });

    it('does not render a BPM of 0', () => {
      setup({ artist: 'Oasis', bpm: 0 });
      expect(screen.queryByText(/BPM/)).not.toBeInTheDocument();
    });

    it('renders notes only when present', () => {
      setup({ notes: 'Capo 2\nHalf-time outro' });
      expect(screen.getByText(/Capo 2/)).toBeInTheDocument();
    });
  });

  describe('edited badge', () => {
    it('is hidden for a song that was never updated or has no updatedAt', () => {
      setup({ updatedAt: undefined });
      expect(screen.queryByText('edited')).not.toBeInTheDocument();
    });

    it('is hidden when the update landed within a minute of creation (create-time writes)', () => {
      setup({ createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:30.000Z' });
      expect(screen.queryByText('edited')).not.toBeInTheDocument();
    });

    it('is hidden at exactly the 60 second boundary (strictly greater than)', () => {
      setup({ createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:01:00.000Z' });
      expect(screen.queryByText('edited')).not.toBeInTheDocument();
    });

    it('appears once the song was updated more than a minute after creation', () => {
      setup({ createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:01:00.001Z' });
      expect(screen.getByText('edited')).toBeInTheDocument();
    });

    it('is hidden when updatedAt is earlier than createdAt (clock skew)', () => {
      setup({ createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
      expect(screen.queryByText('edited')).not.toBeInTheDocument();
    });
  });

  describe('author / owner controls', () => {
    it('shows no management buttons to a plain member', () => {
      setup();
      expect(screen.queryByRole('button', { name: /^(Edit|Delete|Hide) / })).not.toBeInTheDocument();
    });

    it('lets the author edit and delete, but not hide', () => {
      const h = setup({}, { isAuthor: true });
      fireEvent.click(screen.getByRole('button', { name: 'Edit Wonderwall' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete Wonderwall' }));
      expect(h.onEdit).toHaveBeenCalledTimes(1);
      expect(h.onDelete).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Hide Wonderwall' })).not.toBeInTheDocument();
    });

    it('lets the owner hide any song, but not edit or delete someone else\'s', () => {
      const h = setup({}, { isOwner: true });
      fireEvent.click(screen.getByRole('button', { name: 'Hide Wonderwall' }));
      expect(h.onHide).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Edit Wonderwall' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete Wonderwall' })).not.toBeInTheDocument();
    });

    it('an owner who is also the author gets all three controls', () => {
      setup({}, { isAuthor: true, isOwner: true });
      expect(screen.getByRole('button', { name: 'Edit Wonderwall' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete Wonderwall' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Hide Wonderwall' })).toBeInTheDocument();
    });
  });

  describe('voting', () => {
    it('forwards votes and the voting-disabled flag to the vote buttons', () => {
      const h = setup({}, { myVote: 'up' });
      expect(screen.getByRole('button', { name: 'Upvote Wonderwall' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Downvote Wonderwall' }));
      expect(h.onVote).toHaveBeenCalledWith('down');
    });

    it('disables both vote buttons while a vote is in flight', () => {
      setup({}, { isVoting: true });
      expect(screen.getByRole('button', { name: 'Upvote Wonderwall' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Downvote Wonderwall' })).toBeDisabled();
    });
  });
});
