import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SONG_COLOR_STYLES, SONG_COLOR_TINT_PERCENT } from '../../bandSongColors';
import { SongRow } from './SongRow';
import type { SongColorKey, ValidSong } from '../../bandTypes';

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

function setup(
  songOver: Partial<ValidSong> = {},
  props: Partial<React.ComponentProps<typeof SongRow>> = {},
) {
  const handlers = { onVote: vi.fn(), onColor: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onHide: vi.fn() };
  render(
    <ul>
      <SongRow
        song={song(songOver)}
        rank={3}
        tally={{ up: 2, down: 1, score: 1 }}
        myVote={undefined}
        suggestedBy="Alice"
        color={undefined}
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

  describe('links', () => {
    it('renders no link row when there are no links', () => {
      setup();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('renders a Song link that opens safely in a new tab', () => {
      setup({ songUrl: 'https://open.spotify.com/track/1' });
      const a = screen.getByRole('link', { name: /Song link for Wonderwall/ });
      expect(a).toHaveAttribute('href', 'https://open.spotify.com/track/1');
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
      expect(a).toHaveTextContent('Song');
      expect(a).toHaveTextContent('open.spotify.com');
      expect(screen.queryByRole('link', { name: /Tab link/ })).not.toBeInTheDocument();
    });

    it('renders a Tab link that opens safely in a new tab', () => {
      setup({ tabUrl: 'https://tabs.example.com/w' });
      const a = screen.getByRole('link', { name: /Tab link for Wonderwall/ });
      expect(a).toHaveAttribute('href', 'https://tabs.example.com/w');
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.queryByRole('link', { name: /Song link/ })).not.toBeInTheDocument();
    });

    it('shows the host beside the label with www. stripped', () => {
      setup({ songUrl: 'https://www.example.com/x', tabUrl: 'https://tabs.example.org:8080/y' });
      expect(screen.getByRole('link', { name: /Song link/ })).toHaveTextContent('Song example.com');
      expect(screen.getByRole('link', { name: /Tab link/ })).toHaveTextContent('Tab tabs.example.org');
    });

    it('renders nothing for a stored link that is not a safe http(s) URL', () => {
      setup({ songUrl: 'javascript:alert(1)', tabUrl: 'https://user:pw@example.com/' });
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('re-canonicalises a non-canonical stored link for the href', () => {
      setup({ songUrl: 'HTTPS://Example.com' });
      expect(screen.getByRole('link', { name: /Song link/ })).toHaveAttribute('href', 'https://example.com/');
    });

    it('renders both links when both are set', () => {
      setup({ songUrl: 'https://a.example/s', tabUrl: 'https://b.example/t' });
      expect(screen.getAllByRole('link')).toHaveLength(2);
    });

    it('turns URLs in notes into new-tab links and leaves the rest as text', () => {
      setup({ notes: 'Capo 2, see https://example.com/lesson.' });
      const a = screen.getByRole('link', { name: 'https://example.com/lesson' });
      expect(a).toHaveAttribute('href', 'https://example.com/lesson');
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.getByText(/Capo 2, see/)).toBeInTheDocument();
    });

    it('does not link a javascript: URL in notes', () => {
      setup({ notes: 'javascript:alert(1) is not a link' });
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByText(/javascript:alert\(1\) is not a link/)).toBeInTheDocument();
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

    it('still shows the color picker to a plain member (any member may color a song)', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Set color for Wonderwall' })).toBeInTheDocument();
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

  describe('song color', () => {
    const li = () => screen.getByRole('listitem');

    it('reserves a transparent left border without a color, so colored and plain rows line up', () => {
      setup();
      expect(li()).toHaveClass('border-l-4', 'border-l-transparent');
      expect(li().getAttribute('style') ?? '').not.toMatch(/border-left-color|background-color/);
    });

    it.each(Object.entries(SONG_COLOR_STYLES) as Array<[SongColorKey, { label: string; hex: string }]>)(
      'a %s song gets a left stripe in that color',
      (key, { hex }) => {
        setup({}, { color: key });
        expect(li()).toHaveClass('border-l-4');
        expect(li()).toHaveStyle({ borderLeftColor: hex });
      },
    );

    it.each(Object.entries(SONG_COLOR_STYLES) as Array<[SongColorKey, { label: string; hex: string }]>)(
      'a %s song is tinted with the palette color over the card surface',
      (key, { hex }) => {
        setup({}, { color: key });
        expect(li().style.backgroundColor).toBe(
          `color-mix(in srgb, ${hex} ${SONG_COLOR_TINT_PERCENT}%, var(--color-surface))`,
        );
      },
    );

    it('keeps the tint subtle (8%) so muted text stays readable', () => {
      expect(SONG_COLOR_TINT_PERCENT).toBe(8);
    });

    it('keeps the shared card surface classes with or without a color', () => {
      setup({}, { color: 'red' });
      expect(li()).toHaveClass('border', 'bg-surface');
    });

    it('keeps the stripe class on a colored row too (always border-l-4)', () => {
      setup({}, { color: 'red' });
      expect(li()).toHaveClass('border-l-4');
    });

    it('forwards a pick from the picker to onColor', async () => {
      const user = userEvent.setup();
      const h = setup();
      await user.click(screen.getByRole('button', { name: /^Set color for Wonderwall/ }));
      await user.click(await screen.findByRole('menuitem', { name: 'Green' }));
      expect(h.onColor).toHaveBeenCalledWith('green');
    });

    it('forwards "No color" as null, and only offers it when the song has a color', async () => {
      const user = userEvent.setup();
      const h = setup({}, { color: 'teal' });
      await user.click(screen.getByRole('button', { name: /^Set color for Wonderwall/ }));
      await user.click(await screen.findByRole('menuitem', { name: /No color/ }));
      expect(h.onColor).toHaveBeenCalledWith(null);
    });

    it('passes the current color to the picker (check mark on that swatch)', async () => {
      const user = userEvent.setup();
      setup({}, { color: 'pink' });
      await user.click(screen.getByRole('button', { name: /^Set color for Wonderwall/ }));
      expect((await screen.findByRole('menuitem', { name: 'Pink, selected' })).querySelector('svg')).not.toBeNull();
      expect(screen.getByRole('menuitem', { name: 'Red' }).querySelector('svg')).toBeNull();
    });

    it('announces the current color on the picker trigger', () => {
      setup({}, { color: 'teal' });
      expect(screen.getByRole('button', { name: 'Set color for Wonderwall, now Teal' })).toBeInTheDocument();
    });

    describe('band color labels', () => {
      const labels = new Map<SongColorKey, string>([['teal', 'Ballad'], ['red', 'Thrash']]);

      it('shows the band\'s label for the song\'s color on the picker trigger', () => {
        setup({}, { color: 'teal', colorLabels: labels });
        const trigger = screen.getByRole('button', { name: 'Set color for Wonderwall, now Teal, Ballad' });
        expect(trigger).toHaveTextContent('Ballad');
      });

      it('falls back to the palette name when that color has no label', () => {
        setup({}, { color: 'green', colorLabels: labels });
        expect(screen.getByRole('button', { name: 'Set color for Wonderwall, now Green' })).toHaveTextContent('Green');
      });

      it('passes the labels on to the picker menu, and a pick still reports the palette key', async () => {
        const user = userEvent.setup();
        const h = setup({}, { colorLabels: labels });
        await user.click(screen.getByRole('button', { name: /^Set color for Wonderwall/ }));
        await user.click(await screen.findByRole('menuitem', { name: 'Red, Thrash' }));
        expect(h.onColor).toHaveBeenCalledWith('red');
      });

      it('does not change the stripe color', () => {
        setup({}, { color: 'teal', colorLabels: labels });
        expect(li()).toHaveStyle({ borderLeftColor: SONG_COLOR_STYLES.teal.hex });
      });
    });

    it('offers the picker to every member, not just the author or owner', () => {
      setup({}, { isAuthor: false, isOwner: false });
      expect(screen.getByRole('button', { name: 'Set color for Wonderwall' })).toBeInTheDocument();
    });

    it('colors do not interfere with the author / owner controls', () => {
      setup({}, { color: 'blue', isAuthor: true, isOwner: true });
      expect(screen.getByRole('button', { name: 'Edit Wonderwall' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Hide Wonderwall' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Set color for Wonderwall/ })).toBeInTheDocument();
    });
  });
});
