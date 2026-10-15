import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthGate } from '../components/AuthGate/AuthGate';
import { BandsShell } from '../components/Bands/BandsShell';
import { ConfirmDialog } from '../components/Bands/ConfirmDialog';
import { InlineAlert } from '../components/Bands/InlineAlert';
import { LoaderBoundary } from '../components/Bands/LoaderBoundary';
import { SongRow } from '../components/Bands/SongRow';
import { StatusNotice } from '../components/Bands/StatusNotice';
import { SuggestSongDialog } from '../components/Bands/SuggestSongDialog';
import { hideSong, loadBandView, unhideSong } from '../api/bandsApi';
import { deleteSong, fetchSetListRows, suggestSong, updateSong } from '../api/setListsApi';
import { BAND_GONE_TITLES, BAND_LIMITS, type BandLoadResult, type BandView, type SetListView, type ValidSong } from '../bandTypes';
import { bandPath } from '../bandRoutes';
import { assembleSetListView } from '../bandViews';
import { useActionThenReload } from '../hooks/useAsyncAction';
import { useLoader } from '../hooks/useLoader';
import { useOptimisticVotes } from '../hooks/useOptimisticVotes';

type PageData =
  | { kind: 'blocked'; status: Exclude<BandLoadResult['status'], 'ok'> }
  | { kind: 'ok'; view: BandView; list: SetListView | null; fetchedAt: number };

async function loadPage(bandId: string, setListId: string): Promise<PageData> {
  const fetchedAt = Date.now();
  // Independent reads in parallel: the band view (validation context) and the raw song/vote rows.
  const [bandResult, rows] = await Promise.all([
    loadBandView(bandId, { onlySetListId: setListId }), // this page needs one set list, not all ten
    fetchSetListRows(setListId),
  ]);
  if (bandResult.status !== 'ok') return { kind: 'blocked', status: bandResult.status };
  return { kind: 'ok', view: bandResult.view, list: assembleSetListView(bandResult.view, setListId, rows), fetchedAt };
}

export function SetListPage() {
  const { bandId = '', setListId = '' } = useParams<{ bandId: string; setListId: string }>();
  return (
    <BandsShell label="Set list" back={{ to: bandPath(bandId), text: '← Back to band' }}>
      <AuthGate message="Sign in to view this set list">
        <SetListContent key={`${bandId}/${setListId}`} bandId={bandId} setListId={setListId} />
      </AuthGate>
    </BandsShell>
  );
}

function SetListContent({ bandId, setListId }: { bandId: string; setListId: string }) {
  const { state, refreshing, refreshError, reload } = useLoader(() => loadPage(bandId, setListId));
  return (
    <LoaderBoundary
      state={state}
      refreshing={refreshing}
      refreshError={refreshError}
      reload={reload}
      loadingText="Loading set list…"
      errorPrefix="Couldn’t load this set list"
    >
      {(data) => {
        if (data.kind === 'blocked') {
          return (
            <StatusNotice title={BAND_GONE_TITLES[data.status]}>
              <Link to="/bands" className="text-primary">Back to your bands</Link>
            </StatusNotice>
          );
        }
        if (!data.view.isMember) {
          return (
            <StatusNotice title="Join this band to see its set lists">
              <Link to={bandPath(bandId)} className="text-primary">Go to the band page</Link>
            </StatusNotice>
          );
        }
        if (!data.list) {
          return (
            <StatusNotice title="Set list not found">
              It may have been archived. <Link to={bandPath(bandId)} className="text-primary">Back to the band</Link>
            </StatusNotice>
          );
        }
        return (
          <SetListDetails
            view={data.view}
            list={data.list}
            fetchedAt={data.fetchedAt}
            setListId={setListId}
            refreshing={refreshing}
            reload={reload}
          />
        );
      }}
    </LoaderBoundary>
  );
}

interface DetailsProps {
  view: BandView;
  list: SetListView;
  fetchedAt: number;
  setListId: string;
  refreshing: boolean;
  reload: () => Promise<void>;
}

