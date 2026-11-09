import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SetListView, SongTrackSummary, ValidSong } from '../bandTypes';
import type { TrackPiece } from '../audio/ClickTrackEngine';

type StartArgs = [
  pieces: TrackPiece[],
  startPieceIndex: number,
  speed: number,
  countdown: boolean,
  onProgress: (pieceIndex: number, repetition: number) => void,
  onCountdown: (n: number) => void,
  onStop: () => void,
  onBeat?: (pieceIndex: number, repetition: number, subTick: number) => void,
];

const engines = vi.hoisted(() => ({ instances: [] as unknown[] }));

vi.mock('../audio/ClickTrackEngine', () => {
  class FakeEngine {
    prime = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    destroy = vi.fn();
    constructor() {
      engines.instances.push(this);
    }
  }
  return { ClickTrackEngine: FakeEngine, COUNTDOWN_BEATS: 3 };
});

vi.mock('../api/songTracksApi', () => ({
  getSongTrack: vi.fn(),
  clearSongTrack: vi.fn(),
}));

vi.mock('../audio/exportClickTrack', () => ({ exportClickTrack: vi.fn() }));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { getSongTrack } from '../api/songTracksApi';
import { COUNTDOWN_PREF_KEY, useSongTracks } from './useSongTracks';

type FakeEngineShape = { prime: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
const engine = (): FakeEngineShape => engines.instances[0] as FakeEngineShape;
const startArgs = (callIndex = 0): StartArgs => engine().start.mock.calls[callIndex] as StartArgs;

const summary: SongTrackSummary = { owner: 'sub-a', format: 1, bytes: 10, stamp: '2026-01-01T00:00:00Z' };
const songOf = (id: string): ValidSong => ({ id, bandId: 'b1', setListId: 'sl1', title: `Song ${id}` }) as unknown as ValidSong;
const songA = songOf('a');
const songB = songOf('b');

const view = (): SetListView =>
  ({
    tracks: new Map([
      ['a', summary],
      ['b', summary],
    ]),
    myTrackSongIds: new Set<string>(),
  }) as unknown as SetListView;

const piece = { id: 'p1' } as unknown as TrackPiece;

function mount() {
  const list = view();
  return renderHook(() => useSongTracks(list, 1, () => Promise.resolve()));
}

beforeEach(() => {
  engines.instances.length = 0;
  localStorage.clear();
  vi.mocked(getSongTrack).mockResolvedValue({ status: 'ok', pieces: [piece], groups: [], stale: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useSongTracks countdown preference', () => {
  it('is off by default', () => {
    expect(mount().result.current.countdownEnabled).toBe(false);
  });

  it('persists the choice under COUNTDOWN_PREF_KEY', () => {
    const { result } = mount();
    act(() => result.current.setCountdownEnabled(true));
    expect(result.current.countdownEnabled).toBe(true);
    expect(COUNTDOWN_PREF_KEY).toBe('band-click-countdown');
    expect(localStorage.getItem(COUNTDOWN_PREF_KEY)).toBe('true');
  });

  it('survives a remount', () => {
    const first = mount();
    act(() => first.result.current.setCountdownEnabled(true));
    first.unmount();
    expect(mount().result.current.countdownEnabled).toBe(true);
  });

  it('can be switched off again and stays off after a remount', () => {
    const first = mount();
    act(() => first.result.current.setCountdownEnabled(true));
    act(() => first.result.current.setCountdownEnabled(false));
    first.unmount();
    expect(mount().result.current.countdownEnabled).toBe(false);
  });

  it('treats anything other than true as off', () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, '"yes"');
    expect(mount().result.current.countdownEnabled).toBe(false);
    localStorage.setItem(COUNTDOWN_PREF_KEY, '1');
    expect(mount().result.current.countdownEnabled).toBe(false);
    localStorage.setItem(COUNTDOWN_PREF_KEY, '{not json');
    expect(mount().result.current.countdownEnabled).toBe(false);
  });
});

describe('useSongTracks play with countdown', () => {
  it('passes countdown=false to the engine and shows no count when disabled', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    expect(startArgs()[3]).toBe(false);
    expect(result.current.countdown).toBeNull();
    expect(result.current.isPlaying('a')).toBe(true);
  });

  it('passes countdown=true to the engine and starts at 3 when enabled', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    expect(startArgs()[3]).toBe(true);
    expect(result.current.countdown).toBe(3);
  });

  it('follows the numbers the engine reports', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    const onCountdown = startArgs()[5];
    act(() => onCountdown(2));
    expect(result.current.countdown).toBe(2);
    act(() => onCountdown(1));
    expect(result.current.countdown).toBe(1);
  });

  it('clears the count when the first bar begins', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    act(() => startArgs()[4](0, 0));
    expect(result.current.countdown).toBeNull();
    expect(result.current.isPlaying('a')).toBe(true);
  });

  it('clears the count and playing state when the track ends', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    act(() => startArgs()[6]());
    expect(result.current.countdown).toBeNull();
    expect(result.current.isPlaying('a')).toBe(false);
  });

  it('clears the count when Stop is pressed mid-countdown', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    expect(result.current.countdown).toBe(3);
    await act(async () => {
      await result.current.play(songA); // second press on the playing song = stop
    });
    expect(engine().stop).toHaveBeenCalled();
    expect(result.current.countdown).toBeNull();
    expect(result.current.isPlaying('a')).toBe(false);
  });

  it('ignores countdown, first-bar and end callbacks of a superseded run', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    const first = startArgs(0);
    await act(async () => {
      await result.current.play(songB); // newer start supersedes song A's run
    });
    expect(engine().start).toHaveBeenCalledTimes(2);
    expect(result.current.countdown).toBe(3);

    act(() => first[5](1)); // a late number from the old run
    expect(result.current.countdown).toBe(3);

    act(() => first[4](0, 0)); // the old run's first-bar callback must not end the new count-in
    expect(result.current.countdown).toBe(3);

    act(() => first[6]()); // the old run's end must not stop the new one
    expect(result.current.countdown).toBe(3);
    expect(result.current.isPlaying('b')).toBe(true);
  });

  it('uses the setting at the time of Play, not a later change', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    expect(startArgs()[3]).toBe(false);
    act(() => result.current.setCountdownEnabled(true));
    expect(result.current.countdown).toBeNull(); // does not retroactively start a count
    await act(async () => {
      await result.current.play(songA); // stop
    });
    await act(async () => {
      await result.current.play(songA); // start again with the new setting
    });
    expect(startArgs(1)[3]).toBe(true);
    expect(result.current.countdown).toBe(3);
  });
});

