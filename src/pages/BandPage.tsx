import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthGate } from '../components/AuthGate/AuthGate';
import {
  ArchiveSetListDialog,
  DeleteBandDialog,
  LeaveBandDialog,
  RemoveMemberDialog,
  ResetInviteDialog,
} from '../components/Bands/BandActionDialogs';
import { AvailabilitySection, DangerZone, MembersSection, RigSection, SetListsSection } from '../components/Bands/BandSections';
import { isRigAvailable } from '../api/rigRows';
import { InviteSection } from '../components/Bands/InviteSection';
import { BandsShell } from '../components/Bands/BandsShell';
import { ConfirmDialog } from '../components/Bands/ConfirmDialog';
import { EditProfileDialog } from '../components/Bands/EditProfileDialog';
import { InlineAlert } from '../components/Bands/InlineAlert';
import { JoinConfirm } from '../components/Bands/JoinConfirm';
import { LoaderBoundary } from '../components/Bands/LoaderBoundary';
import { StatusNotice } from '../components/Bands/StatusNotice';
import { TextPromptDialog } from '../components/Bands/TextPromptDialog';
import { withInviteErrors } from '../components/Bands/inviteMessages';
import {
  dismissBand,
  ensureMyBandRow,
  loadBandView,
  previewBand,
  renameBand,
  unbanMember,
} from '../api/bandsApi';
import { createSetList, renameSetList, setSetListShared } from '../api/setListsApi';
import { BAND_GONE_TITLES, BAND_LIMITS, type BandLoadResult, type BandView } from '../bandTypes';
import { useActionThenReload, useAsyncAction } from '../hooks/useAsyncAction';
import { useDefaultDisplayName } from '../hooks/useDefaultDisplayName';
import { useLoader } from '../hooks/useLoader';

export function BandPage() {
  const { bandId = '' } = useParams<{ bandId: string }>();
  return (
    <BandsShell label="Band" back={{ to: '/bands', text: '← All bands' }}>
      <AuthGate message="Sign in to view this band">
        <BandContent key={bandId} bandId={bandId} />
      </AuthGate>
    </BandsShell>
  );
}

function BandContent({ bandId }: { bandId: string }) {
  const { state, refreshing, refreshError, reload } = useLoader(() => loadBandView(bandId));
  return (
    <LoaderBoundary
      state={state}
      refreshing={refreshing}
      refreshError={refreshError}
      reload={reload}
      loadingText="Loading band…"
      errorPrefix="Couldn’t load this band"
    >
      {(result) => <BandResult bandId={bandId} result={result} refreshing={refreshing} reload={reload} />}
    </LoaderBoundary>
  );
}

function BandResult({
  bandId,
  result,
  refreshing,
  reload,
}: {
  bandId: string;
  result: BandLoadResult;
  refreshing: boolean;
  reload: () => Promise<void>;
}) {
  if (result.status === 'not-found') {
    return <StatusNotice title={BAND_GONE_TITLES['not-found']}>This link may be wrong, or the band no longer exists.</StatusNotice>;
  }
  if (result.status === 'deleted' || result.status === 'removed') return <GoneNotice bandId={bandId} status={result.status} />;
  const { view } = result;
  if (!view.isMember) return <JoinPanel bandId={bandId} bandName={view.band.name} onJoined={() => void reload()} />;
  return <BandDetails view={view} refreshing={refreshing} reload={reload} />;
}

/** The band was deleted, or the owner removed you: all that is left is dropping it from your list. */
function GoneNotice({ bandId, status }: { bandId: string; status: 'deleted' | 'removed' }) {
  const navigate = useNavigate();
  const { run, busy, error } = useAsyncAction();
  return (
    <StatusNotice title={BAND_GONE_TITLES[status]}>
      <p className="mb-3">Dismiss it to remove it from your list.</p>
      {error && <InlineAlert tone="error" className="mb-2">{error}</InlineAlert>}
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          if (await run(() => dismissBand(bandId))) navigate('/bands');
        }}
      >
        {busy ? 'Dismissing…' : 'Dismiss'}
      </Button>
    </StatusNotice>
  );
}

/** A shared `/bands/:id` link: the id grants the capability, so offer to join. */
function JoinPanel({ bandId, bandName, onJoined }: { bandId: string; bandName: string; onJoined: () => void }) {
  const defaultName = useDefaultDisplayName();
  // Friendly text for banned/deleted/full instead of the raw error.
  const { state, refreshing, reload } = useLoader(() => withInviteErrors(() => previewBand(bandId)));
  return (
    <StatusNotice title={`Join ${bandName}?`}>
      <LoaderBoundary state={state} refreshing={refreshing} reload={reload} loadingText="Checking the band…" errorPrefix="Can’t join">
        {(preview) =>
          defaultName === null ? (
            <p>Checking the band…</p>
          ) : (
            <div className="mx-auto max-w-sm text-left">
              <JoinConfirm preview={preview} defaultDisplayName={defaultName} onJoined={onJoined} />
            </div>
          )
        }
      </LoaderBoundary>
    </StatusNotice>
  );
}

type OpenDialog =
  | { kind: 'new-set-list' }
  | { kind: 'rename-set-list'; id: string; name: string }
  | { kind: 'archive-set-list'; id: string; name: string }
  | { kind: 'share-set-list'; id: string; name: string }
  | { kind: 'rename-band' }
  | { kind: 'remove-member'; sub: string; name: string }
  | { kind: 'edit-profile' }
  | { kind: 'reset-code' }
  | { kind: 'leave' }
  | { kind: 'delete-band' };

