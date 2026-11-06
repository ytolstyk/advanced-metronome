import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDownUp, CopyPlus, ListOrdered, RefreshCw, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AuthGate } from '../components/AuthGate/AuthGate';
import { AddFromSetListDialog } from '../components/Bands/AddFromSetListDialog';
import { BandsShell } from '../components/Bands/BandsShell';
import { CARD_SURFACE } from '../components/Bands/cardStyles';
import { ColorLabelsDialog } from '../components/Bands/ColorLabelsDialog';
import { ConfirmDialog } from '../components/Bands/ConfirmDialog';
import { CopyShareLinkButton } from '../components/Bands/CopyShareLinkButton';
import { InlineAlert } from '../components/Bands/InlineAlert';
import { LoaderBoundary } from '../components/Bands/LoaderBoundary';
import { SetListReorderList } from '../components/Bands/SetListReorderList';
import { SongListTextDialog } from '../components/Bands/SongListTextDialog';
import { SongRow, type SongClickTrackControls } from '../components/Bands/SongRow';
import { StatusNotice } from '../components/Bands/StatusNotice';
import { SuggestSongDialog } from '../components/Bands/SuggestSongDialog';
import { hideSong, loadBandView, unhideSong } from '../api/bandsApi';
import { fetchColorLabelRows } from '../api/colorLabelsApi';
import { addSongsFromOtherLists, deleteSong, fetchSetListRows, reorderSongs, suggestSong, updateSong } from '../api/setListsApi';
import {
  BAND_GONE_TITLES,
  BAND_LIMITS,
  type BandLoadResult,
  type BandView,
  type SetListView,
  type ValidSong,
} from '../bandTypes';
import { bandPath } from '../bandRoutes';
import { applySongOrder, songToRawInput } from '../bandUtils';
import { assembleSetListView } from '../bandViews';
import { useBackingTrackSection } from '../hooks/useBackingTrackSection';
import { useColorLabels } from '../hooks/useColorLabels';
import { useActionThenReload } from '../hooks/useAsyncAction';
import { useLoader } from '../hooks/useLoader';
import { useOptimisticVotes } from '../hooks/useOptimisticVotes';
import { useSongColors } from '../hooks/useSongColors';
import { useSongTracks } from '../hooks/useSongTracks';

