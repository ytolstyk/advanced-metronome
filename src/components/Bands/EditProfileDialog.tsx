import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { updateMyProfile } from '../../api/bandsApi';
import { normalizeInstruments, type InstrumentKey } from '../../bandInstruments';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { InlineAlert } from './InlineAlert';
import { MemberProfileFields } from './MemberProfileFields';

interface EditProfileDialogProps {
  bandId: string;
  bandName: string;
  initialName: string;
  initialInstruments: readonly string[];
  onClose: () => void;
  onSettled: () => void;
}

/** Lets a member change their name and instruments in one band (mounted only while open, so state seeds once). */
export function EditProfileDialog({
  bandId,
  bandName,
  initialName,
  initialInstruments,
  onClose,
  onSettled,
}: EditProfileDialogProps) {
  const [name, setName] = useState(initialName);
  const [instruments, setInstruments] = useState<InstrumentKey[]>(() => normalizeInstruments(initialInstruments));
  const { run, busy, error } = useAsyncAction();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => updateMyProfile(bandId, name, instruments));
    onSettled(); // also after a failure: a half-applied write (or a ban found meanwhile) must not leave stale data
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Your profile in {bandName}</DialogTitle>
            <DialogDescription>Your name and the instruments you play, only in this band.</DialogDescription>
          </DialogHeader>
          <MemberProfileFields
            name={name}
            onNameChange={setName}
            instruments={instruments}
            onInstrumentsChange={setInstruments}
            autoFocus
          />
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
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
