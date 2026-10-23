import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AuthGate } from '../components/AuthGate/AuthGate';
import { BandCard } from '../components/Bands/BandCard';
import { BandsShell } from '../components/Bands/BandsShell';
import { CreateBandDialog } from '../components/Bands/CreateBandDialog';
import { ExpiredInviteNotice } from '../components/Bands/ExpiredInviteNotice';
import { InlineAlert } from '../components/Bands/InlineAlert';
import { JoinBandDialog } from '../components/Bands/JoinBandDialog';
import { LoaderBoundary } from '../components/Bands/LoaderBoundary';
import { loadMyBands, pruneDeadBands } from '../api/bandsApi';
import { loadFromStorage, saveToStorage } from '../api/storageUtils';
import { clearJoinCode, readJoinCode, storeJoinCode } from '../bandJoinCode';
import { bandPath } from '../bandRoutes';
import type { InvitePreview, MyBandEntry } from '../bandTypes';
import { useDefaultDisplayName } from '../hooks/useDefaultDisplayName';
import { useInviteLinkCheck } from '../hooks/useInviteLinkCheck';
import { useLoader } from '../hooks/useLoader';

const ONLY_MY_BANDS_KEY = 'bands-only-mine';

function loadOnlyMine(): boolean {
  return loadFromStorage<unknown>(ONLY_MY_BANDS_KEY, true) !== false; // anything but a stored `false` means on
}

export function BandsPage() {
  const [params, setParams] = useSearchParams();

  // A shared link (`/bands?join=CODE`) must survive the sign-in round trip: read it on first
  // render, keep it in sessionStorage, and strip it from the URL (it is a capability).
  const [joinCode] = useState(() => params.get('join') ?? readJoinCode());
  useEffect(() => {
    const code = params.get('join');
    if (!code) return;
    storeJoinCode(code);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('join');
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);

  return (
    <BandsShell label="Bands">
      <header className="mb-6">
        <h1 className="mb-1 text-2xl font-bold text-foreground">Bands</h1>
        <p className="text-sm text-muted-foreground">
          Share set lists with your band, suggest songs and vote on what to play.
        </p>
      </header>
      <AuthGate
        prominent
        title="Bands are for signed-in users"
        message="Create a band, join one with an invite code, build set lists and vote on songs together. Sign in or create a free account to get started."
      >
        <BandsContent initialJoinCode={joinCode} />
      </AuthGate>
    </BandsShell>
  );
}

interface BandListProps {
  entries: MyBandEntry[];
  failedCount: number;
  /** Hide bands you were removed from. */
  onlyMine: boolean;
  onDismissed: () => void;
}

function BandList({ entries, failedCount, onlyMine, onDismissed }: BandListProps) {
  const visible = onlyMine ? entries.filter((e) => e.status === 'active') : entries;
  const hiddenCount = entries.length - visible.length;
  return (
    <>
      {failedCount > 0 && (
        <InlineAlert tone="warning" className="mb-4">
          {failedCount === 1 ? '1 band' : `${failedCount} bands`} couldn’t be loaded. Refresh to try again.
        </InlineAlert>
      )}
      {visible.length > 0 ? (
        <ul className="grid gap-2">
          {visible.map((entry) => (
            <BandCard key={entry.band.id} entry={entry} onDismissed={onDismissed} />
          ))}
        </ul>
      ) : (
        failedCount === 0 && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {entries.length > 0
              ? 'No bands to show. Uncheck “Only bands I’m in” to see bands you were removed from.'
              : 'You’re not in a band yet. Create one, or join with a code from your bandmates.'}
          </p>
        )
      )}
      {hiddenCount > 0 && (visible.length > 0 || failedCount > 0) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {hiddenCount === 1 ? '1 band you were removed from is hidden.' : `${hiddenCount} bands you were removed from are hidden.`}
        </p>
      )}
    </>
  );
}

/**
 * A shared invite link is checked before anything else is shown, so a dead one gets its own page
 * (not a flash of the band list, and no buttons that do nothing while the lookup runs).
 */
