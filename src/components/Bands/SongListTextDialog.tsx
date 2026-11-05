import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatSongList } from '../../bandUtils';
import type { ValidSong } from '../../bandTypes';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { InlineAlert } from './InlineAlert';

interface SongListTextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setListName: string;
  /** In the order shown on the page. */
  songs: ValidSong[];
  /** Some songs may not have loaded: say so, because the copied list would silently omit them. */
  incomplete?: boolean;
}

/** The set list as a plain numbered list ("1. Song - Artist") that can be copied and pasted anywhere. */
export function SongListTextDialog({ open, onOpenChange, setListName, songs, incomplete = false }: SongListTextDialogProps) {
  // Fixed when the dialog opens (the page mounts it only while open), so a background refetch can't
  // change the text under a "Copied!" label.
  const [{ text, count }] = useState(() => ({ text: formatSongList(songs), count: songs.length }));
  const [copied, copy] = useCopyToClipboard();
  const [failed, setFailed] = useState(false);
  const label = copied ? 'Copied!' : failed ? 'Couldn’t copy' : 'Copy to clipboard';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{setListName}</DialogTitle>
          <DialogDescription>
            {count} {count === 1 ? 'song' : 'songs'}, in the order shown on the page.
          </DialogDescription>
        </DialogHeader>

        {incomplete && (
          <InlineAlert tone="warning">Some songs didn’t load, so this list may be missing some.</InlineAlert>
        )}

        {/* tabIndex lets keyboard users scroll a long list */}
        <pre
          tabIndex={0}
          role="region"
          aria-label="Song list"
          className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-sans text-sm text-foreground"
        >
          {text}
        </pre>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={async () => setFailed(!(await copy(text)))}>
            {copied ? <Check size={14} className="mr-1" aria-hidden /> : <Copy size={14} className="mr-1" aria-hidden />}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
