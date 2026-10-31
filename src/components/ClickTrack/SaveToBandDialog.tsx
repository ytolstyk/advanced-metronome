import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TrackPiece } from '@/audio/ClickTrackEngine';
import type { SegmentGroup } from '@/clickTrackTypes';
import { loadBandView, loadMyBands } from '@/api/bandsApi';
import { fetchSongTargets } from '@/api/setListsApi';
import { saveSongTrack } from '@/api/songTracksApi';
import { bandPath, setListPath } from '@/bandRoutes';
import type { BandView, MyBandEntry } from '@/bandTypes';
import type { SongTargets } from '@/bandViews';
import { encodeBandTrack } from '@/clickTrackBand';
import { errorMessage } from '@/lib/errors';
import { InlineAlert } from '../Bands/InlineAlert';

/** One remote read that may still be loading, failed, or ready. */
type Remote<T> = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; value: T };

const IDLE = { status: 'idle' } as const;

/** Runs `load` whenever `key` changes (and is non-null), ignoring answers that arrive after a newer request. */
function useRemote<T>(key: string | null, load: () => Promise<T>): Remote<T> {
  const [state, setState] = useState<{ key: string | null; remote: Remote<T> }>({ key: null, remote: IDLE });
  const loadRef = useRef(load);
  // Keep the latest loader without re-running the load on every render (declared first, so it runs before the load effect).
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (key === null) return;
    let stale = false;
    loadRef.current().then(
      (value) => !stale && setState({ key, remote: { status: 'ready', value } }),
      (e: unknown) => !stale && setState({ key, remote: { status: 'error', message: errorMessage(e, 'Could not load this') } }),
    );
    return () => {
      stale = true;
    };
  }, [key]);

  if (key === null) return IDLE;
  // Until the first answer for this key arrives, it is loading (never show the previous key's data).
  return state.key === key ? state.remote : { status: 'loading' };
}

interface SaveToBandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pieces: TrackPiece[];
  groups: SegmentGroup[];
}