describe('useSongTracks runwayFor countIn', () => {
  it('has no countIn when the countdown was off at Play', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    const runway = result.current.runwayFor('a');
    expect(runway).toBeDefined();
    expect(runway!.countIn).toBeUndefined();
  });

  it('is undefined for a song that is not playing', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    expect(result.current.runwayFor('b')).toBeUndefined();
  });

  it('is undefined before anything plays', () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    expect(mount().result.current.runwayFor('a')).toBeUndefined();
  });

  it('has countIn with beat 3 right after Play when the countdown was on', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    expect(result.current.runwayFor('a')!.countIn).toEqual({ beat: 3 });
  });

  it('follows the count 3, 2, 1', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    act(() => startArgs()[5](2));
    expect(result.current.runwayFor('a')!.countIn).toEqual({ beat: 2 });
    act(() => startArgs()[5](1));
    expect(result.current.runwayFor('a')!.countIn).toEqual({ beat: 1 });
  });

  it('keeps countIn but with beat null once the first bar starts', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    act(() => startArgs()[4](0, 0));
    expect(result.current.runwayFor('a')!.countIn).toEqual({ beat: null });
  });

  it('keeps beat null on later bars', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    act(() => startArgs()[4](0, 0));
    act(() => startArgs()[4](0, 1));
    expect(result.current.runwayFor('a')!.countIn).toEqual({ beat: null });
  });

  it('does not add countIn to a run started with the countdown off, even if it is switched on mid-run', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    act(() => result.current.setCountdownEnabled(true));
    expect(result.current.runwayFor('a')!.countIn).toBeUndefined();
  });

  it('keeps countIn on a run started with the countdown on, even if it is switched off mid-run', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    act(() => result.current.setCountdownEnabled(false));
    expect(result.current.runwayFor('a')!.countIn).toEqual({ beat: 3 });
  });

  it('returns the pieces, groups and a position store alongside countIn', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    const runway = result.current.runwayFor('a')!;
    expect(runway.pieces).toEqual([piece]);
    expect(runway.groups).toEqual([]);
    expect(typeof runway.position.getSnapshot).toBe('function');
  });

  it('is undefined again after the track ends', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    act(() => startArgs()[6]());
    expect(result.current.runwayFor('a')).toBeUndefined();
  });

  it('gets a fresh count of 3 when the same song is played again after stopping', async () => {
    localStorage.setItem(COUNTDOWN_PREF_KEY, 'true');
    const { result } = mount();
    await act(async () => {
      await result.current.play(songA);
    });
    act(() => startArgs()[4](0, 0));
    await act(async () => {
      await result.current.play(songA); // stop
    });
    await act(async () => {
      await result.current.play(songA); // start again
    });
    expect(result.current.runwayFor('a')!.countIn).toEqual({ beat: 3 });
  });
});
