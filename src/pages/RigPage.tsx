import { useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AuthGate } from '../components/AuthGate/AuthGate';
import { BandsShell } from '../components/Bands/BandsShell';
import { LoaderBoundary } from '../components/Bands/LoaderBoundary';
import { RigWorkspace } from '../components/Bands/Rig/RigWorkspace';
import { StatusNotice } from '../components/Bands/StatusNotice';
import { loadRigPage } from '../api/rigApi';
import type { RigPageResult } from '../api/rigApi';
import { bandPath } from '../bandRoutes';
import { BAND_GONE_TITLES } from '../bandTypes';
import { useLoader } from '../hooks/useLoader';
import type { RigRead } from '../rigData';

/** Rows are small and rarely change under you: refetch on focus at most this often. */
const RIG_FOCUS_REFETCH_MS = 5 * 60_000;

export function RigPage() {
  const { bandId = '' } = useParams<{ bandId: string }>();
  return (
    <BandsShell label="Gear and rigs" wide back={{ to: bandPath(bandId), text: '← Back to band' }}>
      <AuthGate message="Sign in to see your band’s gear and rigs">
        <RigContent key={bandId} bandId={bandId} />
      </AuthGate>
    </BandsShell>
  );
}

function RigContent({ bandId }: { bandId: string }) {
  const previous = useRef<ReadonlyMap<string, RigRead> | undefined>(undefined);
  const { state, refreshing, refreshError, reload } = useLoader(
    async () => {
      const result = await loadRigPage(bandId, previous.current);
      if (result.status === 'ok') previous.current = result.reads;
      return result;
    },
    { focusRefetchMs: RIG_FOCUS_REFETCH_MS },
  );
  return (
    <LoaderBoundary
      state={state}
      refreshing={refreshing}
      refreshError={refreshError}
      reload={reload}
      loadingText="Loading gear and rigs…"
      errorPrefix="Couldn’t load gear and rigs"
    >
      {(result) => <RigResult bandId={bandId} result={result} refreshing={refreshing} reload={reload} />}
    </LoaderBoundary>
  );
}

function RigResult({
  bandId,
  result,
  refreshing,
  reload,
}: {
  bandId: string;
  result: RigPageResult;
  refreshing: boolean;
  reload: () => Promise<void>;
}) {
  const toBand = (
    <Link to={bandPath(bandId)} className="text-primary underline">
      Go to the band page
    </Link>
  );
  if (result.status === 'unavailable') {
    return (
      <StatusNotice title="Gear and rigs aren’t available yet">
        The app is still being updated. Please try again in a few minutes.
      </StatusNotice>
    );
  }
  if (result.status === 'not-found') {
    return <StatusNotice title={BAND_GONE_TITLES['not-found']}>This link may be wrong, or the band no longer exists.</StatusNotice>;
  }
  if (result.status === 'deleted' || result.status === 'removed') {
    return <StatusNotice title={BAND_GONE_TITLES[result.status]}>{toBand} to remove it from your list.</StatusNotice>;
  }
  if (!result.view.isMember) {
    return <StatusNotice title="Join this band first">{toBand} to join, then come back to share your gear and rigs.</StatusNotice>;
  }
  const own = result.members.find((m) => m.owner === result.view.sub);
  if (!own) {
    return <StatusNotice title="Couldn’t find your gear and rigs">Please refresh the page and try again.</StatusNotice>;
  }
  return <RigWorkspace data={result} own={own} refreshing={refreshing} reload={reload} />;
}
