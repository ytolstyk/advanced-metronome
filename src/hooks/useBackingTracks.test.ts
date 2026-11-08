import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SetListView, ValidBackingTrack, ValidSetList } from '../bandTypes';

vi.mock('../api/backingTracksApi', () => ({
  getBackingTrackUrl: vi.fn(),
  editBackingTrack: vi.fn(),
  removeBackingTracks: vi.fn(),
}));

import { editBackingTrack, getBackingTrackUrl, removeBackingTracks } from '../api/backingTracksApi';
import { SILENT_WAV_DATA_URI, useBackingTracks } from './useBackingTracks';

// ---- a stand-in for HTMLAudioElement (jsdom cannot play media) -------------------------------------

class FakeAudio {
  static instances: FakeAudio[] = [];
  /** Results for upcoming play() calls, oldest first; once empty, play() resolves at once. */
  static playResults: Promise<void>[] = [];
  src = '';
  currentTime = 0;
  duration = NaN;
  paused = true;
  ontimeupdate: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  ondurationchange: (() => void) | null = null;
  onseeked: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  play = vi.fn((): Promise<void> => {
    this.paused = false;
    return FakeAudio.playResults.shift() ?? Promise.resolve();
  });
  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });
  constructor() {
    FakeAudio.instances.push(this);
  }
}

const audio = () => FakeAudio.instances[0]!;

const track = (id: string, over: Partial<ValidBackingTrack> = {}): ValidBackingTrack =>
  ({
    id,
    owner: 'sub-bob',
    bandId: 'band-1',
    setListId: 'sl-1',
    songId: 'song-1',
    label: `Label ${id}`,
    forTags: [],
    key: `bt/${id}`,
    contentType: 'audio/mpeg',
    bytes: 1024,
    format: 1,
    createdAt: '2026-02-01T00:00:00Z',
    ext: 'mp3',
    ...over,
  }) as unknown as ValidBackingTrack;

const A = track('a');
const B = track('b');