function BandDetails({ view, refreshing, reload }: { view: BandView; refreshing: boolean; reload: () => Promise<void> }) {
  const navigate = useNavigate();
  const { band, isOwner } = view;
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const { act, error: actionError } = useActionThenReload(reload);
  const close = () => setDialog(null);
  const myMember = view.members.find((m) => m.owner === view.sub);
  const settled = () => void reload();

  // Repairs a missing private "my bands" row (e.g. the second write of a join failed).
  useEffect(() => {
    void ensureMyBandRow(band.id).catch(() => undefined);
  }, [band.id]);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold text-foreground">{band.name}</h1>
          <p className="text-sm text-muted-foreground">
            {view.members.length} {view.members.length === 1 ? 'member' : 'members'}
            {isOwner && ' · You’re the owner'}
          </p>
        </div>
        <div className="flex gap-2">
          {isOwner && (
            <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'rename-band' })}>
              Rename
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={refreshing} aria-label="Refresh">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
      </header>

      {actionError && <InlineAlert tone="error" className="mb-4">{actionError}</InlineAlert>}
      {view.incomplete && (
        <InlineAlert tone="warning" className="mb-4">
          Some members may be missing from this list (it was too long to load completely).
        </InlineAlert>
      )}

      <SetListsSection
        view={view}
        onCreate={() => setDialog({ kind: 'new-set-list' })}
        onRename={(id, name) => setDialog({ kind: 'rename-set-list', id, name })}
        onArchive={(id, name) => setDialog({ kind: 'archive-set-list', id, name })}
        onToggleShared={(id, shared) => {
          // Turning sharing on publishes more than the list: the owner confirms what that means first.
          if (!shared) return void act(() => setSetListShared(band.id, id, false));
          setDialog({ kind: 'share-set-list', id, name: view.setLists.find((s) => s.id === id)?.name ?? '' });
        }}
      />
      <AvailabilitySection bandId={band.id} />
      {isRigAvailable() && <RigSection bandId={band.id} />}
      <MembersSection
        view={view}
        onRemove={(sub, name) => setDialog({ kind: 'remove-member', sub, name })}
        onRestore={(sub) => void act(() => unbanMember(band.id, sub))}
        onEditProfile={() => setDialog({ kind: 'edit-profile' })}
      />
      <InviteSection view={view} onReset={() => setDialog({ kind: 'reset-code' })} onChanged={settled} />
      <DangerZone isOwner={isOwner} onClick={() => setDialog({ kind: isOwner ? 'delete-band' : 'leave' })} />

      {dialog?.kind === 'new-set-list' && (
        <TextPromptDialog
          open
          onOpenChange={(open) => !open && close()}
          title="New set list"
          label="Name"
          maxLength={BAND_LIMITS.nameMax}
          submitLabel="Create"
          onSubmit={async (name) => void (await createSetList(band.id, name))}
          onSettled={settled}
        />
      )}
      {dialog?.kind === 'rename-set-list' && (
        <TextPromptDialog
          key={dialog.id}
          open
          onOpenChange={(open) => !open && close()}
          title="Rename set list"
          label="Name"
          initialValue={dialog.name}
          maxLength={BAND_LIMITS.nameMax}
          submitLabel="Save"
          onSubmit={(name) => renameSetList(dialog.id, name)}
          onSettled={settled}
        />
      )}
      {dialog?.kind === 'rename-band' && (
        <TextPromptDialog
          open
          onOpenChange={(open) => !open && close()}
          title="Rename band"
          label="Band name"
          initialValue={band.name}
          maxLength={BAND_LIMITS.nameMax}
          submitLabel="Save"
          onSubmit={async (name) => void (await renameBand(band.id, name))}
          onSettled={settled}
        />
      )}
      {dialog?.kind === 'share-set-list' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title={`Share “${dialog.name}” publicly?`}
          description={
            <>
              Anyone with the link can view this list without signing in. Because of how the backend is secured,
              anyone with the link can also read the rest of this band’s data: the invite code, members’ display
              names, instruments and account IDs, votes, your other set lists, each member’s availability (the times they
              marked free, which can show when they’re away) and each member’s gear and rig diagrams. “Stop sharing” hides the list in the app but
              can’t take that access back from people who already have the link. Links and notes on the page come
              from band members and aren’t checked.
            </>
          }
          confirmLabel="Share"
          onConfirm={() => setSetListShared(band.id, dialog.id, true)}
          onSettled={settled}
        />
      )}
      {dialog?.kind === 'archive-set-list' && (
        <ArchiveSetListDialog bandId={band.id} setListId={dialog.id} name={dialog.name} onClose={close} onSettled={settled} />
      )}
      {dialog?.kind === 'remove-member' && (
        <RemoveMemberDialog bandId={band.id} sub={dialog.sub} name={dialog.name} onClose={close} onSettled={settled} />
      )}
      {dialog?.kind === 'edit-profile' && (
        <EditProfileDialog
          bandId={band.id}
          bandName={band.name}
          initialName={myMember?.displayName ?? ''}
          initialInstruments={myMember?.instruments ?? []}
          onClose={close}
          onSettled={settled}
        />
      )}
      {dialog?.kind === 'reset-code' && <ResetInviteDialog bandId={band.id} onClose={close} onSettled={settled} />}
      {dialog?.kind === 'leave' && <LeaveBandDialog band={band} onClose={close} onLeft={() => navigate('/bands')} />}
      {dialog?.kind === 'delete-band' && (
        <DeleteBandDialog bandId={band.id} onClose={close} onSettled={settled} onDeleted={() => navigate('/bands')} />
      )}
    </>
  );
}