/** Picks band -> set list -> song and attaches the current track to that song for the whole band. */
export function SaveToBandDialog({ open, onOpenChange, pieces, groups }: SaveToBandDialogProps) {
  const [bandId, setBandId] = useState<string | null>(null);
  const [setListId, setSetListId] = useState<string | null>(null);
  const [songId, setSongId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<{ bandId: string; setListId: string; title: string } | null>(null);
  /** Bumped on every close: remote answers are keyed by it, so a reopened dialog never shows the last session's data. */
  const [epoch, setEpoch] = useState(0);
  /** Same idea for an in-flight save: its result is dropped if the dialog was closed (and maybe reopened) meanwhile. */
  const session = useRef(0);

  // Validate the track once per open, so an over-limit track is explained before anything is picked.
  const trackProblem = useMemo(() => {
    if (!open) return null;
    try {
      encodeBandTrack(pieces, groups);
      return null;
    } catch (e) {
      return errorMessage(e, "This track can't be saved to a band.");
    }
  }, [open, pieces, groups]);

  const bands = useRemote(open ? `${epoch}:bands` : null, loadMyBands);
  const activeBands: MyBandEntry[] = bands.status === 'ready' ? bands.value.entries.filter((e) => e.status === 'active') : [];

  const bandView = useRemote<BandView | 'unavailable'>(bandId ? `${epoch}:${bandId}` : null, async () => {
    const result = await loadBandView(bandId!);
    return result.status === 'ok' && result.view.isMember ? result.view : 'unavailable';
  });
  const view = bandView.status === 'ready' && bandView.value !== 'unavailable' ? bandView.value : null;

  const targets = useRemote<SongTargets>(view && setListId ? `${epoch}:${setListId}` : null, () =>
    fetchSongTargets(view!, setListId!),
  );
  const songs = targets.status === 'ready' ? targets.value : null;
  const song = songs?.songs.find((s) => s.id === songId) ?? null;
  const existing = song && songs ? songs.tracks.get(song.id) : undefined;

  const reset = () => {
    session.current += 1;
    setEpoch((n) => n + 1);
    setBandId(null);
    setSetListId(null);
    setSongId(null);
    setSaving(false);
    setSaveError(null);
    setSavedTo(null);
  };
  const changeOpen = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const save = async () => {
    if (!view || !song || !songs) return;
    const mine = session.current;
    setSaving(true);
    setSaveError(null);
    try {
      await saveSongTrack(view, song, pieces, groups, songs.myTrackSongIds.has(song.id));
      if (session.current === mine) setSavedTo({ bandId: view.band.id, setListId: song.setListId, title: song.title });
    } catch (e) {
      if (session.current === mine) setSaveError(errorMessage(e, 'Could not save the click track'));
    } finally {
      if (session.current === mine) setSaving(false);
    }
  };

  const nameOf = (sub: string) => view?.displayNames.get(sub) ?? 'a member';

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save to a band</DialogTitle>
          <DialogDescription>
            Attach this click track to a song in a band’s set list so every member can play, download or open it. It is saved
            at 100% speed, without count-in or loop; the editor’s speed setting isn’t saved.
          </DialogDescription>
        </DialogHeader>

        {trackProblem ? (
          <InlineAlert tone="error">{trackProblem}</InlineAlert>
        ) : savedTo ? (
          <div className="grid gap-3">
            <p role="status" className="rounded-md border border-emerald-900/50 bg-emerald-950/20 p-3 text-sm text-emerald-300">
              Saved to “{savedTo.title}”. Everyone in the band can now use it from the set list.
            </p>
            <Link to={setListPath(savedTo.bandId, savedTo.setListId)} className="text-sm text-primary">
              Open the set list
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="save-band">Band</Label>
              {bands.status === 'loading' && <p className="text-sm text-muted-foreground">Loading your bands…</p>}
              {bands.status === 'error' && <InlineAlert tone="error">{bands.message}</InlineAlert>}
              {bands.status === 'ready' && activeBands.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  You’re not in a band yet. <Link to="/bands" className="text-primary">Create or join one</Link> first.
                </p>
              )}
              {bands.status === 'ready' && bands.value.failedCount > 0 && (
                <InlineAlert tone="warning">Some of your bands couldn’t be loaded, so they’re missing from this list.</InlineAlert>
              )}
              {activeBands.length > 0 && (
                <Select
                  value={bandId ?? ''}
                  onValueChange={(next) => {
                    setBandId(next);
                    setSetListId(null);
                    setSongId(null);
                  }}
                >
                  <SelectTrigger id="save-band" aria-label="Band">
                    <SelectValue placeholder="Choose a band" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeBands.map((e) => (
                      <SelectItem key={e.band.id} value={e.band.id}>{e.band.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {bandId && (
              <div className="grid gap-1.5">
                <Label htmlFor="save-setlist">Set list</Label>
                {bandView.status === 'loading' && <p className="text-sm text-muted-foreground">Loading set lists…</p>}
                {bandView.status === 'error' && <InlineAlert tone="error">{bandView.message}</InlineAlert>}
                {bandView.status === 'ready' && bandView.value === 'unavailable' && (
                  <p className="text-sm text-muted-foreground">
                    You can’t add to this band right now. <Link to={bandPath(bandId)} className="text-primary">Open the band</Link>
                  </p>
                )}
                {view && view.setLists.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    This band has no set lists yet. <Link to={bandPath(bandId)} className="text-primary">Open the band</Link> to add one.
                  </p>
                )}
                {view && view.setLists.length > 0 && (
                  <Select
                    value={setListId ?? ''}
                    onValueChange={(next) => {
                      setSetListId(next);
                      setSongId(null);
                    }}
                  >
                    <SelectTrigger id="save-setlist" aria-label="Set list">
                      <SelectValue placeholder="Choose a set list" />
                    </SelectTrigger>
                    <SelectContent>
                      {view.setLists.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {view && setListId && (
              <div className="grid gap-1.5">
                <Label htmlFor="save-song">Song</Label>
                {targets.status === 'loading' && <p className="text-sm text-muted-foreground">Loading songs…</p>}
                {targets.status === 'error' && <InlineAlert tone="error">{targets.message}</InlineAlert>}
                {songs?.incomplete && (
                  <InlineAlert tone="warning">This set list was too long to load completely, so some songs may be missing.</InlineAlert>
                )}
                {songs && songs.songs.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    This set list has no songs yet. <Link to={setListPath(view.band.id, setListId)} className="text-primary">Suggest one</Link> first.
                  </p>
                )}
                {songs && songs.songs.length > 0 && (
                  <Select value={songId ?? ''} onValueChange={setSongId}>
                    <SelectTrigger id="save-song" aria-label="Song">
                      <SelectValue placeholder="Choose a song" />
                    </SelectTrigger>
                    <SelectContent>
                      {songs.songs.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.title}
                          {songs.tracks.has(s.id) ? ' (has a click track)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {existing && (
                  <InlineAlert tone="warning">
                    This replaces {nameOf(existing.owner)}’s click track for everyone in the band.
                  </InlineAlert>
                )}
              </div>
            )}

            {saveError && <InlineAlert tone="error">{saveError}</InlineAlert>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => changeOpen(false)}>{savedTo ? 'Close' : 'Cancel'}</Button>
          {!savedTo && !trackProblem && (
            <Button onClick={() => void save()} disabled={!song || saving}>
              {saving ? 'Saving…' : existing ? 'Replace' : 'Save'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