function makeList(...tracks: ValidBackingTrack[]): SetListView {
  const byTrackSong = new Map<string, ValidBackingTrack[]>();
  for (const t of tracks) byTrackSong.set(t.songId, [...(byTrackSong.get(t.songId) ?? []), t]);
  return { setList: {} as ValidSetList, backingTracks: byTrackSong } as unknown as SetListView;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(list: SetListView = makeList(A, B), fetchedAt = 1) {
  return renderHook((props: { list: SetListView; fetchedAt: number }) => useBackingTracks(props.list, props.fetchedAt), {
    initialProps: { list, fetchedAt },
  });
}

/** Presses Play and waits for the whole action (fetch + audio.play) to settle. */
async function press(result: { current: ReturnType<typeof useBackingTracks> }, fn: 'play' | 'download', t: ValidBackingTrack) {
  await act(async () => {
    await result.current[fn](t);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeAudio.instances = [];
  FakeAudio.playResults = [];
  vi.stubGlobal('Audio', FakeAudio);
  vi.mocked(getBackingTrackUrl).mockResolvedValue('https://signed.example/a?sig=1');
  vi.mocked(removeBackingTracks).mockResolvedValue(undefined);
  vi.mocked(editBackingTrack).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useBackingTracks play', () => {
  it('starts idle', () => {
    const { result } = setup();
    expect(result.current.playingId).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('unlocks audio synchronously inside the click, before the link is fetched', () => {
    const url = deferred<string>();
    vi.mocked(getBackingTrackUrl).mockReturnValue(url.promise);
    const { result } = setup();
    act(() => {
      void result.current.play(A);
    });
    // The link has not arrived, but the element was already primed with the silent clip.
    expect(audio().pause).toHaveBeenCalled();
    expect(audio().src).toBe(SILENT_WAV_DATA_URI);
    expect(audio().play).toHaveBeenCalledTimes(1);
    expect(result.current.playingId).toBeNull();
  });

  it('plays the fetched link and marks the track as playing', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    expect(getBackingTrackUrl).toHaveBeenCalledTimes(1);
    expect(getBackingTrackUrl).toHaveBeenCalledWith(A);
    expect(audio().src).toBe('https://signed.example/a?sig=1');
    expect(audio().play).toHaveBeenCalledTimes(2); // unlock + real
    expect(result.current.playingId).toBe('a');
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets the playing id only AFTER audio.play() resolves', async () => {
    const started = deferred<void>();
    FakeAudio.playResults = [Promise.resolve(), started.promise]; // the unlock, then the real start
    const { result } = setup();
    let done: Promise<void>;
    act(() => {
      done = result.current.play(A);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.playingId).toBeNull();
    expect(result.current.busy).toBe(true);
    await act(async () => {
      started.resolve();
      await done;
    });
    expect(result.current.playingId).toBe('a');
  });

  it('reuses one audio element across plays', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    await press(result, 'play', B);
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it('clicking the playing track stops it without fetching a new link', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    vi.mocked(getBackingTrackUrl).mockClear();
    audio().pause.mockClear();
    await press(result, 'play', A);
    expect(audio().pause).toHaveBeenCalledTimes(1);
    expect(result.current.playingId).toBeNull();
    expect(getBackingTrackUrl).not.toHaveBeenCalled();
  });

  it('switching to another track stops the first and plays the second', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    vi.mocked(getBackingTrackUrl).mockResolvedValue('https://signed.example/b');
    await press(result, 'play', B);
    expect(audio().src).toBe('https://signed.example/b');
    expect(result.current.playingId).toBe('b');
  });

  it('ignores a second click while a link is being fetched', async () => {
    const url = deferred<string>();
    vi.mocked(getBackingTrackUrl).mockReturnValue(url.promise);
    const { result } = setup();
    let first: Promise<void>;
    act(() => {
      first = result.current.play(A);
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      await result.current.play(B);
    });
    expect(getBackingTrackUrl).toHaveBeenCalledTimes(1);
    await act(async () => {
      url.resolve('https://signed.example/a');
      await first;
    });
    expect(result.current.playingId).toBe('a');
    expect(result.current.busy).toBe(false);
  });

  it('shows the message and stays stopped when the link cannot be fetched', async () => {
    vi.mocked(getBackingTrackUrl).mockRejectedValue(new Error("That file isn't available."));
    const { result } = setup();
    await press(result, 'play', A);
    expect(result.current.error).toBe("That file isn't available.");
    expect(result.current.playingId).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('falls back to a plain message when the failure carries none', async () => {
    vi.mocked(getBackingTrackUrl).mockRejectedValue('weird');
    const { result } = setup();
    await press(result, 'play', A);
    expect(result.current.error).toBe('Could not play that track');
  });

  it('shows an error and does not mark the track as playing when the browser refuses to play', async () => {
    FakeAudio.playResults = [Promise.resolve(), Promise.reject(new Error('NotAllowedError'))];
    const { result } = setup();
    await press(result, 'play', A);
    expect(result.current.error).toBe('NotAllowedError');
    expect(result.current.playingId).toBeNull();
  });

  it('clears an earlier error when the next play starts', async () => {
    vi.mocked(getBackingTrackUrl).mockRejectedValueOnce(new Error('first failed'));
    const { result } = setup();
    await press(result, 'play', A);
    expect(result.current.error).toBe('first failed');
    await press(result, 'play', A);
    expect(result.current.error).toBeNull();
  });

  it('clears the playing id when the track ends', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    act(() => audio().onended?.());
    expect(result.current.playingId).toBeNull();
  });
});

describe('useBackingTracks lifecycle', () => {
  it('stops the sound when the playing track disappears from the list (removed by someone, author banned)', async () => {
    const { result, rerender } = setup(makeList(A, B));
    await press(result, 'play', A);
    audio().pause.mockClear();
    rerender({ list: makeList(B), fetchedAt: 2 });
    expect(audio().pause).toHaveBeenCalled();
    expect(result.current.playingId).toBeNull();
  });

  it('keeps playing when a different track disappears', async () => {
    const { result, rerender } = setup(makeList(A, B));
    await press(result, 'play', A);
    audio().pause.mockClear();
    rerender({ list: makeList(A), fetchedAt: 2 });
    expect(audio().pause).not.toHaveBeenCalled();
    expect(result.current.playingId).toBe('a');
  });

  it('looks for the playing track under every song', async () => {
    const other = track('c', { songId: 'song-2' });
    const { result, rerender } = setup(makeList(A, other));
    await press(result, 'play', other);
    rerender({ list: makeList(A, other), fetchedAt: 2 });
    expect(result.current.playingId).toBe('c');
  });

  it('clears an error message when a newer load arrives (fetchedAt changes)', async () => {
    vi.mocked(getBackingTrackUrl).mockRejectedValue(new Error('nope'));
    const { result, rerender } = setup(makeList(A), 1);
    await press(result, 'play', A);
    expect(result.current.error).toBe('nope');
    rerender({ list: makeList(A), fetchedAt: 1 });
    expect(result.current.error).toBe('nope');
    rerender({ list: makeList(A), fetchedAt: 2 });
    expect(result.current.error).toBeNull();
  });

  it('pauses and detaches the audio on unmount', async () => {
    const { result, unmount } = setup();
    await press(result, 'play', A);
    audio().pause.mockClear();
    unmount();
    expect(audio().pause).toHaveBeenCalledTimes(1);
    expect(audio().removeAttribute).toHaveBeenCalledWith('src');
    expect(audio().load).toHaveBeenCalledTimes(1); // releases the network request and buffer, not just the attribute
    expect(audio().src).toBe('');
  });

  it('stopping releases the element: pause, drop the source, then load()', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    audio().pause.mockClear();
    audio().load.mockClear();
    await press(result, 'play', A); // clicking the playing track stops it
    const order = [audio().pause, audio().removeAttribute, audio().load].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order.every((n) => n !== undefined)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a! - b!));
    expect(audio().src).toBe('');
  });

  it('keeps playing when the list is only partly loaded, even if the playing track is not in it', async () => {
    const { result, rerender } = setup(makeList(A, B));
    await press(result, 'play', A);
    audio().pause.mockClear();
    rerender({ list: { ...makeList(B), incomplete: true } as SetListView, fetchedAt: 2 });
    expect(audio().pause).not.toHaveBeenCalled();
    expect(result.current.playingId).toBe('a');
  });

  it('stops once a complete list confirms the playing track is gone', async () => {
    const { result, rerender } = setup(makeList(A, B));
    await press(result, 'play', A);
    rerender({ list: { ...makeList(B), incomplete: true } as SetListView, fetchedAt: 2 });
    rerender({ list: { ...makeList(B), incomplete: false } as SetListView, fetchedAt: 3 });
    expect(audio().pause).toHaveBeenCalled();
    expect(result.current.playingId).toBeNull();
  });

  it('unmounting without ever playing does not create an audio element', () => {
    const { unmount } = setup();
    unmount();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('does not start playback when the link arrives after unmount', async () => {
    const url = deferred<string>();
    vi.mocked(getBackingTrackUrl).mockReturnValue(url.promise);
    const { result, unmount } = setup();
    let pending: Promise<void>;
    act(() => {
      pending = result.current.play(A);
    });
    unmount();
    await act(async () => {
      url.resolve('https://signed.example/late');
      await pending;
    });
    expect(audio().play).toHaveBeenCalledTimes(1); // only the unlock
    expect(audio().src).not.toBe('https://signed.example/late');
  });

  it('does not set an error after unmount', async () => {
    const url = deferred<string>();
    vi.mocked(getBackingTrackUrl).mockReturnValue(url.promise);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result, unmount } = setup();
    let pending: Promise<void>;
    act(() => {
      pending = result.current.play(A);
    });
    unmount();
    await act(async () => {
      url.reject(new Error('late failure'));
      await pending;
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('useBackingTracks link expiry', () => {
  const FRESH = 'https://signed.example/fresh';

  async function playing() {
    const hook = setup();
    await press(hook.result, 'play', A);
    vi.mocked(getBackingTrackUrl).mockClear();
    return hook;
  }

  it('re-links once when the signed link fails, resuming at the same time', async () => {
    const { result } = await playing();
    vi.mocked(getBackingTrackUrl).mockResolvedValue(FRESH);
    audio().currentTime = 42;
    audio().play.mockClear();
    await act(async () => {
      audio().onerror?.();
    });
    expect(getBackingTrackUrl).toHaveBeenCalledTimes(1);
    expect(getBackingTrackUrl).toHaveBeenCalledWith(A);
    expect(audio().src).toBe(FRESH);
    expect(audio().currentTime).toBe(42);
    expect(audio().play).toHaveBeenCalledTimes(1);
    expect(result.current.playingId).toBe('a');
    expect(result.current.error).toBeNull();
  });

  it('the second failure shows a plain message, stops, and does not fetch again', async () => {
    const { result } = await playing();
    vi.mocked(getBackingTrackUrl).mockResolvedValue(FRESH);
    await act(async () => {
      audio().onerror?.();
    });
    vi.mocked(getBackingTrackUrl).mockClear();
    await act(async () => {
      audio().onerror?.();
    });
    expect(getBackingTrackUrl).not.toHaveBeenCalled();
    expect(result.current.playingId).toBeNull();
    expect(result.current.error).toBe('Could not play that track. It may have been removed.');
  });

  it('a long listen survives several expiries: each time the re-linked track is playing again it may re-link once more', async () => {
    const { result } = await playing();
    vi.mocked(getBackingTrackUrl).mockResolvedValue(FRESH);
    // First expiry (about 10 minutes in), then the re-linked element reports it is playing.
    await act(async () => {
      audio().onerror?.();
    });
    act(() => audio().onplaying?.());
    vi.mocked(getBackingTrackUrl).mockClear();
    // Second expiry (about 20 minutes in) is re-linked again instead of failing.
    await act(async () => {
      audio().onerror?.();
    });
    expect(getBackingTrackUrl).toHaveBeenCalledTimes(1);
    expect(result.current.playingId).toBe('a');
    expect(result.current.error).toBeNull();
  });

  it('a link that keeps failing without ever playing is still given up on after one re-link', async () => {
    const { result } = await playing();
    vi.mocked(getBackingTrackUrl).mockResolvedValue(FRESH);
    await act(async () => {
      audio().onerror?.();
    });
    await act(async () => {
      audio().onerror?.();
    });
    expect(result.current.error).toBe('Could not play that track. It may have been removed.');
  });

  it('a fresh play gets its own single re-link', async () => {
    const { result } = await playing();
    vi.mocked(getBackingTrackUrl).mockResolvedValue(FRESH);
    await act(async () => {
      audio().onerror?.();
    });
    await press(result, 'play', A); // stop
    await press(result, 'play', B);
    vi.mocked(getBackingTrackUrl).mockClear();
    await act(async () => {
      audio().onerror?.();
    });
    expect(getBackingTrackUrl).toHaveBeenCalledWith(B);
    expect(result.current.error).toBeNull();
  });

  it('ignores errors raised while the element holds the silent unlock clip (a non-http src)', async () => {
    const { result } = await playing();
    audio().src = SILENT_WAV_DATA_URI;
    await act(async () => {
      audio().onerror?.();
    });
    expect(getBackingTrackUrl).not.toHaveBeenCalled();
    expect(result.current.playingId).toBe('a');
    expect(result.current.error).toBeNull();
  });

  it('shows the message and stops when the re-link itself fails', async () => {
    const { result } = await playing();
    vi.mocked(getBackingTrackUrl).mockRejectedValue(new Error('Gone for good'));
    await act(async () => {
      audio().onerror?.();
    });
    expect(result.current.playingId).toBeNull();
    expect(result.current.error).toBe('Gone for good');
  });

  it('clears the position when the re-link fails, so no ghost bar is left behind', async () => {
    const { result } = await playing();
    act(() => {
      audio().duration = 100;
      audio().currentTime = 40;
      audio().ontimeupdate?.();
    });
    vi.mocked(getBackingTrackUrl).mockRejectedValue(new Error('Gone for good'));
    await act(async () => {
      audio().onerror?.();
    });
    expect(result.current.progress.getSnapshot().currentTime).toBe(0);
    expect(audio().src).toBe('');
  });

  it('keeps a paused track paused after the re-link', async () => {
    await playing();
    vi.mocked(getBackingTrackUrl).mockResolvedValue(FRESH);
    audio().paused = true;
    audio().play.mockClear();
    await act(async () => {
      audio().onerror?.();
    });
    expect(audio().src).toBe(FRESH);
    expect(audio().play).not.toHaveBeenCalled();
  });

  it('does not bring a track back when it was stopped while the new link was being fetched', async () => {
    const { result } = await playing();
    const link = deferred<string>();
    vi.mocked(getBackingTrackUrl).mockReturnValue(link.promise);
    act(() => {
      audio().onerror?.();
    });
    await act(async () => {
      await result.current.play(A); // pressing the playing track stops it
    });
    audio().play.mockClear();
    await act(async () => {
      link.resolve(FRESH);
    });
    expect(audio().src).toBe('');
    expect(audio().play).not.toHaveBeenCalled();
    expect(result.current.playingId).toBeNull();
  });

  it('resuming that is interrupted by a pause is not an error', async () => {
    const { result } = await playing();
    audio().paused = true;
    FakeAudio.playResults = [Promise.reject(new DOMException('interrupted', 'AbortError'))];
    await act(async () => result.current.togglePause());
    expect(result.current.error).toBeNull();
  });

  it('ignores an error after unmount', async () => {
    const { unmount } = await playing();
    const el = audio();
    const handler = el.onerror;
    unmount();
    await act(async () => {
      handler?.();
    });
    expect(getBackingTrackUrl).not.toHaveBeenCalled();
  });
});

describe('useBackingTracks download', () => {
  let clicked: { href: string; download: string; rel: string; inDocument: boolean }[];

  beforeEach(() => {
    clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download, rel: this.rel, inDocument: document.body.contains(this) });
    });
  });

  it('a play press while a link is being fetched does nothing, and does not stop what is playing', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    audio().pause.mockClear();
    let release!: (url: string) => void;
    vi.mocked(getBackingTrackUrl).mockImplementation(() => new Promise<string>((resolve) => { release = resolve; }));
    let download!: Promise<void>;
    await act(async () => {
      download = result.current.download(A); // a download link is in flight
    });
    vi.mocked(getBackingTrackUrl).mockClear();
    await press(result, 'play', B); // pressed meanwhile
    expect(getBackingTrackUrl).not.toHaveBeenCalled();
    expect(audio().pause).not.toHaveBeenCalled();
    expect(result.current.playingId).toBe('a');
    await act(async () => {
      release('https://signed.example/dl');
      await download;
    });
  });

  it('a download press while a link is being fetched is dropped', async () => {
    const url = deferred<string>();
    vi.mocked(getBackingTrackUrl).mockReturnValue(url.promise);
    const { result } = setup();
    let playing!: Promise<void>;
    act(() => {
      playing = result.current.play(A);
    });
    vi.mocked(getBackingTrackUrl).mockClear();
    await act(async () => {
      await result.current.download(B);
    });
    expect(getBackingTrackUrl).not.toHaveBeenCalled();
    expect(clicked).toHaveLength(0);
    await act(async () => {
      url.resolve('https://signed.example/a');
      await playing;
    });
  });

  it('asks for a download link and follows it with a temporary anchor that is removed again', async () => {
    vi.mocked(getBackingTrackUrl).mockResolvedValue('https://signed.example/dl?sig=2');
    const { result } = setup();
    await press(result, 'download', A);
    expect(getBackingTrackUrl).toHaveBeenCalledWith(A, { download: true });
    expect(clicked).toEqual([
      { href: 'https://signed.example/dl?sig=2', download: 'Label a.mp3', rel: 'noopener', inDocument: true },
    ]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('does not touch the audio element', async () => {
    const { result } = setup();
    await press(result, 'download', A);
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('shows the failure message and creates no anchor', async () => {
    vi.mocked(getBackingTrackUrl).mockRejectedValue(new Error('Link failed'));
    const { result } = setup();
    await press(result, 'download', A);
    expect(result.current.error).toBe('Link failed');
    expect(clicked).toHaveLength(0);
  });

  it('falls back to a plain message', async () => {
    vi.mocked(getBackingTrackUrl).mockRejectedValue(undefined);
    const { result } = setup();
    await press(result, 'download', A);
    expect(result.current.error).toBe('Could not download that track');
  });

  it('ignores a second click while the first link is being fetched', async () => {
    const url = deferred<string>();
    vi.mocked(getBackingTrackUrl).mockReturnValue(url.promise);
    const { result } = setup();
    let first: Promise<void>;
    act(() => {
      first = result.current.download(A);
    });
    await act(async () => {
      await result.current.download(B);
    });
    expect(getBackingTrackUrl).toHaveBeenCalledTimes(1);
    await act(async () => {
      url.resolve('https://signed.example/dl');
      await first;
    });
    expect(clicked).toHaveLength(1);
  });

  it('does not click anything when the link arrives after unmount', async () => {
    const url = deferred<string>();
    vi.mocked(getBackingTrackUrl).mockReturnValue(url.promise);
    const { result, unmount } = setup();
    let pending: Promise<void>;
    act(() => {
      pending = result.current.download(A);
    });
    unmount();
    await act(async () => {
      url.resolve('https://signed.example/dl');
      await pending;
    });
    expect(clicked).toHaveLength(0);
  });
});

describe('useBackingTracks remove / edit', () => {
  it('removes by id', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.remove(A);
    });
    expect(removeBackingTracks).toHaveBeenCalledWith(['a']);
  });

  it('stops the sound first when the removed track is the one playing', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    audio().pause.mockClear();
    await act(async () => {
      await result.current.remove(A);
    });
    expect(audio().pause).toHaveBeenCalled();
    expect(result.current.playingId).toBeNull();
    expect(removeBackingTracks).toHaveBeenCalledWith(['a']);
  });

  it('leaves playback alone when a different track is removed', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    audio().pause.mockClear();
    await act(async () => {
      await result.current.remove(B);
    });
    expect(audio().pause).not.toHaveBeenCalled();
    expect(result.current.playingId).toBe('a');
  });

  it('rethrows a failure so the confirm dialog can show it, without setting the hook error', async () => {
    vi.mocked(removeBackingTracks).mockRejectedValue(new Error("You can't change that track."));
    const { result } = setup();
    let caught: unknown;
    await act(async () => {
      caught = await result.current.remove(A).catch((e: unknown) => e);
    });
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("You can't change that track.");
    expect(result.current.error).toBeNull();
  });

  it('edit delegates to the API with the track id', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.edit(A, 'New name', ['drums']);
    });
    expect(editBackingTrack).toHaveBeenCalledWith('a', 'New name', ['drums']);
  });

  it('edit rethrows a failure', async () => {
    vi.mocked(editBackingTrack).mockRejectedValue(new Error('rename failed'));
    const { result } = setup();
    let caught: unknown;
    await act(async () => {
      caught = await result.current.edit(A, 'x', []).catch((e: unknown) => e);
    });
    expect((caught as Error).message).toBe('rename failed');
  });
});

