import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Illustrative only: the shape of what an import produces (same rows as the real preview). */
const EXAMPLE_SEGMENTS = [
  { label: '4/4 ♩ 96', repeats: 8, color: '#8b5cf6' },
  { label: '4/4 ♩ 120', repeats: 16, color: '#06b6d4' },
  { label: '7/8 ♩ 120', repeats: 4, color: '#f59e0b' },
  { label: '4/4 ♩ 120', repeats: 12, color: '#06b6d4' },
] as const;

interface ImportTempoMapIntroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the dialog closes itself; the page opens its file picker. */
  onChooseFile: () => void;
  /** Called after the dialog closes itself when a file is dropped on it (the first one, if several). */
  onFileDropped: (file: File) => void;
}

const carriesFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

export function ImportTempoMapIntroDialog({ open, onOpenChange, onChooseFile, onFileDropped }: ImportTempoMapIntroDialogProps) {
  const [dragging, setDragging] = useState(false);

  // The whole dialog is the drop target, so a drop that misses the zone never navigates the tab to the file.
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      onOpenChange(false);
      onFileDropped(file);
    },
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setDragging(false); onOpenChange(next); }}>
      <DialogContent {...dropProps}>
        <DialogHeader>
          <DialogTitle>Import tempo map</DialogTitle>
          <DialogDescription>
            Turn a song&apos;s tempo and time signature changes into a click track.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <section aria-label="Accepted files">
            <h3 className="mb-1 font-medium">Files it accepts</h3>
            <ul className="list-disc space-y-1 pl-4">
              <li><strong>.gp</strong>: Guitar Pro 7 or 8 song files.</li>
              <li><strong>.alphatex</strong>: AlphaTex text files, a plain-text tab format.</li>
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">
              Older Guitar Pro 6 files (.gpx) aren&apos;t supported. In Guitar Pro, use Save As and pick .gp.
              Other formats, audio and PDF tabs won&apos;t work. Files can be up to 3 MB.
            </p>
          </section>

          <section aria-label="What you get">
            <h3 className="mb-1 font-medium">What you get</h3>
            <p className="text-muted-foreground">
              A preview first, so you can check it before anything changes. Then one segment per
              stretch of the song with the same tempo and time signature, with repeats already
              unrolled. Notes and chords are ignored; only the timing is used.
            </p>
            <ul className="mt-2 space-y-1 rounded-md border border-border p-2" aria-label="Example result">
              {EXAMPLE_SEGMENTS.map((segment, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: segment.color }} aria-hidden />
                  <span>{segment.label} × {segment.repeats}</span>
                </li>
              ))}
              <li className="text-xs text-muted-foreground">Example only. Your song&apos;s segments will look like this.</li>
            </ul>
          </section>

          <p className="text-xs text-muted-foreground">
            The file is read in your browser and isn&apos;t uploaded anywhere.
          </p>
        </div>

        <div
          data-dragging={dragging}
          className={cn(
            'flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-border px-3 py-5 text-sm text-muted-foreground transition-colors',
            dragging && 'border-primary bg-primary/10 text-foreground',
          )}
        >
          <FileUp size={16} aria-hidden />
          {dragging ? 'Drop to import' : 'Drag a .gp or .alphatex file here'}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="gap-1"
            onClick={() => {
              onOpenChange(false);
              onChooseFile();
            }}
          >
            <FileUp size={14} /> Choose file…
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
