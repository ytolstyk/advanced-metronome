import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { joinBand } from '../../api/bandsApi';
import type { InvitePreview } from '../../bandTypes';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { DisplayNameField } from './DisplayNameField';
import { InlineAlert } from './InlineAlert';
import { withInviteErrors } from './inviteMessages';

interface JoinConfirmProps {
  preview: InvitePreview;
  defaultDisplayName: string;
  onJoined: (bandId: string) => void;
}

/** "Join <band>?" step shared by the invite-code dialog and the shared-link panel. */
export function JoinConfirm({ preview, defaultDisplayName, onJoined }: JoinConfirmProps) {
  const nameId = useId();
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const { run, busy, error } = useAsyncAction();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => withInviteErrors(() => joinBand(preview.bandId, displayName)));
    if (ok) onJoined(preview.bandId);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <p className="text-sm text-foreground/80">
        Join <strong className="text-foreground">{preview.bandName}</strong>? It has {preview.memberCount}{' '}
        {preview.memberCount === 1 ? 'member' : 'members'}.
      </p>
      <DisplayNameField id={nameId} value={displayName} onChange={setDisplayName} autoFocus />
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      <Button type="submit" disabled={busy} className="justify-self-start">
        {busy ? 'Joining…' : preview.alreadyMember ? 'Open band' : 'Join band'}
      </Button>
    </form>
  );
}
