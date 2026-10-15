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
import { createBand } from '../../api/bandsApi';
import { BAND_LIMITS } from '../../bandTypes';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { DisplayNameField } from './DisplayNameField';
import { InlineAlert } from './InlineAlert';

interface CreateBandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDisplayName: string;
  onCreated: (bandId: string) => void;
}

export function CreateBandDialog({ open, onOpenChange, defaultDisplayName, onCreated }: CreateBandDialogProps) {
  const nameId = useId();
  const displayNameId = useId();
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const { run, busy, error } = useAsyncAction();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let bandId = '';
    const ok = await run(async () => {
      bandId = (await createBand(name, displayName)).id;
    });
    if (!ok) return;
    onOpenChange(false);
    onCreated(bandId);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Create a band</DialogTitle>
            <DialogDescription>
              You become the owner. This band belongs to the way you signed in today (Google and
              email/password are separate accounts).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={nameId}>Band name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={BAND_LIMITS.nameMax}
              required
              autoFocus
            />
          </div>
          <DisplayNameField id={displayNameId} value={displayName} onChange={setDisplayName} />
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create band'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