function SetListDetails({ view, list, fetchedAt, setListId, refreshing, reload }: DetailsProps) {
  const { isOwner } = view;
  const votes = useOptimisticVotes(list, fetchedAt);
  const { act, error: actionError } = useActionThenReload(reload);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [editing, setEditing] = useState<ValidSong | null>(null);
  const [deleting, setDeleting] = useState<ValidSong | null>(null);

  const nameOf = (sub: string) => view.displayNames.get(sub) ?? 'a member';

  return (
    <>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold text-foreground">{list.setList.name}</h1>
          <p className="text-sm text-muted-foreground">
            {view.band.name} · Suggestions ranked by votes · {list.songs.length}/{BAND_LIMITS.maxSongsPerSetList} songs
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setSuggestOpen(true)}>Suggest a song</Button>
          <Button variant="outline" size="icon" onClick={() => void reload()} disabled={refreshing} aria-label="Refresh">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
      </header>

      {votes.error && <InlineAlert tone="error" className="mb-4">{votes.error}</InlineAlert>}
      {actionError && <InlineAlert tone="error" className="mb-4">{actionError}</InlineAlert>}
      {(list.incomplete || view.incomplete) && (
        <InlineAlert tone="warning" className="mb-4">
          This list was too long to load completely, so some members, songs or votes may be missing.
        </InlineAlert>
      )}

      {list.songs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No songs yet. Suggest the first one!
        </p>
      ) : (
        <ol className="grid gap-2">
          {list.songs.map((song, index) => (
            <SongRow
              key={song.id}
              song={song}
              rank={index + 1}
              tally={votes.tallyFor(song.id)}
              myVote={votes.myVoteFor(song.id)}
              suggestedBy={nameOf(song.owner)}
              isAuthor={song.owner === view.sub}
              isOwner={isOwner}
              isVoting={votes.isVoting(song.id)}
              onVote={(value) => void votes.vote(song, value)}
              onEdit={() => setEditing(song)}
              onDelete={() => setDeleting(song)}
              onHide={() => void act(() => hideSong(view.band.id, song.id))}
            />
          ))}
        </ol>
      )}

      {isOwner && list.hiddenSongs.length > 0 && (
        <section aria-labelledby="hidden-heading" className="mt-8">
          <h2 id="hidden-heading" className="mb-2 text-lg font-semibold text-foreground">Hidden songs</h2>
          <ul className="grid gap-1.5">
            {list.hiddenSongs.map((song) => (
              <li key={song.id} className="flex min-h-11 items-center justify-between gap-3 rounded-md bg-card px-3 py-1.5">
                <span className="min-w-0 truncate text-sm text-foreground/80">
                  {song.title} <span className="text-muted-foreground">· {nameOf(song.owner)}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void act(() => unhideSong(view.band.id, song.id))}
                  aria-label={`Restore ${song.title}`}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SuggestSongDialog
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        onSubmit={async (raw) => {
          try {
            await suggestSong(view, setListId, raw, list.songs.length);
          } finally {
            void reload(); // refresh in the background; don't keep the dialog open for it
          }
        }}
      />
      {editing && (
        <SuggestSongDialog
          key={editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          initial={{
            title: editing.title,
            artist: editing.artist ?? '',
            key: editing.key ?? '',
            bpm: editing.bpm ?? '',
            notes: editing.notes ?? '',
            songUrl: editing.songUrl ?? '',
            tabUrl: editing.tabUrl ?? '',
          }}
          onSubmit={async (raw) => {
            try {
              await updateSong(editing.id, raw);
            } finally {
              void reload();
            }
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Delete “${deleting.title}”?`}
          description="The song and its votes disappear from the set list."
          confirmLabel="Delete"
          destructive
          onConfirm={() => deleteSong(deleting.id)}
          onSettled={() => void reload()}
        />
      )}
    </>
  );
}
