import { useEffect, useRef, useState } from 'react';
import { editBackingTrack, getBackingTrackUrl, removeBackingTracks } from '../api/backingTracksApi';
import { backingTrackFileName } from '../backingTrackUtils';
import type { InstrumentKey } from '../bandInstruments';
import type { SetListView, ValidBackingTrack } from '../bandTypes';
import { errorMessage } from '../lib/errors';

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
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (audioRef.current) releaseAudio(audioRef.current);
      audioRef.current = null;
    };
  }, []);

  // A new load means any earlier message is out of date.
  useEffect(() => {
    setError(null);
  }, [fetchedAt]);

  const stop = () => {
    if (audioRef.current) releaseAudio(audioRef.current);
    setPlayingId(null);
  };

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
    audio.onended = () => {
      if (mounted.current) setPlayingId(null);
    };
    // Playing again means the (re-)link works. A long rehearsal outlives several 10-minute links, so each
    // expiry gets its own single re-link instead of the whole track having only one.
    audio.onplaying = () => {
      relinked.current = false;
    };
    audio.onerror = () => {
      // The silent unlock clip and teardown also raise errors; only a failing signed link matters.
      if (!mounted.current || !audio.src || audio.src === SILENT_WAV_DATA_URI) return;
      if (relinked.current) {
        setPlayingId(null);
        setError('Could not play that track. It may have been removed.');
        return;
      }
      relinked.current = true;
      const resumeAt = audio.currentTime;
      void getBackingTrackUrl(track)
        .then((fresh) => {
          if (!mounted.current) return;
          audio.src = fresh;
          audio.currentTime = resumeAt;
          return audio.play();
        })
        .catch((e) => {
          if (!mounted.current) return;
          setPlayingId(null);
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

  return { playingId, busy, error, play, download, remove, edit };
}
