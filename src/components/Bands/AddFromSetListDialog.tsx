import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { loadMemberBandView } from '../../api/bandsApi';
import { PartialCopyError } from '../../api/partialCopyError';
import { fetchSongChoices } from '../../api/setListsApi';
import { BAND_LIMITS, type ValidSong } from '../../bandTypes';
import type { SongChoices } from '../../bandViews';
import { songIdentity } from '../../bandUtils';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useRemote } from '../../hooks/useRemote';
import { InlineAlert } from './InlineAlert';

interface AddFromSetListDialogProps {
  onOpenChange: (open: boolean) => void;
  bandId: string;
  /** The set list the songs are added to (never offered as a source). */
  setListId: string;
  /** Songs already on that list: used for the room left and to mark duplicates. */
  existingSongs: readonly ValidSong[];
  /** Copies the picked songs onto the list; rejects with a plain-language message. */
  onAdd: (songs: ValidSong[]) => Promise<void>;
}

/** "Artist · F#m · 120 BPM", whatever of it exists. */
function songDetail(song: ValidSong): string {
  return [song.artist, song.key, song.bpm ? `${song.bpm} BPM` : null].filter(Boolean).join(' · ');
}

/**
 * Picks songs from the band's other set lists and copies them onto this one as new suggestions.
 * Mount it only while open: it loads the band's set lists on mount and forgets everything on close.
 */
export function AddFromSetListDialog({ onOpenChange, bandId, setListId, existingSongs, onAdd }: AddFromSetListDialogProps) {
  const [pickedSourceId, setPickedSourceId] = useState<string | null>(null);
  // Ids ticked in the source shown; cleared whenever the source changes.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Source songs a failed attempt already copied. Remembered here (not only via the page's reload, which
  // can lag or fail) so a retry never copies them twice.
  const [landed, setLanded] = useState<ReadonlySet<string>>(new Set());
  const { run, busy, error } = useAsyncAction();

  const bandView = useRemote(`band:${bandId}`, () => loadMemberBandView(bandId));
  const view = bandView.status === 'ready' && bandView.value !== 'unavailable' ? bandView.value : null;
  const sources = useMemo(() => (view ? view.setLists.filter((s) => s.id !== setListId) : []), [view, setListId]);
  // A band with one other list needs no choosing; with several the person picks.
  const sourceId = pickedSourceId ?? (sources.length === 1 ? sources[0]!.id : null);

  const choices = useRemote<SongChoices>(view && sourceId ? `songs:${sourceId}` : null, () => fetchSongChoices(view!, sourceId!));
  const songs = choices.status === 'ready' ? choices.value.songs : [];

  const here = useMemo(() => new Set(existingSongs.map(songIdentity)), [existingSongs]);
  const room = Math.max(0, BAND_LIMITS.maxSongsPerSetList - existingSongs.length);
  const isOnList = (s: ValidSong) => landed.has(s.id) || here.has(songIdentity(s));
  const addable = songs.filter((s) => !isOnList(s));
  // Only ticks that can still be added count: after a partial failure the reload marks the copies that
  // landed as "already here", and they must not be sent (or counted) again.
  const picked = addable.filter((s) => selected.has(s.id));
  const full = picked.length >= room;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allPicked = addable.length > 0 && room > 0 && addable.slice(0, room).every((s) => selected.has(s.id));

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (picked.length === 0) return;
    const ok = await run(async () => {
      try {
        await onAdd(picked);
      } catch (e) {
        if (e instanceof PartialCopyError) setLanded((prev) => new Set([...prev, ...e.landedSongIds]));
        throw e;
      }
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add songs from another set list</DialogTitle>
            <DialogDescription>
              Copies the songs you tick onto this list as your suggestions. Votes, colors and click tracks don’t come
              along; everyone can vote on the copies afresh.
            </DialogDescription>
          </DialogHeader>

          {bandView.status === 'loading' && <p className="text-sm text-muted-foreground">Loading set lists…</p>}
          {bandView.status === 'error' && <InlineAlert tone="error">{bandView.message}</InlineAlert>}
          {bandView.status === 'ready' && bandView.value === 'unavailable' && (
            <InlineAlert tone="error">You can’t add songs to this band right now.</InlineAlert>
          )}
          {view && sources.length === 0 && (
            <p className="text-sm text-muted-foreground">This band has no other set lists to copy from.</p>
          )}

          {sources.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="copy-source">Copy from</Label>
              <Select
                value={sourceId ?? ''}
                onValueChange={(next) => {
                  setPickedSourceId(next);
                  setSelected(new Set());
                }}
              >
                <SelectTrigger id="copy-source" aria-label="Copy from">
                  <SelectValue placeholder="Choose a set list" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {sourceId && choices.status === 'loading' && <p className="text-sm text-muted-foreground">Loading songs…</p>}
          {sourceId && choices.status === 'error' && <InlineAlert tone="error">{choices.message}</InlineAlert>}
          {choices.status === 'ready' && choices.value.incomplete && (
            <InlineAlert tone="warning">That list was too long to load completely, so some songs may be missing.</InlineAlert>
          )}
          {choices.status === 'ready' && songs.length === 0 && (
            <p className="text-sm text-muted-foreground">That set list has no songs yet.</p>
          )}

          {songs.length > 0 && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {picked.length} selected · room for {room} more
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || addable.length === 0 || room === 0}
                  onClick={() => setSelected(allPicked ? new Set() : new Set(addable.slice(0, room).map((s) => s.id)))}
                >
                  {allPicked ? 'Clear selection' : 'Select all'}
                </Button>
              </div>
              <ul className="grid max-h-72 gap-1 overflow-y-auto" aria-label="Songs to copy">
                {songs.map((song) => {
                  const duplicate = isOnList(song);
                  const checked = selected.has(song.id) && !duplicate;
                  const blocked = duplicate || (!checked && full);
                  const detail = songDetail(song);
                  return (
                    <li key={song.id}>
                      <label
                        className={cn('flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40', blocked ? 'opacity-60' : 'cursor-pointer')}
                      >
                        <input
                          type="checkbox"
                          className="size-4 shrink-0"
                          checked={checked}
                          disabled={busy || blocked}
                          onChange={() => toggle(song.id)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-foreground">{song.title}</span>
                          {(detail || duplicate) && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {duplicate ? 'Already on this list' : detail}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || picked.length === 0}>
              {busy ? 'Adding…' : picked.length === 1 ? 'Add 1 song' : `Add ${picked.length} songs`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
