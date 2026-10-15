import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AuthGate } from '../components/AuthGate/AuthGate';
import { BandCard } from '../components/Bands/BandCard';
import { BandsShell } from '../components/Bands/BandsShell';
import { CreateBandDialog } from '../components/Bands/CreateBandDialog';
import { InlineAlert } from '../components/Bands/InlineAlert';
import { JoinBandDialog } from '../components/Bands/JoinBandDialog';
import { LoaderBoundary } from '../components/Bands/LoaderBoundary';
import { loadMyBands, pruneDeadBands } from '../api/bandsApi';
import { clearJoinCode, readJoinCode, storeJoinCode } from '../bandJoinCode';
import { bandPath } from '../bandRoutes';
import { useDefaultDisplayName } from '../hooks/useDefaultDisplayName';
import { useLoader } from '../hooks/useLoader';

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
      <AuthGate message="Sign in to create or join a band">
        <BandsContent initialJoinCode={joinCode} />
      </AuthGate>
    </BandsShell>
  );
}

function BandsContent({ initialJoinCode }: { initialJoinCode: string }) {
  const navigate = useNavigate();
  const { state, refreshing, refreshError, reload } = useLoader(loadMyBands);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(initialJoinCode !== '');
  const defaultName = useDefaultDisplayName();

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
      <div className="mb-5 flex flex-wrap gap-2">
        <Button onClick={() => setCreateOpen(true)}>Create a band</Button>
        <Button variant="outline" onClick={() => setJoinOpen(true)}>
          Join with a code
        </Button>
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
          <>
            {failedCount > 0 && (
              <InlineAlert tone="warning" className="mb-4">
                {failedCount === 1 ? '1 band' : `${failedCount} bands`} couldn’t be loaded. Refresh to try again.
              </InlineAlert>
            )}
            {entries.length === 0 ? (
              failedCount === 0 && (
                <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  You’re not in a band yet. Create one, or join with a code from your bandmates.
                </p>
              )
            ) : (
              <ul className="grid gap-2">
                {entries.map((entry) => (
                  <BandCard key={entry.band.id} entry={entry} onDismissed={() => void reload()} />
                ))}
              </ul>
            )}
          </>
        )}
      </LoaderBoundary>

      {/* Mounted once the suggested name is known, so seeded fields are never reset under the user. */}
      {defaultName !== null && (
        <>
          <CreateBandDialog open={createOpen} onOpenChange={setCreateOpen} defaultDisplayName={defaultName} onCreated={openBand} />
          <JoinBandDialog
            open={joinOpen}
            onOpenChange={(open) => {
              setJoinOpen(open);
              if (!open) clearJoinCode();
            }}
            initialCode={initialJoinCode}
            defaultDisplayName={defaultName}
            onJoined={openBand}
          />
        </>
      )}
    </>
  );
}
