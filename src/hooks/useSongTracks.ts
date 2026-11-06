import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSongTrack, getSongTrack, type SongTrackRead } from '../api/songTracksApi';
import { ClickTrackEngine, type TrackPiece } from '../audio/ClickTrackEngine';
import type { SegmentGroup } from '../clickTrackTypes';
import { createPositionStore } from '../utils/playbackPosition';
import type { RunwayControls } from '../utils/trackRunway';
import { CLICK_EXPORT_EXTENSION, type ClickExportFormat } from '../audio/clickExportSinks';
import { exportClickTrack } from '../audio/exportClickTrack';
import { BAND_TRACK_FORMAT, BAND_TRACK_HANDOFF_KEY, serializeBandTrackHandoff } from '../clickTrackBand';
import type { SetListView, SongRecord, SongTrackSummary, ValidSong } from '../bandTypes';
import { errorMessage } from '../lib/errors';
import { sanitizeText } from '../utils/sanitizeText';
import { useOptimisticChoice } from './useOptimisticChoice';

type OkRead = Extract<SongTrackRead, { status: 'ok' }>;

const NEWER_FORMAT_PROBLEM = 'Made by a newer version of the app; update to use it.';

/** A download file name from a song title (`[\w -]` only, at most 50 characters). */
export function trackFileName(title: string, format: ClickExportFormat = 'wav'): string {
  const base = sanitizeText(title.replace(/[^\p{L}\p{N}_ -]/gu, ''), 50).trim();
  return `${base || 'click-track'}-click.${CLICK_EXPORT_EXTENSION[format]}`;
}

const identity = (song: Pick<SongRecord, 'id'>, shown: SongTrackSummary) => `${song.id}:${shown.owner}:${shown.stamp}`;

/**
 * Click tracks on a loaded set list: which song shows one, plus Play / Download / Open / Remove. The
 * set list only carries metadata, so every action fetches the payload by exact key first. Playing
 * goes through one lazily created `ClickTrackEngine` (once through, 100% speed, no count-in).
 */