function BandsContent({ initialJoinCode }: { initialJoinCode: string }) {
  const linkCheck = useInviteLinkCheck(initialJoinCode);
  const [leftNotice, setLeftNotice] = useState<'back' | 'enter' | null>(null);
  const isDead = linkCheck.status === 'dead';
  useEffect(() => {
    if (isDead) clearJoinCode(); // a dead code is worth nothing; the notice does not need it
  }, [isDead]);

  if (linkCheck.status === 'checking') return <p className="text-sm text-muted-foreground">Checking your invite link…</p>;
  if (linkCheck.status === 'dead' && leftNotice === null) {
    return (
      <ExpiredInviteNotice
        reason={linkCheck.reason}
        onEnterCode={() => setLeftNotice('enter')}
        onDismiss={() => setLeftNotice('back')}
      />
    );
  }
  return (
    <BandsHome
      joinCode={isDead ? '' : initialJoinCode}
      joinPreview={linkCheck.status === 'good' ? linkCheck.preview : null}
      joinError={linkCheck.status === 'other' ? linkCheck.message : null}
      initialJoinOpen={leftNotice === 'enter' || linkCheck.status === 'good' || linkCheck.status === 'other'}
    />
  );
}

interface BandsHomeProps {
  /** Code for the join dialog (empty when there is no usable link). */
  joinCode: string;
  /** The link was already looked up: the join dialog opens on its confirm step. */
  joinPreview: InvitePreview | null;
  /** Why the link's lookup failed, shown in the join dialog. */
  joinError: string | null;
  initialJoinOpen: boolean;
}

function BandsHome({ joinCode, joinPreview, joinError, initialJoinOpen }: BandsHomeProps) {
  const navigate = useNavigate();
  const { state, refreshing, refreshError, reload } = useLoader(loadMyBands);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(initialJoinOpen);
  const defaultName = useDefaultDisplayName();
  // Checked: only bands you are in (owner or member). Unchecked: also bands you were removed from.
  const [onlyMine, setOnlyMine] = useState(loadOnlyMine);
  const changeOnlyMine = (value: boolean) => {
    setOnlyMine(value);
    try {
      saveToStorage(ONLY_MY_BANDS_KEY, value);
    } catch {
      // A full or blocked store only means the choice isn't remembered.
    }
  };

  // Tombstoned bands are dropped from the caller's list once, explicitly (loading never writes).
  const deadBandIds = state.status === 'ready' ? state.data.deadBandIds : null;
  useEffect(() => {
    if (deadBandIds && deadBandIds.length > 0) void pruneDeadBands(deadBandIds);
  }, [deadBandIds]);

  const openBand = (bandId: string) => {
    clearJoinCode();
    navigate(bandPath(bandId));
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button onClick={() => setCreateOpen(true)}>Create a band</Button>
        <Button variant="outline" onClick={() => setJoinOpen(true)}>
          Join with a code
        </Button>
        <label className="ml-auto flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => changeOnlyMine(e.target.checked)}
            className="size-4 accent-primary"
          />
          Only bands I’m in
        </label>
      </div>

      <LoaderBoundary
        state={state}
        refreshing={refreshing}
        refreshError={refreshError}
        reload={reload}
        loadingText="Loading your bands…"
        errorPrefix="Couldn’t load your bands"
      >
        {({ entries, failedCount }) => (
          <BandList entries={entries} failedCount={failedCount} onlyMine={onlyMine} onDismissed={() => void reload()} />
        )}
      </LoaderBoundary>

      {/* Mounted once the suggested name is known (and, for a shared link, after its check), so seeded fields are never reset under the user. */}
      {defaultName !== null && (
        <>
          <CreateBandDialog open={createOpen} onOpenChange={setCreateOpen} defaultDisplayName={defaultName} onCreated={openBand} />
          <JoinBandDialog
            open={joinOpen}
            onOpenChange={(open) => {
              setJoinOpen(open);
              if (!open) clearJoinCode();
            }}
            initialCode={joinCode}
            initialPreview={joinPreview}
            initialError={joinError}
            defaultDisplayName={defaultName}
            onJoined={openBand}
          />
        </>
      )}
    </>
  );
}
