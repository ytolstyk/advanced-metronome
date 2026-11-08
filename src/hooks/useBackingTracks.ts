import { useEffect, useRef, useState } from 'react';
import { editBackingTrack, getBackingTrackUrl, removeBackingTracks } from '../api/backingTracksApi';
import { backingTrackFileName } from '../backingTrackUtils';
import type { InstrumentKey } from '../bandInstruments';
import type { SetListView, ValidBackingTrack } from '../bandTypes';
import { errorMessage } from '../lib/errors';
import { createProgressStore, usableDuration, type ReadableProgress } from '../utils/playerProgress';

/**
 * A valid, empty WAV (44-byte header, 8-bit mono, zero samples). Playing it inside the click unlocks the
 * audio element on iOS before the real link has been fetched; an error raised while it is the source is
 * expected and ignored.
 */
export const SILENT_WAV_DATA_URI = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/** Pause and release the media element: removing `src` alone leaves its network request and buffer alive. */
function releaseAudio(audio: HTMLAudioElement) {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}

/** A seek burst (a held arrow key, a mashed skip button) is sent to the element once it settles: each seek is a new ranged request. */
const SEEK_DEBOUNCE_MS = 150;
/** Seeks stop this far short of the end, so a skip near the end doesn't park a paused track in the "ended" state. */
const SEEK_END_MARGIN_S = 0.25;

/** `play()` rejects with this when a pause or a new source interrupts it: not a failure. */
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/**
 * Backing tracks on a loaded set list: play (one at a time), download, edit and remove. Links are fetched
 * when a button is pressed and expire after minutes; if one runs out mid-song (a seek or a long rehearsal)
 * the track is re-linked and resumes where it was, once per expiry.
 */
