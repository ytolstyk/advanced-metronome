import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { lookupInvite } from '../../api/bandsApi';
import type { InvitePreview } from '../../bandTypes';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { InlineAlert } from './InlineAlert';
import { JoinConfirm } from './JoinConfirm';
import { withInviteErrors } from './inviteMessages';

interface JoinBandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Code from a shared link (`/bands?join=CODE`). */
  initialCode?: string;
  /** The code was already looked up (see `useInviteLinkCheck`): open straight on the confirm step. */
  initialPreview?: InvitePreview | null;
  /** Why that lookup failed, shown until the person looks something up again. */
  initialError?: string | null;
  defaultDisplayName: string;
  onJoined: (bandId: string) => void;
}

export function JoinBandDialog({
  open,
  onOpenChange,
  initialCode = '',
  initialPreview = null,
  initialError = null,
  defaultDisplayName,
  onJoined,
}: JoinBandDialogProps) {
  const codeId = useId();
  const [code, setCode] = useState(initialCode);
  // Step 2 ("confirm") is the presence of a preview; closing the dialog goes back to step 1.
  const [preview, setPreview] = useState<InvitePreview | null>(initialPreview);
  const { run, busy, error, clearError } = useAsyncAction();
  const [carriedError, setCarriedError] = useState(initialError);

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setPreview(null);
      clearError();
      setCarriedError(null);
    }
    onOpenChange(next);
  };

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setCarriedError(null);
    let found: InvitePreview | null = null;
    const ok = await run(async () => {
      found = await withInviteErrors(() => lookupInvite(code));
    });
    if (ok) setPreview(found);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a band</DialogTitle>
          <DialogDescription>
            {preview ? 'Check the band, then confirm.' : 'Enter the invite code the band owner gave you.'}
          </DialogDescription>
        </DialogHeader>
        {preview ? (
          <JoinConfirm
            preview={preview}
            defaultDisplayName={defaultDisplayName}
            onJoined={(bandId) => {
              handleOpenChange(false);
              onJoined(bandId);
            }}
          />
        ) : (
          <form onSubmit={lookup} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={codeId}>Invite code</Label>
              <Input
                id={codeId}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABCDE-FGHJK"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="font-mono uppercase"
                required
                autoFocus
              />
            </div>
            {(error ?? carriedError) && <InlineAlert tone="error">{error ?? carriedError}</InlineAlert>}
            <Button type="submit" disabled={busy || !code.trim()} className="justify-self-start">
              {busy ? 'Looking up…' : 'Continue'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
