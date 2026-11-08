import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ValidBackingTrack } from '../../bandTypes';
import { BackingTracksPanel, type BackingTrackControls } from './BackingTracksPanel';
import { createProgressStore } from '../../utils/playerProgress';

const ME = 'sub-me';
const BOB = 'sub-bob';
const OWNER = 'sub-owner';

const track = (id: string, over: Partial<ValidBackingTrack> = {}): ValidBackingTrack =>
  ({
    id,
    owner: BOB,
    bandId: 'band-1',
    setListId: 'sl-1',
    songId: 'song-1',
    label: `Track ${id}`,
    forTags: [],
    key: `bt/${id}`,
    contentType: 'audio/mpeg',
    bytes: 480 * 1024,
    format: 1,
    createdAt: '2026-02-01T00:00:00Z',
    ext: 'mp3',
    ...over,
  }) as unknown as ValidBackingTrack;

const names: Record<string, string> = { [ME]: 'Me', [BOB]: 'Bob', [OWNER]: 'Olivia' };

function setup(
  tracks: ValidBackingTrack[],
  over: { viewerSub?: string; isBandOwner?: boolean; controls?: Partial<BackingTrackControls> } = {},
) {
  const controls: BackingTrackControls = {
    playingId: null,
    busy: false,
    onPlay: vi.fn(),
    onDownload: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    player: { progress: createProgressStore(), onSeek: vi.fn(), onSkip: vi.fn(), onTogglePause: vi.fn() },
    ...over.controls,
  };
  render(
    <BackingTracksPanel
      songTitle="Kashmir"
      tracks={tracks}
      viewerSub={over.viewerSub ?? ME}
      isBandOwner={over.isBandOwner ?? false}
      nameOf={(sub) => names[sub] ?? 'Someone'}
      controls={controls}
    />,
  );
  return controls;
}

const toggle = (count: number) => screen.getByRole('button', { name: `Backing tracks for Kashmir (${count})` });