describe('useBackingTracks progress', () => {
  it('mirrors the element position into the progress store', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    act(() => {
      audio().duration = 245;
      audio().currentTime = 83;
      audio().ontimeupdate?.();
    });
    expect(result.current.progress.getSnapshot()).toEqual({ currentTime: 83, duration: 245, paused: false });
  });

  it('reports no length while the element has none (NaN or Infinity)', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    act(() => {
      audio().duration = Infinity;
      audio().ontimeupdate?.();
    });
    expect(result.current.progress.getSnapshot().duration).toBeNull();
  });

  it('ignores events from the silent unlock clip', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    act(() => {
      audio().src = SILENT_WAV_DATA_URI;
      audio().currentTime = 9;
      audio().ontimeupdate?.();
    });
    expect(result.current.progress.getSnapshot().currentTime).toBe(0);
  });

  it('resets when playback stops or ends', async () => {
    const { result } = setup();
    await press(result, 'play', A);
    act(() => {
      audio().duration = 100;
      audio().currentTime = 50;
      audio().ontimeupdate?.();
    });
    act(() => audio().onended?.());
    expect(result.current.playingId).toBeNull();
    expect(result.current.progress.getSnapshot().currentTime).toBe(0);

    await press(result, 'play', A);
    act(() => {
      audio().duration = 100;
      audio().currentTime = 20;
      audio().ontimeupdate?.();
    });
    await act(async () => {
      await result.current.play(A);
    });
    expect(result.current.progress.getSnapshot()).toEqual({ currentTime: 0, duration: null, paused: false });
  });

  describe('seek and skip', () => {
    async function playing() {
      const hook = setup();
      await press(hook.result, 'play', A);
      act(() => {
        audio().duration = 100;
        audio().currentTime = 50;
        audio().ontimeupdate?.();
      });
      return hook;
    }

    const settle = () => act(() => void vi.advanceTimersByTime(200));

    it('moves the bar at once and the element once the burst settles', async () => {
      const { result } = await playing();
      vi.useFakeTimers();
      act(() => result.current.seek(70));
      expect(result.current.progress.getSnapshot().currentTime).toBe(70);
      expect(audio().currentTime).toBe(50);
      settle();
      expect(audio().currentTime).toBe(70);
      vi.useRealTimers();
    });

    it('sends only the last seek of a burst to the element', async () => {
      const { result } = await playing();
      vi.useFakeTimers();
      const writes: number[] = [];
      let time = 50;
      Object.defineProperty(audio(), 'currentTime', { get: () => time, set: (v: number) => (writes.push(v), (time = v)) });
      act(() => {
        result.current.seek(60);
        result.current.skip(10);
        result.current.skip(10);
      });
      expect(result.current.progress.getSnapshot().currentTime).toBe(80);
      settle();
      expect(writes).toEqual([80]);
      vi.useRealTimers();
    });

    it('keeps the bar on the pending target when the element reports its old position', async () => {
      const { result } = await playing();
      vi.useFakeTimers();
      act(() => result.current.seek(90));
      act(() => audio().ontimeupdate?.());
      expect(result.current.progress.getSnapshot().currentTime).toBe(90);
      vi.useRealTimers();
    });

    it('stays a little short of the end and of the start', async () => {
      const { result } = await playing();
      vi.useFakeTimers();
      act(() => result.current.seek(-5));
      settle();
      expect(audio().currentTime).toBe(0);
      act(() => result.current.seek(500));
      settle();
      expect(audio().currentTime).toBe(99.75);
      vi.useRealTimers();
    });

    it('drops a waiting seek when playback stops', async () => {
      const { result } = await playing();
      vi.useFakeTimers();
      act(() => result.current.seek(70));
      await act(async () => {
        await result.current.play(A);
      });
      settle();
      expect(audio().currentTime).toBe(50);
      vi.useRealTimers();
    });

    it('skips relative to where the bar is', async () => {
      const { result } = await playing();
      act(() => result.current.skip(10));
      expect(result.current.progress.getSnapshot().currentTime).toBe(60);
      act(() => result.current.skip(-10));
      expect(result.current.progress.getSnapshot().currentTime).toBe(50);
    });

    it('does nothing when the length is unknown or nothing plays', async () => {
      const idle = setup();
      act(() => idle.result.current.seek(5));
      expect(FakeAudio.instances).toHaveLength(0);

      const { result } = setup();
      await press(result, 'play', A);
      const before = audio().currentTime;
      act(() => result.current.seek(5));
      expect(audio().currentTime).toBe(before);
    });
  });

  describe('togglePause', () => {
    it('pauses, keeps the track selected, then resumes', async () => {
      const { result } = setup();
      await press(result, 'play', A);
      act(() => {
        audio().duration = 100;
        audio().currentTime = 30;
        audio().ontimeupdate?.();
      });
      act(() => result.current.togglePause());
      expect(audio().pause).toHaveBeenCalled();
      act(() => audio().onpause?.());
      expect(result.current.playingId).toBe('a');
      expect(result.current.progress.getSnapshot().paused).toBe(true);

      await act(async () => result.current.togglePause());
      expect(result.current.progress.getSnapshot()).toEqual({ currentTime: 30, duration: 100, paused: false });
    });

    it('shows an error and stays paused when the browser refuses to resume', async () => {
      const { result } = setup();
      await press(result, 'play', A);
      act(() => {
        audio().duration = 100;
        audio().ontimeupdate?.();
        audio().pause();
        audio().onpause?.();
      });
      FakeAudio.playResults = [Promise.reject(new Error('blocked'))];
      await act(async () => result.current.togglePause());
      expect(result.current.error).toBe('blocked');
      expect(result.current.progress.getSnapshot().paused).toBe(true);
    });
  });
});
