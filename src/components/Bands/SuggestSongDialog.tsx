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
import { InlineAlert } from './InlineAlert';

interface SuggestSongDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing song. */
  initial?: RawSongInput;
  onSubmit: (input: RawSongInput) => Promise<void>;
}

const EMPTY: RawSongInput = { title: '', artist: '', key: '', bpm: '', notes: '' };

export function SuggestSongDialog({ open, onOpenChange, initial, onSubmit }: SuggestSongDialogProps) {
  const editing = initial !== undefined;
  const ids = { title: useId(), artist: useId(), key: useId(), bpm: useId(), notes: useId() };
  // The parent mounts this with a key per song, so the initial values seed state once.
  const [form, setForm] = useState<RawSongInput>({ ...EMPTY, ...initial });
  const { run, busy, error, setError } = useAsyncAction();

  const set = (field: keyof RawSongInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

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
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
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