describe('BackingTracksPanel header', () => {
  it('is collapsed by default and shows no list', () => {
    setup([track('a')]);
    expect(toggle(1)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the count in the label when there are tracks', () => {
    setup([track('a'), track('b'), track('c')]);
    expect(toggle(3)).toHaveTextContent('Backing tracks (3)');
  });

  it('shows no count when there are none', () => {
    setup([]);
    expect(toggle(0)).toHaveTextContent(/^Backing tracks$/);
  });

  it('expands and collapses with aria-expanded and aria-controls', async () => {
    const user = userEvent.setup();
    setup([track('a')]);
    await user.click(toggle(1));
    expect(toggle(1)).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('list');
    expect(toggle(1)).toHaveAttribute('aria-controls', list.id);
    await user.click(toggle(1));
    expect(toggle(1)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('says so when expanded with no tracks', async () => {
    const user = userEvent.setup();
    setup([]);
    await user.click(toggle(0));
    expect(screen.getByText('No backing tracks yet.')).toBeInTheDocument();
  });
});

describe('BackingTracksPanel list items', () => {
  async function open(tracks: ValidBackingTrack[], over: Parameters<typeof setup>[1] = {}) {
    const user = userEvent.setup();
    const controls = setup(tracks, over);
    await user.click(toggle(tracks.length));
    return { user, controls };
  }

  it('shows label, audience, author, format and size for each track', async () => {
    await open([track('a', { label: 'No drums', bytes: 3.2 * 1024 * 1024, ext: 'flac' })]);
    const [item] = screen.getAllByRole('listitem');
    expect(within(item).getByText('No drums')).toBeInTheDocument();
    expect(item).toHaveTextContent('For everyone');
    expect(item).toHaveTextContent('by Bob');
    expect(item).toHaveTextContent('FLAC 3.2 MB');
  });

  it('shows kilobytes for a small file', async () => {
    await open([track('a', { bytes: 480 * 1024 })]);
    expect(screen.getByRole('listitem')).toHaveTextContent('MP3 480 KB');
  });

  it('names the instruments a track is for instead of "For everyone"', async () => {
    await open([track('a', { forTags: ['drums', 'bass'] })]);
    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('Bass');
    expect(item).toHaveTextContent('Drums');
    expect(item).not.toHaveTextContent('For everyone');
  });

  it('lists tracks in the order given', async () => {
    await open([track('a', { label: 'First' }), track('b', { label: 'Second' })]);
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('p')!.textContent)).toEqual(['First', 'Second']);
  });

  it('uses the supplied name lookup for the author', async () => {
    await open([track('a', { owner: OWNER })]);
    expect(screen.getByRole('listitem')).toHaveTextContent('by Olivia');
  });

  describe('Play / Stop', () => {
    it('Play calls onPlay with the track', async () => {
      const a = track('a');
      const { user, controls } = await open([a]);
      await user.click(screen.getByRole('button', { name: 'Play Track a' }));
      expect(controls.onPlay).toHaveBeenCalledWith(a);
    });

    it('swaps to Stop for the playing track only', async () => {
      await open([track('a'), track('b')], { controls: { playingId: 'a' } });
      expect(screen.getByRole('button', { name: 'Stop Track a' })).toHaveTextContent('Stop');
      expect(screen.queryByRole('button', { name: 'Play Track a' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Play Track b' })).toHaveTextContent('Play');
    });

    it('Stop calls onPlay too (the hook toggles)', async () => {
      const a = track('a');
      const { user, controls } = await open([a], { controls: { playingId: 'a' } });
      await user.click(screen.getByRole('button', { name: 'Stop Track a' }));
      expect(controls.onPlay).toHaveBeenCalledWith(a);
    });
  });

  describe('player bar', () => {
    it('is shown only under the track that is playing', async () => {
      const { controls } = await open([track('a'), track('b')], { controls: { playingId: 'b' } });
      expect(controls.playingId).toBe('b');
      expect(screen.getAllByRole('group', { name: /Playback controls/ })).toHaveLength(1);
      expect(screen.getByRole('group', { name: 'Playback controls for Track b' })).toBeInTheDocument();
    });

    it('is absent when nothing plays', async () => {
      await open([track('a')]);
      expect(screen.queryByRole('group', { name: /Playback controls/ })).not.toBeInTheDocument();
    });
  });

  describe('Download', () => {
    it('calls onDownload with the track', async () => {
      const a = track('a');
      const { user, controls } = await open([a]);
      await user.click(screen.getByRole('button', { name: 'Download Track a' }));
      expect(controls.onDownload).toHaveBeenCalledWith(a);
    });
  });

  describe('busy', () => {
    it('marks Play and Download busy while a link is being fetched, but keeps them enabled so keyboard focus is not lost', async () => {
      await open([track('a'), track('b')], { controls: { busy: true } });
      for (const id of ['a', 'b']) {
        const play = screen.getByRole('button', { name: `Play Track ${id}` });
        const download = screen.getByRole('button', { name: `Download Track ${id}` });
        expect(play).toBeEnabled();
        expect(play).toHaveAttribute('aria-busy', 'true');
        expect(download).toBeEnabled();
        expect(download).toHaveAttribute('aria-busy', 'true');
      }
    });

    it('does not mark the playing track\'s Stop busy, but marks the others', async () => {
      await open([track('a'), track('b')], { controls: { busy: true, playingId: 'a' } });
      expect(screen.getByRole('button', { name: 'Stop Track a' })).toHaveAttribute('aria-busy', 'false');
      expect(screen.getByRole('button', { name: 'Play Track b' })).toHaveAttribute('aria-busy', 'true');
    });

    it('is not busy when nothing is being fetched', async () => {
      await open([track('a')], { controls: { busy: false } });
      expect(screen.getByRole('button', { name: 'Play Track a' })).toHaveAttribute('aria-busy', 'false');
    });

    it('does not disable Edit or Remove', async () => {
      await open([track('a', { owner: ME })], { controls: { busy: true } });
      expect(screen.getByRole('button', { name: 'Edit Track a' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Remove Track a' })).toBeEnabled();
    });
  });

  describe('Edit and Remove permissions', () => {
    it('offers Edit and Remove on the viewer\'s own track', async () => {
      const mine = track('a', { owner: ME });
      const { user, controls } = await open([mine]);
      await user.click(screen.getByRole('button', { name: 'Edit Track a' }));
      await user.click(screen.getByRole('button', { name: 'Remove Track a' }));
      expect(controls.onEdit).toHaveBeenCalledWith(mine);
      expect(controls.onRemove).toHaveBeenCalledWith(mine);
    });

    it('offers neither on someone else\'s track to a plain member', async () => {
      await open([track('a', { owner: BOB })]);
      expect(screen.queryByRole('button', { name: 'Edit Track a' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remove Track a' })).not.toBeInTheDocument();
    });

    it('lets the band owner Remove (but not Edit) someone else\'s track', async () => {
      const bobs = track('a', { owner: BOB });
      const { user, controls } = await open([bobs], { viewerSub: OWNER, isBandOwner: true });
      expect(screen.queryByRole('button', { name: 'Edit Track a' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Remove Track a' }));
      expect(controls.onRemove).toHaveBeenCalledWith(bobs);
    });

    it('decides per track', async () => {
      await open([track('mine', { owner: ME }), track('theirs', { owner: BOB })]);
      expect(screen.getByRole('button', { name: 'Edit Track mine' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit Track theirs' })).not.toBeInTheDocument();
    });
  });
});

describe('BackingTracksPanel Add', () => {
  it('shows Add and calls onAdd', async () => {
    const user = userEvent.setup();
    const controls = setup([]);
    await user.click(screen.getByRole('button', { name: 'Add a backing track to Kashmir' }));
    expect(controls.onAdd).toHaveBeenCalledTimes(1);
  });

  it('works without opening the list', () => {
    setup([track('a')]);
    expect(screen.getByRole('button', { name: 'Add a backing track to Kashmir' })).toBeEnabled();
  });

  it('is hidden when the viewer cannot add (no onAdd)', () => {
    setup([track('a')], { controls: { onAdd: undefined } });
    expect(screen.queryByRole('button', { name: /Add a backing track/ })).not.toBeInTheDocument();
  });

  it('is disabled with an explanation at 10 tracks', () => {
    const ten = Array.from({ length: 10 }, (_, i) => track(`t${i}`));
    setup(ten);
    const add = screen.getByRole('button', { name: 'Add a backing track to Kashmir' });
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute('title', 'A song can have 10 backing tracks');
  });

  it('is still enabled at 9 tracks', () => {
    const nine = Array.from({ length: 9 }, (_, i) => track(`t${i}`));
    setup(nine);
    const add = screen.getByRole('button', { name: 'Add a backing track to Kashmir' });
    expect(add).toBeEnabled();
    expect(add).not.toHaveAttribute('title');
  });
});
