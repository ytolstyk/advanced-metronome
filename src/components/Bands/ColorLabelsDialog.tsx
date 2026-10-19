import { useId, useRef, useState } from 'react';
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
import { SONG_COLOR_OPTIONS, type ColorLabels } from '../../bandSongColors';
import { BAND_LIMITS, SONG_COLOR_KEYS, type SongColorKey } from '../../bandTypes';
import { sanitizeColorLabel } from '../../bandUtils';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { InlineAlert } from './InlineAlert';

interface ColorLabelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bandName: string;
  labels: ColorLabels;
  /** Writes the labels the person edited (`''` clears one); rejects with a user-facing message on failure. */
  onSave: (next: Partial<Record<SongColorKey, string>>) => Promise<void>;
}

/** Any member can name the band's song colors ("Ballad", "Fast thrash"); everyone in the band sees the names. */
export function ColorLabelsDialog({ open, onOpenChange, bandName, labels, onSave }: ColorLabelsDialogProps) {
  const idPrefix = useId();
  // The parent mounts this only while open, so the labels seed the draft (and the baseline) once.
  const [initial] = useState(() => draftFrom(labels));
  const [draft, setDraft] = useState(initial);
  /** Colors already sent once: after a partial failure they may be saved, so a retry must send them even if reverted. */
  const sent = useRef(new Set<SongColorKey>());
  const { run, busy, error } = useAsyncAction();

  const handleOpenChange = (next: boolean) => {
    if (!busy) onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Only what this person edited, so labels another member changed meanwhile are left alone.
    const keys = SONG_COLOR_KEYS.filter((key) => draft[key] !== initial[key] || sent.current.has(key));
    keys.forEach((key) => sent.current.add(key));
    const edited = Object.fromEntries(keys.map((key) => [key, draft[key]]));
    const ok = await run(() => onSave(edited));
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Color labels</DialogTitle>
            <DialogDescription>
              Name the colors for {bandName}, like “Ballad” or “Fast thrash”. Everyone in the band sees these names and
              can change them. Other bands have their own.
            </DialogDescription>
          </DialogHeader>

          <ul className="grid gap-2">
            {SONG_COLOR_OPTIONS.map((option) => {
              const inputId = `${idPrefix}-${option.key}`;
              return (
                <li key={option.key} className="flex items-center gap-3">
                  <span
                    className="size-6 shrink-0 rounded-full border border-white/60"
                    style={{ backgroundColor: option.hex }}
                    aria-hidden
                  />
                  <Label htmlFor={inputId} className="sr-only">{`${option.label} label`}</Label>
                  <Input
                    id={inputId}
                    value={draft[option.key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [option.key]: e.target.value }))}
                    maxLength={BAND_LIMITS.colorLabelMax}
                    placeholder={option.label}
                    autoComplete="off"
                  />
                </li>
              );
            })}
          </ul>

          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function draftFrom(labels: ColorLabels): Record<SongColorKey, string> {
  // Safe: built from every SONG_COLOR_KEYS entry.
  return Object.fromEntries(SONG_COLOR_KEYS.map((key) => [key, sanitizeColorLabel(labels.get(key) ?? '')])) as Record<
    SongColorKey,
    string
  >;
}
