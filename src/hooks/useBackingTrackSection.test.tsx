import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { BandView, SetListView, ValidBackingTrack, ValidSong } from '../bandTypes';

vi.mock('../api/backingTracksApi', () => ({
  isBackingTracksReady: vi.fn(),
  areBackingTrackUploadsOn: vi.fn(),
  addBackingTrack: vi.fn(),
  editBackingTrack: vi.fn(),
  removeBackingTracks: vi.fn(),
  getBackingTrackUrl: vi.fn(),
}));

import {
  addBackingTrack,
  areBackingTrackUploadsOn,
  editBackingTrack,
  getBackingTrackUrl,
  isBackingTracksReady,
  removeBackingTracks,
} from '../api/backingTracksApi';
import { useBackingTrackSection } from './useBackingTrackSection';

const ME = 'sub-me';
const BOB = 'sub-bob';

const song = (id: string): ValidSong => ({ id, title: `Song ${id}`, bandId: 'band-1', setListId: 'sl-1' }) as unknown as ValidSong;
const SONG_A = song('a');
const SONG_B = song('b');

const track = (id: string, songId: string, over: Partial<ValidBackingTrack> = {}): ValidBackingTrack =>
  ({
    id,
    owner: BOB,
    bandId: 'band-1',
    setListId: 'sl-1',
    songId,
    label: `Track ${id}`,
    forTags: [],
    key: `bt/${id}`,
    contentType: 'audio/mpeg',
    bytes: 1024,
    format: 1,
    createdAt: '2026-02-01T00:00:00Z',
    ext: 'mp3',
    ...over,
  }) as unknown as ValidBackingTrack;

const makeList = (...tracks: ValidBackingTrack[]): SetListView => {
  const bySong = new Map<string, ValidBackingTrack[]>();
  for (const t of tracks) bySong.set(t.songId, [...(bySong.get(t.songId) ?? []), t]);
  return { songs: [SONG_A, SONG_B], backingTracks: bySong, incomplete: false } as unknown as SetListView;
};

const makeView = (over: Partial<BandView> = {}): BandView => ({ sub: ME, isMember: true, canUpload: true, isOwner: false, ...over }) as unknown as BandView;

interface HarnessProps {
  list: SetListView;
  view: BandView;
  reload: () => Promise<void>;
}

/** Renders what the page renders: each song's panel, the dialogs and the player's error. */
function Harness({ list, view, reload }: HarnessProps) {
  const section = useBackingTrackSection({ list, view, fetchedAt: 1, reload, nameOf: (sub) => (sub === BOB ? 'Bob' : 'Me') });
  return (
    <div>
      {list.songs.map((s) => (
        <section key={s.id} aria-label={s.title}>
          {section.panelFor(s)}
        </section>
      ))}
      {section.error && <p role="alert">{section.error}</p>}
      {section.dialogs}
    </div>
  );
}

function setup(over: Partial<HarnessProps> = {}) {
  const reload = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const props: HarnessProps = { list: makeList(), view: makeView(), reload, ...over };
  const utils = render(<Harness {...props} />);
  return { reload: props.reload, ...utils };
}