/** "Oct 31, 2026" from a server timestamp; empty when it can't be read. */
function shortDate(stamp: string): string {
  const time = Date.parse(stamp);
  return Number.isNaN(time) ? '' : new Date(time).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

type PageData =
  | { kind: 'blocked'; status: Exclude<BandLoadResult['status'], 'ok'> }
  | { kind: 'ok'; view: BandView; list: SetListView | null; fetchedAt: number };

async function loadPage(bandId: string, setListId: string): Promise<PageData> {
  const fetchedAt = Date.now();
  // Independent reads in parallel: the band view (validation context) and the raw song/vote rows.
  const [bandResult, rows, labels] = await Promise.all([
    loadBandView(bandId, { onlySetListId: setListId }), // this page needs one set list, not all ten
    fetchSetListRows(setListId),
    fetchColorLabelRows(bandId), // band-wide color names; best-effort, so a failure only drops the names
  ]);
  if (bandResult.status !== 'ok') return { kind: 'blocked', status: bandResult.status };
  return {
    kind: 'ok',
    view: bandResult.view,
    list: assembleSetListView(bandResult.view, setListId, { ...rows, labels }),
    fetchedAt,
  };
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
  const colors = useSongColors(list, fetchedAt);
  const colorLabels = useColorLabels(view.band.id, list, fetchedAt);
  const tracks = useSongTracks(list, fetchedAt, reload);
  const { act, busy: actionBusy, error: actionError } = useActionThenReload(reload);
  // While reordering, moves only change this local draft (`ids`, top first; `base` is the order when
  // Reorder was pressed, so Done with no moves writes nothing); "Done" saves it once. A failed save
  // keeps the draft on screen so the owner can retry.
  const [draft, setDraft] = useState<{ base: string[]; ids: string[] } | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [editing, setEditing] = useState<ValidSong | null>(null);
  const [deleting, setDeleting] = useState<ValidSong | null>(null);
  const [removingTrack, setRemovingTrack] = useState<ValidSong | null>(null);

  // Not while the list is partial: the save would drop the stored places of songs that didn't load.
  const canReorder = isOwner && list.songs.length > 1 && !list.incomplete;
  const reordering = draft !== null && canReorder;
  // The order just saved, shown until a load that started after the save arrives, so a failed
  // reload can't make the page snap back to the old order while the new one is stored.
  const [saved, setSaved] = useState<{ order: string[]; at: number } | null>(null);
  const savedShown = saved !== null && fetchedAt <= saved.at;
  // A reload during reordering can add songs; they join the end of the draft rather than vanish.
  const shownSongs = reordering
    ? applySongOrder(list.songs, draft.ids)
    : savedShown
      ? applySongOrder(list.songs, saved.order)
      : list.songs;
  const showsCustomOrder = list.customOrder || (savedShown && saved.order.length > 0);
  const finishReordering = async (commit: boolean, resetToVotes = false) => {
    const ids = resetToVotes ? [] : shownSongs.map((s) => s.id);
    const unchanged = !resetToVotes && !!draft && draft.ids.every((id, i) => id === draft.base[i]);
    if (!commit || unchanged) return setDraft(null);
    const ok = await act(async () => {
      await reorderSongs(setListId, ids);
      setSaved(resetToVotes ? null : { order: ids, at: Date.now() });
    });
    if (ok) setDraft(null);
  };

  // `view` holds only this page's set list, but the band's own id list says whether others exist.
  const hasOtherLists = view.band.setListIds.some((id) => id !== setListId);
  const listFull = list.songs.length >= BAND_LIMITS.maxSongsPerSetList;

  const nameOf = (sub: string) => view.displayNames.get(sub) ?? 'a member';
  const backing = useBackingTrackSection({ list, view, fetchedAt, reload, nameOf });

  const clickTrackControls = (song: ValidSong): SongClickTrackControls | undefined => {
    const shown = tracks.trackFor(song.id);
    if (!shown) return undefined;
    return {
      by: nameOf(shown.owner),
      date: shortDate(shown.stamp),
      playing: tracks.isPlaying(song.id),
      busy: tracks.busy,
      problem: tracks.problemFor(song),
      runway: tracks.runwayFor(song.id),
      onPlay: () => void tracks.play(song),
      onDownload: () => void tracks.download(song),
      onDownloadCompressed: () => void tracks.download(song, 'flac'),
      onOpen: () => void tracks.open(song),
      onRemove: () => setRemovingTrack(song),
    };
  };

  return (
    <>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold text-foreground">{list.setList.name}</h1>
          <p className="text-sm text-muted-foreground">
            {view.band.name} · {showsCustomOrder ? 'In the owner’s running order (votes don’t move listed songs, new suggestions go last)' : 'Suggestions ranked by votes'} · {list.songs.length}/{BAND_LIMITS.maxSongsPerSetList} songs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {list.shared && <CopyShareLinkButton setListId={setListId} setListName={list.setList.name} />}
          <Button variant="outline" onClick={() => setLabelsOpen(true)}>
            <Tags size={14} className="mr-1" aria-hidden /> Color labels
          </Button>
          <Button variant="outline" onClick={() => setTextOpen(true)} disabled={reordering || list.songs.length === 0}>
            <ListOrdered size={14} className="mr-1" aria-hidden /> Song list
          </Button>
          {reordering && (
            <Button variant="ghost" disabled={actionBusy} onClick={() => void finishReordering(false)}>
              Cancel
            </Button>
          )}
          {reordering && showsCustomOrder && (
            <Button variant="outline" disabled={actionBusy} onClick={() => void finishReordering(true, true)}>
              Reset to vote order
            </Button>
          )}
          {canReorder && (
            <Button
              variant="outline"
              disabled={actionBusy}
              onClick={() => {
                if (reordering) return void finishReordering(true);
                const ids = list.songs.map((s) => s.id);
                setDraft({ base: ids, ids });
              }}
            >
              <ArrowDownUp size={14} className="mr-1" aria-hidden /> {reordering ? 'Done' : 'Reorder'}
            </Button>
          )}
          {hasOtherLists && (
            <Button variant="outline" onClick={() => setCopyOpen(true)} disabled={reordering || listFull}>
              <CopyPlus size={14} className="mr-1" aria-hidden /> Add from another list
            </Button>
          )}
          <Button onClick={() => setSuggestOpen(true)} disabled={reordering}>Suggest a song</Button>
          <Button variant="outline" size="icon" onClick={() => void reload()} disabled={refreshing} aria-label="Refresh">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
      </header>

      {votes.error && <InlineAlert tone="error" className="mb-4">{votes.error}</InlineAlert>}
      {colors.error && <InlineAlert tone="error" className="mb-4">{colors.error}</InlineAlert>}
      {tracks.error && <InlineAlert tone="error" className="mb-4">{tracks.error}</InlineAlert>}
      {backing.error && <InlineAlert tone="error" className="mb-4">{backing.error}</InlineAlert>}
      {actionError && <InlineAlert tone="error" className="mb-4">{actionError}</InlineAlert>}
      {(list.incomplete || view.incomplete) && (
        <InlineAlert tone="warning" className="mb-4">
          This list was too long to load completely, so some members, songs, votes, colors, click tracks or backing tracks may be missing.
        </InlineAlert>
      )}

      {list.songs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No songs yet. Suggest the first one{hasOtherLists ? ', or add some from another set list' : ''}!
        </p>
      ) : reordering ? (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            Drag a song by its handle, type a position number, or use the arrows, then press Done to save. Everyone in
            the band sees this order; songs suggested later go to the end.
          </p>
          {/* Frozen while the save runs: a move made now would be dropped when the save lands. */}
          <div inert={actionBusy}>
            <SetListReorderList
              label="Song order"
              setLists={shownSongs.map((s) => ({ id: s.id, name: s.title }))}
              onReorder={(ids) => setDraft((d) => d && { ...d, ids })}
            />
          </div>
        </>
      ) : (
        <ol className="grid gap-2">
          {shownSongs.map((song, index) => (
            <SongRow
              key={song.id}
              song={song}
              rank={index + 1}
              tally={votes.tallyFor(song.id)}
              myVote={votes.myVoteFor(song.id)}
              suggestedBy={nameOf(song.owner)}
              color={colors.colorFor(song.id)}
              colorLabels={colorLabels.labels}
              isAuthor={song.owner === view.sub}
              isOwner={isOwner}
              isVoting={votes.isVoting(song.id)}
              clickTrack={clickTrackControls(song)}
              backingTracks={backing.panelFor(song)}
              onVote={(value) => void votes.vote(song, value)}
              onColor={(color) => void colors.setColor(song, color)}
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
              <li key={song.id} className={cn('flex min-h-11 items-center justify-between gap-3 rounded-md px-3 py-1.5', CARD_SURFACE)}>
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
        colorLabels={colorLabels.labels}
        onSubmit={async (raw, color) => {
          try {
            const created = await suggestSong(view, setListId, raw, list.songs.length);
            // The song is already on the list: a failed color write is reported by the page banner, not by failing the dialog.
            if (color) void colors.setColor(created, color);
          } finally {
            void reload(); // refresh in the background; don't keep the dialog open for it
          }
        }}
      />
      {copyOpen && (
        <AddFromSetListDialog
          onOpenChange={setCopyOpen}
          bandId={view.band.id}
          setListId={setListId}
          existingSongs={list.songs}
          onAdd={async (picked) => {
            try {
              await addSongsFromOtherLists(view, setListId, picked, list.songs.length);
            } finally {
              await reload(); // some copies may have landed even when others failed
            }
          }}
        />
      )}
      {textOpen && (
        <SongListTextDialog
          open
          onOpenChange={setTextOpen}
          setListName={list.setList.name}
          songs={shownSongs}
          incomplete={list.incomplete || view.incomplete}
        />
      )}
      {labelsOpen && (
        <ColorLabelsDialog
          open
          onOpenChange={setLabelsOpen}
          bandName={view.band.name}
          labels={colorLabels.labels}
          onSave={async (next) => {
            try {
              await colorLabels.saveLabels(next);
            } finally {
              void reload();
            }
          }}
        />
      )}
      {editing && (
        <SuggestSongDialog
          key={editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          initial={songToRawInput(editing)}
          onSubmit={async (raw) => {
            try {
              await updateSong(editing.id, raw);
            } finally {
              void reload();
            }
          }}
        />
      )}
      {backing.dialogs}
      {removingTrack && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRemovingTrack(null)}
          title={`Remove the click track for “${removingTrack.title}”?`}
          description="It disappears for everyone in the band. Anyone can attach a new one."
          confirmLabel="Remove"
          destructive
          onConfirm={() => tracks.remove(removingTrack)}
          onSettled={() => void reload()}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Delete “${deleting.title}”?`}
          description={
            (list.backingTracks.get(deleting.id)?.length ?? 0) > 0
              ? 'The song and its votes disappear from the set list, and so do the backing tracks attached to it (including other members’).'
              : 'The song and its votes disappear from the set list.'
          }
          confirmLabel="Delete"
          destructive
          onConfirm={() => deleteSong(deleting.id)}
          onSettled={() => void reload()}
        />
      )}
    </>
  );
}
