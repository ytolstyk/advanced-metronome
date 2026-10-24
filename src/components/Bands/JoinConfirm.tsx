import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { joinBand } from '../../api/bandsApi';
import type { InstrumentKey } from '../../bandInstruments';
import type { InvitePreview } from '../../bandTypes';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { InlineAlert } from './InlineAlert';
import { MemberProfileFields } from './MemberProfileFields';
import { withInviteErrors } from './inviteMessages';

interface JoinConfirmProps {
  preview: InvitePreview;
  defaultDisplayName: string;
  onJoined: (bandId: string) => void;
}

/** "Join <band>?" step shared by the invite-code dialog and the shared-link panel. */
export function JoinConfirm({ preview, defaultDisplayName, onJoined }: JoinConfirmProps) {
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [instruments, setInstruments] = useState<InstrumentKey[]>([]);
  const { run, busy, error } = useAsyncAction();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Already in: nothing to write (the band page repairs a missing "my bands" row), and there is no name to require.
    if (preview.alreadyMember) {
      onJoined(preview.bandId);
      return;
    }
    const ok = await run(() => withInviteErrors(() => joinBand(preview.bandId, displayName, instruments)));
    if (ok) onJoined(preview.bandId);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <p className="text-sm text-foreground/80">
        Join <strong className="text-foreground">{preview.bandName}</strong>? It has {preview.memberCount}{' '}
        {preview.memberCount === 1 ? 'member' : 'members'}.
      </p>
      {!preview.alreadyMember && (
        <MemberProfileFields
          name={displayName}
          onNameChange={setDisplayName}
          instruments={instruments}
          onInstrumentsChange={setInstruments}
          autoFocus
        />
      )}
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      <Button type="submit" disabled={busy} className="justify-self-start">
        {busy ? 'Joining…' : preview.alreadyMember ? 'Open band' : 'Join band'}
      </Button>
    </form>
  );
}