const songSection = (title: string) => within(screen.getByRole('region', { name: title }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isBackingTracksReady).mockReturnValue(true);
  vi.mocked(areBackingTrackUploadsOn).mockReturnValue(true);
  vi.mocked(addBackingTrack).mockResolvedValue(undefined);
  vi.mocked(editBackingTrack).mockResolvedValue(undefined);
  vi.mocked(removeBackingTracks).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useBackingTrackSection panelFor', () => {
  it('renders nothing for any song when the backend or storage is not ready, even with tracks', () => {
    vi.mocked(isBackingTracksReady).mockReturnValue(false);
    setup({ list: makeList(track('t1', 'a')) });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers Add on every song to a member when uploads are on, with the count on songs that have tracks', () => {
    setup({ list: makeList(track('t1', 'a'), track('t2', 'a')) });
    expect(songSection('Song a').getByRole('button', { name: 'Backing tracks for Song a (2)' })).toBeInTheDocument();
    expect(songSection('Song a').getByRole('button', { name: 'Add a backing track to Song a' })).toBeEnabled();
    expect(songSection('Song b').getByRole('button', { name: 'Backing tracks for Song b (0)' })).toBeInTheDocument();
    expect(songSection('Song b').getByRole('button', { name: 'Add a backing track to Song b' })).toBeEnabled();
  });

  it('with uploads off, keeps the panel for songs that have tracks but offers no Add', () => {
    vi.mocked(areBackingTrackUploadsOn).mockReturnValue(false);
    setup({ list: makeList(track('t1', 'a')) });
    expect(songSection('Song a').getByRole('button', { name: 'Backing tracks for Song a (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a backing track/ })).not.toBeInTheDocument();
  });

  it('with uploads off, shows nothing on a song without tracks', () => {
    vi.mocked(areBackingTrackUploadsOn).mockReturnValue(false);
    setup({ list: makeList(track('t1', 'a')) });
    expect(songSection('Song b').queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers Add only to a member: a non-member sees a panel only where tracks exist, without Add', () => {
    setup({ list: makeList(track('t1', 'a')), view: makeView({ isMember: false, canUpload: false }) });
    expect(songSection('Song a').getByRole('button', { name: 'Backing tracks for Song a (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a backing track/ })).not.toBeInTheDocument();
    expect(songSection('Song b').queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides Add from a member the owner has not allowed to upload, but still lists the tracks', () => {
    setup({ list: makeList(track('t1', 'a')), view: makeView({ canUpload: false }) });
    expect(songSection('Song a').getByRole('button', { name: 'Backing tracks for Song a (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a backing track/ })).not.toBeInTheDocument();
    expect(songSection('Song b').queryByRole('button')).not.toBeInTheDocument();
  });

  it('lets the band owner (and only them) remove someone else\'s track', () => {
    const { unmount } = setup({ list: makeList(track('t1', 'a')), view: makeView({ isOwner: true }) });
    fireEvent.click(screen.getByRole('button', { name: 'Backing tracks for Song a (1)' }));
    expect(screen.getByRole('button', { name: 'Remove Track t1' })).toBeInTheDocument();
    unmount();
    setup({ list: makeList(track('t1', 'a')) });
    fireEvent.click(screen.getByRole('button', { name: 'Backing tracks for Song a (1)' }));
    expect(screen.queryByRole('button', { name: 'Remove Track t1' })).not.toBeInTheDocument();
  });

  it('names the author with the supplied lookup', () => {
    setup({ list: makeList(track('t1', 'a')) });
    fireEvent.click(screen.getByRole('button', { name: 'Backing tracks for Song a (1)' }));
    expect(screen.getByRole('listitem')).toHaveTextContent('by Bob');
  });
});

describe('useBackingTrackSection player', () => {
  class FakeAudio {
    src = '';
    currentTime = 0;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onplaying: (() => void) | null = null;
    pause = vi.fn();
    load = vi.fn();
    play = vi.fn(() => Promise.resolve());
    removeAttribute = vi.fn();
  }

  it('exposes a failed Play as `error`', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    vi.mocked(getBackingTrackUrl).mockRejectedValue(new Error("That file isn't available. It may have been removed."));
    setup({ list: makeList(track('t1', 'a')) });
    fireEvent.click(screen.getByRole('button', { name: 'Backing tracks for Song a (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play Track t1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That file isn't available. It may have been removed.");
  });
});

describe('useBackingTrackSection writes', () => {
  const pickFile = () => {
    fireEvent.change(screen.getByLabelText('Audio file'), { target: { files: [new File(['x'], 'mix.mp3', { type: 'audio/mpeg' })] } });
  };
  const add = (title = 'Song a') => {
    fireEvent.click(songSection(title).getByRole('button', { name: `Add a backing track to ${title}` }));
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Add track' }));
  };
  const edit = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Backing tracks for Song a (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Track t1' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  };
  const remove = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Backing tracks for Song a (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Track t1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  };
  /** Lets pending promises (the mocked API, the dialog's submit) settle without moving the fake clock. */
  const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const elapse = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  const ACTIONS = [
    ['add', add, () => makeList(), addBackingTrack],
    ['edit', edit, () => makeList(track('t1', 'a', { owner: ME })), editBackingTrack],
    ['remove', remove, () => makeList(track('t1', 'a', { owner: ME })), removeBackingTracks],
  ] as const;

  describe.each(ACTIONS)('after a %s', (_name, act_, list, api) => {
    it('on success reloads at once and once more 1.5 s later (the track index is eventually consistent)', async () => {
      const { reload } = setup({ list: list() });
      vi.useFakeTimers();
      act_();
      await settle();
      expect(api).toHaveBeenCalledTimes(1);
      expect(reload).toHaveBeenCalledTimes(1);
      await elapse(1_499);
      expect(reload).toHaveBeenCalledTimes(1);
      await elapse(1);
      expect(reload).toHaveBeenCalledTimes(2);
      await elapse(30_000);
      expect(reload).toHaveBeenCalledTimes(2);
    });

    it('on failure reloads once, shows the message, and schedules no catch-up read', async () => {
      vi.mocked(api as typeof addBackingTrack).mockRejectedValue(new Error('It did not work.'));
      const { reload } = setup({ list: list() });
      vi.useFakeTimers();
      act_();
      await settle();
      expect(reload).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('alert')).toHaveTextContent('It did not work.');
      await elapse(30_000);
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does not read again after the page is gone', async () => {
      const { reload, unmount } = setup({ list: list() });
      vi.useFakeTimers();
      act_();
      await settle();
      expect(reload).toHaveBeenCalledTimes(1);
      unmount();
      await elapse(30_000);
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it('a second write inside the window restarts the catch-up instead of stacking another one', async () => {
    const { reload } = setup();
    vi.useFakeTimers();
    add();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
    await elapse(1_000);
    add('Song b');
    await settle();
    expect(reload).toHaveBeenCalledTimes(2);
    await elapse(1_499);
    expect(reload).toHaveBeenCalledTimes(2); // the first write's catch-up (due at 1500) was cancelled
    await elapse(1);
    expect(reload).toHaveBeenCalledTimes(3);
    await elapse(30_000);
    expect(reload).toHaveBeenCalledTimes(3);
  });
});

describe('useBackingTrackSection dialogs', () => {
  it('opens the add dialog for the chosen song and passes the song, file, name and tags to addBackingTrack', async () => {
    setup();
    fireEvent.click(songSection('Song b').getByRole('button', { name: 'Add a backing track to Song b' }));
    expect(screen.getByText(/For “Song b”/)).toBeInTheDocument();
    const file = new File(['x'], 'no_drums.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Audio file'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Drums' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add track' }));
    await act(async () => undefined);
    const arg = vi.mocked(addBackingTrack).mock.calls[0][0];
    expect(arg.song).toBe(SONG_B);
    expect(arg.file).toBe(file);
    expect(arg.label).toBe('no drums');
    expect(arg.tags).toEqual(['drums']);
    expect(arg.signal).toBeInstanceOf(AbortSignal);
  });

  it('the edit dialog is prefilled from the track and names its song', () => {
    setup({ list: makeList(track('t1', 'a', { owner: ME, label: 'Click only', forTags: ['guitar'] })) });
    fireEvent.click(screen.getByRole('button', { name: 'Backing tracks for Song a (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Click only' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Click only');
    expect(screen.getByRole('button', { name: 'Guitar' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/“Song a”/)).toBeInTheDocument();
  });

  it('the remove confirmation differs for your own track and someone else\'s', () => {
    const { unmount } = setup({ list: makeList(track('t1', 'a', { owner: ME, label: 'Mine' })) });
    fireEvent.click(screen.getByRole('button', { name: 'Backing tracks for Song a (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mine' }));
    expect(screen.getByText('Remove “Mine”?')).toBeInTheDocument();
    expect(screen.getByText('The audio file is deleted for everyone in the band.')).toBeInTheDocument();
    unmount();
    setup({ list: makeList(track('t2', 'a', { label: 'Theirs' })), view: makeView({ isOwner: true }) });
    fireEvent.click(screen.getByRole('button', { name: 'Backing tracks for Song a (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Theirs' }));
    expect(screen.getByText('The audio file Bob added is deleted for everyone in the band.')).toBeInTheDocument();
  });

  it('Cancel on the remove confirmation removes nothing and does not reload', () => {
    const { reload } = setup({ list: makeList(track('t1', 'a', { owner: ME })) });
    fireEvent.click(screen.getByRole('button', { name: 'Backing tracks for Song a (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Track t1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(removeBackingTracks).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