export function useSongTracks(list: SetListView, fetchedAt: number, reload: () => Promise<void>) {
  const navigate = useNavigate();
  const choices = useOptimisticChoice<'removed'>(fetchedAt);
  const engineRef = useRef<ClickTrackEngine | null>(null);
  const mounted = useRef(true);
  /** The song that is playing and its track (kept for the runway). One value, so "playing" and "what is on the runway" can't disagree. */
  const [playing, setPlaying] = useState<{ songId: string; pieces: TrackPiece[]; groups: SegmentGroup[] } | null>(null);
  const playingId = playing?.songId ?? null;
  /** Where the click is. Outside React state, so a click doesn't re-render the page. */
  const [position] = useState(() => createPositionStore());
  /** Identifies the current start. The engine's beat timers can fire after `stop()` / a newer `start()`; those are ignored. */
  const runId = useRef(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Re-entrancy guard: state lags a render, so two quick clicks would both start a fetch (or a WAV render). */
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /** Why a shown track can't be used (unreadable payload), keyed by song + author + row stamp so a new save clears it. */
  const [problems, setProblems] = useState<Record<string, string>>({});
  /** Fetched tracks by song + author + row stamp: a new save changes the stamp, so a stale entry is simply never asked for. */
  const payloads = useRef(new Map<string, OkRead>());

  /** Cancels a running export when the page goes away, so it doesn't download after the person has left. */
  const exportAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    exportAbort.current = new AbortController();
    return () => {
      mounted.current = false;
      exportAbort.current?.abort();
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  // A new load means any earlier message ("just changed, refreshing…") is out of date.
  useEffect(() => {
    setError(null);
  }, [fetchedAt]);

  /** The track a song shows, or `undefined` (none, or I just removed it). */
  const trackFor = (songId: string): SongTrackSummary | undefined =>
    choices.pendingFor(songId) ? undefined : list.tracks.get(songId);

  // If the track that is playing is removed (by anyone) or its author is banned, its strip, and with it
  // the Stop button, disappears: stop the click instead of leaving it running with no way to end it.
  const playingGone = playingId !== null && trackFor(playingId) === undefined;
  useEffect(() => {
    if (!playingGone) return;
    runId.current++;
    engineRef.current?.stop();
    setPlaying(null);
  }, [playingGone]);

  const problemFor = (song: Pick<SongRecord, 'id'>): string | undefined => {
    const shown = trackFor(song.id);
    if (!shown) return undefined;
    if (shown.format > BAND_TRACK_FORMAT) return NEWER_FORMAT_PROBLEM;
    return problems[identity(song, shown)];
  };

  /** Fetches the payload and turns every non-playable outcome into a message. Null = nothing to use. */
  async function fetchUsable(song: ValidSong, shown: SongTrackSummary): Promise<OkRead | null> {
    const cached = payloads.current.get(identity(song, shown));
    if (cached) return cached;
    const read = await getSongTrack(song, shown);
    if (!mounted.current) return null;
    switch (read.status) {
      case 'ok': {
        const key = identity(song, shown);
        if (read.stale) void reload(); // someone saved since the page loaded: refresh quietly, use what we fetched
        else {
          // A stale read is for a newer row than this key names: don't cache it under it. Otherwise keep only
          // the newest version of this song, so a long session over re-saved songs doesn't grow without bound.
          for (const old of payloads.current.keys()) if (old.startsWith(`${song.id}:`)) payloads.current.delete(old);
          payloads.current.set(key, read);
        }
        return read;
      }
      case 'gone':
        setError('This click track was just changed or removed. Refreshing…');
        void reload();
        return null;
      case 'newer':
        setProblems((prev) => ({ ...prev, [identity(song, shown)]: NEWER_FORMAT_PROBLEM }));
        return null;
      case 'unreadable':
        setProblems((prev) => ({
          ...prev,
          [identity(song, shown)]: `Can't be read (${read.reason}). Replace it, or ask the band owner to remove the author.`,
        }));
        return null;
    }
  }

  /** Runs `action` on the fetched track with busy / error handling shared by Play, Download and Open. */
  async function withTrack(song: ValidSong, fallback: string, action: (read: OkRead) => Promise<void> | void) {
    const shown = trackFor(song.id);
    if (!shown || busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setBusyId(song.id);
    try {
      const read = await fetchUsable(song, shown);
      if (read && mounted.current) await action(read);
    } catch (e) {
      if (mounted.current) setError(errorMessage(e, fallback));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusyId(null);
    }
  }

  const stop = () => {
    runId.current++;
    engineRef.current?.stop();
    setPlaying(null);
  };

  const play = (song: ValidSong): Promise<void> => {
    if (playingId === song.id) {
      stop();
      return Promise.resolve();
    }
    // Unlock audio inside the click, before the fetch below awaits (iOS Safari only allows it in the gesture).
    engineRef.current ??= new ClickTrackEngine();
    engineRef.current.prime();
    return withTrack(song, 'Could not play the click track', ({ pieces, groups }) => {
      const engine = engineRef.current;
      if (!engine) return;
      const run = ++runId.current;
      position.set({ pieceIndex: 0, rep: 0, subTick: -1 });
      engine.start(
        pieces, 0, 1, false, () => undefined, () => undefined,
        () => {
          if (mounted.current && run === runId.current) setPlaying(null);
        },
        (pieceIndex, rep, subTick) => {
          if (run === runId.current) position.set({ pieceIndex, rep, subTick });
        },
      );
      setPlaying({ songId: song.id, pieces, groups });
    });
  };

  const download = (song: ValidSong, format: ClickExportFormat = 'wav'): Promise<void> =>
    withTrack(song, `Could not create the ${format.toUpperCase()}`, async ({ pieces }) => {
      await exportClickTrack(pieces, 100, trackFileName(song.title, format), format, exportAbort.current?.signal);
    });

  const open = (song: ValidSong): Promise<void> =>
    withTrack(song, 'Could not open the click track', ({ pieces, groups }) => {
      try {
        sessionStorage.setItem(BAND_TRACK_HANDOFF_KEY, serializeBandTrackHandoff({ pieces, groups }, song.title));
      } catch {
        setError("Couldn't hand the track to the editor (browser storage is blocked).");
        return;
      }
      navigate('/click-track');
    });

  /** Removes what the song shows by writing my own cleared row. Rethrows so a confirm dialog can show the failure. */
  const remove = async (song: Pick<SongRecord, 'id' | 'bandId' | 'setListId'>): Promise<void> => {
    if (playingId === song.id) stop();
    const hasOwnRow = list.myTrackSongIds.has(song.id) || choices.hasWritten(song.id);
    await choices.run(song.id, 'removed', () => clearSongTrack(song, hasOwnRow));
  };

  /** What to draw under a song while its track plays; undefined for every other song. */
  const runwayFor = (songId: string): RunwayControls | undefined =>
    playing?.songId === songId ? { pieces: playing.pieces, groups: playing.groups, position } : undefined;

  return { trackFor, problemFor, runwayFor, isPlaying: (id: string) => playingId === id, busy: busyId !== null, play, download, open, remove, error };
}