export function useBackingTracks(list: SetListView, fetchedAt: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mounted = useRef(true);
  /** Re-entrancy guard: state lags a render, so two quick clicks would both start a fetch. */
  const busyRef = useRef(false);
  /** Whether the current link has already been replaced once; cleared when the replacement plays. */
  const relinked = useRef(false);
  /** Bumped by every start and stop, so a re-link that finishes after either can tell it is out of date. */
  const runId = useRef(0);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The seek the element has not been given yet (null = none waiting). The bar already shows it. */
  const pendingSeek = useRef<number | null>(null);
  /** Position of the playing track; a store, not state, so the ~4 updates a second don't re-render the page. */
  const [progress] = useState(createProgressStore);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelSeek();
      if (audioRef.current) releaseAudio(audioRef.current);
      audioRef.current = null;
    };
  }, []);

  // A new load means any earlier message is out of date.
  useEffect(() => {
    setError(null);
  }, [fetchedAt]);

  function cancelSeek() {
    clearTimeout(seekTimer.current);
    pendingSeek.current = null;
  }

  /** The one way playback ends (stop, end of track, failure): supersede re-links, drop a waiting seek, free the element, clear the bar. */
  const stop = () => {
    runId.current += 1;
    cancelSeek();
    if (audioRef.current) releaseAudio(audioRef.current);
    progress.reset();
    setPlayingId(null);
  };

  /** Whether an event from `audio` is about a real track: the silent unlock clip and teardown also raise events. */
  const isLive = (audio: HTMLAudioElement) => mounted.current && !!audio.src && audio.src !== SILENT_WAV_DATA_URI;

  // If the playing track is removed (by anyone) or its author banned, its row and Stop button vanish: stop the
  // sound. Not while the list is only partly loaded: a throttled refresh must not cut the music mid-song.
  const stillListed =
    playingId === null ||
    list.incomplete ||
    [...list.backingTracks.values()].some((tracks) => tracks.some((t) => t.id === playingId));
  useEffect(() => {
    if (!stillListed) stop();
  }, [stillListed]);

  /** Runs `action` with the busy flag and a plain error message. Callers drop a second press while busy. */
  const withBusy = async (fallback: string, action: () => Promise<void>) => {
    busyRef.current = true;
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      if (mounted.current) setError(errorMessage(e, fallback));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  /** Unlock audio inside the click, before any await (iOS Safari only allows it within the gesture). */
  const unlockAudio = (): HTMLAudioElement => {
    const audio = (audioRef.current ??= new Audio());
    audio.pause();
    audio.src = SILENT_WAV_DATA_URI;
    void audio.play().catch(() => undefined);
    return audio;
  };

  /** Wires end-of-track and the single re-link for an expired signed URL. */
  const attachHandlers = (audio: HTMLAudioElement, track: ValidBackingTrack) => {
    relinked.current = false;
    // Copies the element's state into the store (the element is the truth, the store a mirror for the bar).
    // Whole seconds only: that is all the bar shows, so it re-renders once a second, not four times.
    const syncProgress = () => {
      if (!isLive(audio)) return;
      progress.set({
        currentTime: pendingSeek.current ?? Math.floor(audio.currentTime),
        duration: usableDuration(audio.duration),
        paused: audio.paused,
      });
    };
    audio.ontimeupdate = syncProgress;
    audio.onloadedmetadata = syncProgress;
    audio.ondurationchange = syncProgress;
    audio.onseeked = syncProgress;
    // `pause` fires just before `ended`; the bar is about to go, so skip the flash of "Resume".
    audio.onpause = () => {
      if (!audio.ended) syncProgress();
    };
    audio.onended = () => {
      if (mounted.current) stop();
    };
    // Playing again means the (re-)link works. A long rehearsal outlives several 10-minute links, so each
    // expiry gets its own single re-link instead of the whole track having only one.
    audio.onplaying = () => {
      relinked.current = false;
      syncProgress();
    };
    audio.onerror = () => {
      if (!isLive(audio)) return;
      if (relinked.current) {
        stop();
        setError('Could not play that track. It may have been removed.');
        return;
      }
      relinked.current = true;
      const run = runId.current;
      const resumeAt = pendingSeek.current ?? audio.currentTime;
      // A paused track that hits an expired link (a seek after a long break) is re-linked but stays paused.
      const wasPaused = audio.paused;
      cancelSeek();
      void getBackingTrackUrl(track)
        .then((fresh) => {
          // Stopped or replaced while the link was being fetched: do not bring the old track back.
          if (!mounted.current || run !== runId.current) return;
          audio.src = fresh;
          audio.currentTime = resumeAt;
          return wasPaused ? undefined : audio.play();
        })
        .catch((e) => {
          if (!mounted.current || run !== runId.current || isAbort(e)) return;
          stop();
          setError(errorMessage(e, 'Could not play that track'));
        });
    };
  };

  const play = (track: ValidBackingTrack): Promise<void> => {
    if (playingId === track.id) {
      stop();
      return Promise.resolve();
    }
    // A fetch is already running (a download, a quick second press): do nothing, and leave what is playing alone.
    if (busyRef.current) return Promise.resolve();
    const audio = unlockAudio();
    runId.current += 1;
    cancelSeek();
    progress.reset();
    setPlayingId(null);

    return withBusy('Could not play that track', async () => {
      const url = await getBackingTrackUrl(track);
      if (!mounted.current) return;
      attachHandlers(audio, track);
      audio.src = url;
      await audio.play();
      if (mounted.current) setPlayingId(track.id);
    });
  };

  /**
   * Jumps the playing track to `seconds` (kept inside the track). The bar moves at once; the element gets the
   * position once the burst settles.
   */
  const seek = (seconds: number) => {
    const audio = audioRef.current;
    const { duration } = progress.getSnapshot();
    if (!audio || playingId === null || duration === null || !Number.isFinite(seconds)) return;
    const target = Math.min(Math.max(seconds, 0), Math.max(0, duration - SEEK_END_MARGIN_S));
    pendingSeek.current = target;
    progress.patch({ currentTime: target });
    clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => {
      if (pendingSeek.current !== null) audio.currentTime = pendingSeek.current;
      pendingSeek.current = null;
    }, SEEK_DEBOUNCE_MS);
  };

  /** Relative to where the bar is, so quick presses add up before the element has moved. */
  const skip = (deltaSeconds: number) => seek(progress.getSnapshot().currentTime + deltaSeconds);

  /** Pause keeps the track selected (and its bar on screen); Stop is the button on the row. */
  const togglePause = () => {
    const audio = audioRef.current;
    if (!audio || playingId === null) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    progress.patch({ paused: false });
    audio.play().catch((e) => {
      // A pause tapped while this was still starting aborts it; the `pause` event has already set the bar.
      if (!mounted.current || isAbort(e)) return;
      progress.patch({ paused: true });
      setError(errorMessage(e, 'Could not resume that track'));
    });
  };

  const download = (track: ValidBackingTrack): Promise<void> => {
    if (busyRef.current) return Promise.resolve();
    return withBusy('Could not download that track', async () => {
      const url = await getBackingTrackUrl(track, { download: true });
      if (!mounted.current) return;
      // The link answers with `Content-Disposition: attachment`, so following it saves the file.
      const link = document.createElement('a');
      link.href = url;
      link.download = backingTrackFileName(track);
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
    });
  };

  /** Rethrow so the confirm dialog can show the failure. */
  const remove = async (track: ValidBackingTrack): Promise<void> => {
    if (playingId === track.id) stop();
    await removeBackingTracks([track.id]);
  };

  const edit = (track: ValidBackingTrack, label: string, tags: readonly InstrumentKey[]): Promise<void> =>
    editBackingTrack(track.id, label, tags);

  /** Read-only view of the position for the bar; only this hook writes it. */
  const readableProgress: ReadableProgress = progress;
  return { playingId, busy, error, progress: readableProgress, play, seek, skip, togglePause, download, remove, edit };
}
