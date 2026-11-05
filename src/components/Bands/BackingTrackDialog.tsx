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
import { AUDIO_EXTS, BACKING_TRACK_LIMITS, labelFromFileName, sanitizeLabel } from '../../backingTrackFormat';
import { ACCEPTED_EXTENSIONS_TEXT, MAX_FILE_MB, checkBackingTrackFile } from '../../backingTrackUtils';
import type { InstrumentKey } from '../../bandInstruments';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { InlineAlert } from './InlineAlert';
import { InstrumentPicker } from './InstrumentPicker';

export interface BackingTrackFormValues {
  label: string;
  tags: InstrumentKey[];
}

export interface BackingTrackSubmitOptions {
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}

/** Add: pick a file, name it, say who it is for. Edit: the file stays, only the name and who it is for change. */
type BackingTrackDialogProps = {
  songTitle: string;
  onOpenChange: (open: boolean) => void;
} & (
  | { mode: 'add'; onSubmit: (values: BackingTrackFormValues & { file: File }, options: BackingTrackSubmitOptions) => Promise<void> }
  | { mode: 'edit'; initial: BackingTrackFormValues; onSubmit: (values: BackingTrackFormValues, options: BackingTrackSubmitOptions) => Promise<void> }
);

/** Everything that differs between the two modes in one place, instead of a ternary per label. */
const TEXT = {
  add: {
    title: 'Add a backing track',
    submit: 'Add track',
    submitting: 'Uploading…',
    cancel: 'Cancel',
    cancelWhileBusy: 'Cancel upload',
  },
  edit: {
    title: 'Edit backing track',
    submit: 'Save',
    submitting: 'Saving…',
    cancel: 'Cancel',
    cancelWhileBusy: 'Cancel',
  },
} as const;

/** Upload progress at which the whole file has been sent and only the server's check remains. */
const FILE_SENT_PERCENT = 100;

const ACCEPT = [...AUDIO_EXTS.map((ext) => `.${ext}`), 'audio/*'].join(',');

/**
 * Add a backing track to a song (pick a file, name it, say who it is for) or edit one. Mounted only
 * while open, so its state starts fresh each time. An upload can be cancelled; closing the dialog
 * while one runs cancels it too.
 */
export function BackingTrackDialog(props: BackingTrackDialogProps) {
  const { songTitle, onOpenChange, mode } = props;
  const editing = mode === 'edit';
  const initial = props.mode === 'edit' ? props.initial : undefined;
  const text = TEXT[mode];
  const ids = { file: useId(), label: useId(), tags: useId() };
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [labelTouched, setLabelTouched] = useState(editing);
  const [tags, setTags] = useState<InstrumentKey[]>(initial?.tags ?? []);
  const [progress, setProgress] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const { run, busy, error, setError, clearError } = useAsyncAction();

  const pickFile = (picked: File | null) => {
    clearError();
    setFile(null);
    if (!picked) return;
    const problem = checkBackingTrackFile(picked);
    if (problem) return setError(problem);
    setFile(picked);
    if (!labelTouched) setLabel(labelFromFileName(picked.name));
  };

  const close = () => {
    abort.current?.abort(); // cancelling an upload in flight; a no-op otherwise
    onOpenChange(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (props.mode === 'add' && !file) return setError('Choose an audio file first.');
    const clean = sanitizeLabel(label);
    if (!clean) return setError('Give the track a name, for example “No drums”.');

    const controller = new AbortController();
    abort.current = controller;
    setProgress(editing ? null : 0);
    const options = { onProgress: setProgress, signal: controller.signal };
    // Narrowed once here; the edit variant takes no options (nothing to report or cancel).
    const ok = await run(() => {
      if (props.mode === 'edit') return props.onSubmit({ label: clean, tags }, options);
      return props.onSubmit({ file: file as File, label: clean, tags }, options); // `file` was checked above
    });
    abort.current = null;
    setProgress(null);
    // After a cancel the dialog is already closed (its parent unmounts it), so the abort error is never shown.
    if (ok) onOpenChange(false);
  };

  const percent = progress === null ? null : Math.round(progress * 100);
  const checking = busy && !editing && percent !== null && percent >= FILE_SENT_PERCENT;

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{text.title}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Rename the track or change who it is for. “${songTitle}”`
                : `For “${songTitle}”. Everyone in the band can play it. Only add audio you have the right to share.`}
            </DialogDescription>
          </DialogHeader>

          {!editing && (
            <div className="grid gap-1.5">
              <Label htmlFor={ids.file}>Audio file</Label>
              <Input
                id={ids.file}
                type="file"
                accept={ACCEPT}
                disabled={busy}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                aria-describedby={`${ids.file}-hint`}
              />
              <p id={`${ids.file}-hint`} className="text-xs text-muted-foreground">
                {ACCEPTED_EXTENSIONS_TEXT} · up to {MAX_FILE_MB} MB
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor={ids.label}>Name</Label>
            <Input
              id={ids.label}
              value={label}
              maxLength={BACKING_TRACK_LIMITS.labelMax}
              placeholder="e.g. No drums, Drums only, Click + guide"
              disabled={busy}
              required
              autoFocus={editing}
              onChange={(e) => {
                setLabel(e.target.value);
                setLabelTouched(true);
              }}
            />
          </div>

          <div className="grid gap-1.5">
            <span id={ids.tags} className="text-sm font-medium leading-none">Who is it for? (optional)</span>
            <InstrumentPicker labelledBy={ids.tags} value={tags} onChange={setTags} />
            <p className="text-xs text-muted-foreground">Leave all off if it is for everyone.</p>
          </div>

          {percent !== null && (
            <div className="grid gap-1">
              <progress className="h-2 w-full" max={100} value={percent} aria-label="Upload progress" />
              <p role="status" className="text-xs text-muted-foreground">
                {percent < FILE_SENT_PERCENT ? `Uploading… ${percent}%` : 'Checking the file…'}
              </p>
            </div>
          )}

          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <DialogFooter className="gap-2 sm:gap-0">
            {/* Once the whole file is sent only the server's check is left, and that cannot be cancelled. */}
            <Button type="button" variant="outline" onClick={close} disabled={checking}>
              {busy ? text.cancelWhileBusy : text.cancel}
            </Button>
            <Button type="submit" disabled={busy || (!editing && !file)}>
              {busy ? text.submitting : text.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
