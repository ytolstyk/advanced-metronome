import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BandsShell } from '../components/Bands/BandsShell';
import { InlineAlert } from '../components/Bands/InlineAlert';
import { LoaderBoundary } from '../components/Bands/LoaderBoundary';
import { SharedSongRow } from '../components/Bands/SharedSongRow';
import { StatusNotice } from '../components/Bands/StatusNotice';
import { loadSharedSetList } from '../api/sharedSetListApi';
import { BAND_LIMITS, type SharedSetListResult } from '../bandTypes';
import { setListPath } from '../bandRoutes';
import { EMPTY_TALLY } from '../bandUtils';
import { useLoader } from '../hooks/useLoader';

/** A public link needs a calm refetch rate: every returning tab costs the owner a full read. */
const PUBLIC_FOCUS_REFETCH_MS = 5 * 60_000;

/**
 * Read-only view of a set list its band shares publicly. Works signed out: no auth gate, no
 * writes, no member names. Everything shown has passed the same validators as the members' page.
 */
export function SharedSetListPage() {
  const { setListId = '' } = useParams<{ setListId: string }>();
  useEffect(() => {
    // Shared links are for people who were given them, not for search results.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  return (
    <BandsShell label="Shared set list">
      <SharedSetListContent key={setListId} setListId={setListId} />
    </BandsShell>
  );
}

function SharedSetListContent({ setListId }: { setListId: string }) {
  const { state, refreshing, refreshError, reload } = useLoader(() => loadSharedSetList(setListId), { focusRefetchMs: PUBLIC_FOCUS_REFETCH_MS });
  return (
    <LoaderBoundary
      state={state}
      refreshing={refreshing}
      refreshError={refreshError}
      reload={reload}
      loadingText="Loading set list…"
      errorPrefix="Couldn’t load this set list"
    >
      {(result) => <SharedSetListResultView result={result} refreshing={refreshing} reload={reload} />}
    </LoaderBoundary>
  );
}

function SharedSetListResultView({
  result,
  refreshing,
  reload,
}: {
  result: SharedSetListResult;
  refreshing: boolean;
  reload: () => Promise<void>;
}) {
  if (result.status === 'unavailable') {
    return (
      <StatusNotice title="This set list isn’t available">
        The link may be wrong, or the band has stopped sharing it.
      </StatusNotice>
    );
  }
  const { view, list } = result;
  return (
    <>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold text-foreground">{list.setList.name}</h1>
          <p className="text-sm text-muted-foreground">
            {view.band.name} · Shared set list, ranked by the band’s votes · {list.songs.length}/{BAND_LIMITS.maxSongsPerSetList} songs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view.isMember && (
            <Link to={setListPath(view.band.id, list.setList.id)} className="text-sm text-primary">
              Open in your band
            </Link>
          )}
          <Button variant="outline" size="icon" onClick={() => void reload()} disabled={refreshing} aria-label="Refresh">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
      </header>

      {(list.incomplete || view.incomplete) && (
        <InlineAlert tone="warning" className="mb-4">
          This list was too long to load completely, so some songs or votes may be missing.
        </InlineAlert>
      )}

      <p className="mb-3 text-xs text-muted-foreground">Songs, links and notes are added by band members and aren’t checked.</p>

      {list.songs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No songs yet.
        </p>
      ) : (
        <ol className="grid gap-2">
          {list.songs.map((song, index) => (
            <SharedSongRow key={song.id} song={song} rank={index + 1} tally={list.tallies.get(song.id) ?? EMPTY_TALLY} />
          ))}
        </ol>
      )}
    </>
  );
}
