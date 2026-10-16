import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BAND_LIMITS } from '../../bandTypes';
import { parseSongInput, type RawSongInput } from '../../bandUtils';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useSongLinkAutofill } from '../../hooks/useSongLinkAutofill';
import { InlineAlert } from './InlineAlert';

interface SuggestSongDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing song. */
  initial?: RawSongInput;
  onSubmit: (input: RawSongInput) => Promise<void>;
}

const EMPTY: RawSongInput = { title: '', artist: '', key: '', bpm: '', notes: '', songUrl: '', tabUrl: '' };

export function SuggestSongDialog({ open, onOpenChange, initial, onSubmit }: SuggestSongDialogProps) {
  const editing = initial !== undefined;
  const ids = { title: useId(), artist: useId(), key: useId(), bpm: useId(), notes: useId(), songUrl: useId(), tabUrl: useId() };
  // The parent mounts this with a key per song, so the initial values seed state once.
  const [form, setForm] = useState<RawSongInput>({ ...EMPTY, ...initial });
  const { run, busy, error, setError } = useAsyncAction();
  const { status, fillFromLink, reset } = useSongLinkAutofill(setForm, initial?.songUrl);

  const set = (field: keyof RawSongInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseSongInput(form);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    const ok = await run(() => onSubmit(form));
    if (!ok) return;
    if (!editing) setForm(EMPTY);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit song' : 'Suggest a song'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Songs edited more than a minute after they were suggested show an “edited” note.'
                : 'It appears on the set list right away. Everyone in the band can vote on it.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor={ids.title}>Title</Label>
            <Input id={ids.title} value={form.title} onChange={set('title')} maxLength={BAND_LIMITS.titleMax} required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.artist}>Artist (optional)</Label>
            <Input id={ids.artist} value={form.artist ?? ''} onChange={set('artist')} maxLength={BAND_LIMITS.artistMax} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={ids.key}>Key (optional)</Label>
              <Input id={ids.key} value={form.key ?? ''} onChange={set('key')} placeholder="e.g. F#m" maxLength={BAND_LIMITS.keyMax} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={ids.bpm}>BPM (optional)</Label>
              <Input
                id={ids.bpm}
                inputMode="numeric"
                value={String(form.bpm ?? '')}
                onChange={set('bpm')}
                placeholder={`${BAND_LIMITS.bpmMin}–${BAND_LIMITS.bpmMax}`}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.songUrl}>Song link (optional)</Label>
            <Input
              id={ids.songUrl}
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              value={form.songUrl ?? ''}
              onChange={set('songUrl')}
              onBlur={(e) => void fillFromLink(e.target.value)}
              onPaste={(e) => void fillFromLink(e.clipboardData.getData('text'))}
              placeholder="https://open.spotify.com/…"
              aria-describedby={`${ids.songUrl}-status`}
            />
            <p id={`${ids.songUrl}-status`} role="status" className="min-h-4 text-xs text-muted-foreground">
              {status.kind === 'busy' && 'Looking up title and artist…'}
              {status.kind === 'found' && `Found “${status.title}”${status.artist ? ` by ${status.artist}` : ''}.`}
              {status.kind === 'failed' && 'Couldn’t read details from that link. Type the title and artist instead.'}
              {status.kind === 'error' && 'Couldn’t look that link up right now. Click out of the field to try again.'}
              {status.kind === 'signedOut' && 'Sign in to fill the title and artist from a link. You can still type them.'}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.tabUrl}>Tab link (optional)</Label>
            <Input
              id={ids.tabUrl}
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              value={form.tabUrl ?? ''}
              onChange={set('tabUrl')}
              placeholder="https://tabs.ultimate-guitar.com/…"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.notes}>Notes (optional)</Label>
            <textarea
              id={ids.notes}
              value={form.notes ?? ''}
              onChange={set('notes')}
              maxLength={BAND_LIMITS.notesMax}
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save' : 'Suggest'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
