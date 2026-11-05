import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BAND_LIMITS, type BandView } from '../../bandTypes';
import { availabilityPath, rigPath, setListPath } from '../../bandRoutes';
import { applyDisplayOrder, isSetListShared } from '../../bandUtils';
import { CARD_SURFACE_INTERACTIVE } from './cardStyles';
import { CopyShareLinkButton } from './CopyShareLinkButton';
import { MemberList } from './MemberList';
import { SetListReorderList } from './SetListReorderList';

/** The four sections of the band page. They only render; every action is a callback. */

export function SetListsSection({
  view,
  onCreate,
  onRename,
  onArchive,
  onToggleShared,
  onReorder,
  reorderBusy = false,
}: {
  view: BandView;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onArchive: (id: string, name: string) => void;
  onToggleShared: (id: string, shared: boolean) => void;
  /** Owner only: saves the new order (top first); resolves `false` when the save failed. */
  onReorder: (ids: string[]) => Promise<boolean>;
  /** A save is running: the Reorder button waits. */
  reorderBusy?: boolean;
}) {
  const { band, isOwner } = view;
  // While reordering, moves only change this local draft (ids, top first); "Done" saves it once.
  const [draft, setDraft] = useState<string[] | null>(null);
  // The order just saved, shown until the reloaded one arrives. Tied to the list it was made from, so
  // a reload (a new `view.setLists`) replaces it without an effect; a failed save clears it.
  const [saved, setSaved] = useState<{ base: typeof view.setLists; ids: string[] } | null>(null);
  const canReorder = isOwner && view.setLists.length > 1;
  const reordering = draft !== null && canReorder;
  const shown = reordering
    ? applyDisplayOrder(view.setLists, draft)
    : saved && saved.base === view.setLists
      ? applyDisplayOrder(view.setLists, saved.ids)
      : view.setLists;
  // Cancel, or Done with nothing changed, just leaves. A real Done keeps the draft until the save
  // succeeds, so a failed save leaves the owner's arrangement on screen to retry.
  const finishReordering = (commit: boolean) => {
    const ids = shown.map((s) => s.id);
    if (!commit || ids.every((id, i) => id === view.setLists[i]?.id)) return setDraft(null);
    setSaved({ base: view.setLists, ids });
    void onReorder(ids).then((ok) => {
      if (ok) setDraft(null);
      else setSaved(null);
    });
  };
  const canCreate = isOwner && !reordering && band.setListIds.length < BAND_LIMITS.maxSetLists;
  return (
    <section aria-labelledby="set-lists-heading" className="mb-8">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="set-lists-heading" className="text-lg font-semibold text-foreground">Set lists</h2>
        <div className="flex items-center gap-2">
          {reordering && (
            <Button size="sm" variant="ghost" disabled={reorderBusy} onClick={() => finishReordering(false)}>
              Cancel
            </Button>
          )}
          {canReorder && (
            <Button
              size="sm"
              variant="outline"
              disabled={reorderBusy}
              onClick={() => (reordering ? finishReordering(true) : setDraft(shown.map((s) => s.id)))}
            >
              {reordering ? 'Done' : 'Reorder'}
            </Button>
          )}
          {canCreate && <Button size="sm" onClick={onCreate}>New set list</Button>}
        </div>
      </div>
      <p className="mb-2 text-sm text-muted-foreground">
        A shared set list has a public link anyone can open without signing in. Nothing is shared until the owner
        turns it on, and stopping only hides the list in the app.
      </p>
      {view.setLists.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {isOwner ? 'Create your first set list.' : 'The owner hasn’t created a set list yet.'}
        </p>
      ) : reordering ? (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            Drag a set list by its handle, type a position number, or use the arrows, then press Done to save.
            Newly created set lists start at the top.
          </p>
          {/* Frozen while the save runs: a move made now would be dropped when the save lands. */}
          <div inert={reorderBusy}>
            <SetListReorderList setLists={shown} onReorder={setDraft} />
          </div>
        </>
      ) : (
        <ul className="grid gap-2">
          {shown.map((setList) => {
            const shared = isSetListShared(band, setList.id);
            return (
              <li key={setList.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  to={setListPath(band.id, setList.id)}
                  className={cn(
                    'flex min-h-12 min-w-0 flex-1 basis-48 items-center justify-between gap-3 rounded-lg px-4 text-foreground no-underline',
                    CARD_SURFACE_INTERACTIVE,
                  )}
                >
                  <span className="truncate">{setList.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">{shared ? 'Shared' : 'Not shared'}</span>
                    <ChevronRight size={18} className="text-muted-foreground" aria-hidden />
                  </span>
                </Link>
                {shared && <CopyShareLinkButton setListId={setList.id} setListName={setList.name} />}
                {isOwner && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleShared(setList.id, !shared)}
                      aria-label={`${shared ? 'Stop sharing' : 'Share'} ${setList.name}`}
                    >
                      {shared ? 'Stop sharing' : 'Share'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onRename(setList.id, setList.name)} aria-label={`Rename ${setList.name}`}>
                      Rename
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onArchive(setList.id, setList.name)} aria-label={`Archive ${setList.name}`}>
                      Archive
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** A link to the availability calendar; the page itself does the reading, so this costs no request. */
export function AvailabilitySection({ bandId }: { bandId: string }) {
  return (
    <section aria-labelledby="availability-heading" className="mb-8">
      <h2 id="availability-heading" className="mb-2 text-lg font-semibold text-foreground">Availability</h2>
      <p className="mb-2 text-sm text-muted-foreground">
        Mark when you can practice and see when everyone in the band overlaps.
      </p>
      <Link
        to={availabilityPath(bandId)}
        className={cn('flex min-h-14 items-center justify-between gap-3 rounded-lg p-3 text-foreground no-underline', CARD_SURFACE_INTERACTIVE)}
      >
        <span className="font-medium">Open the availability calendar</span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </section>
  );
}

/** A link to the band's gear and rig diagrams; the page itself does the reading, so this costs no request. */
export function RigSection({ bandId }: { bandId: string }) {
  return (
    <section aria-labelledby="rig-heading" className="mb-8">
      <h2 id="rig-heading" className="mb-2 text-lg font-semibold text-foreground">Gear &amp; rigs</h2>
      <p className="mb-2 text-sm text-muted-foreground">
        List the band’s equipment and draw how it is wired together for a jam or a gig.
      </p>
      <Link
        to={rigPath(bandId)}
        className={cn('flex min-h-14 items-center justify-between gap-3 rounded-lg p-3 text-foreground no-underline', CARD_SURFACE_INTERACTIVE)}
      >
        <span className="font-medium">Open gear and rig diagrams</span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </section>
  );
}

export function MembersSection({
  view,
  onRemove,
  onRestore,
  onDeleteFiles,
  onSetUploads,
  busy,
  onEditProfile,
}: {
  view: BandView;
  onRemove: (sub: string, name: string) => void;
  onRestore: (sub: string) => void;
  /** Present when the backend has backing tracks: retries deleting a removed member's audio files (a ban can succeed while that cleanup fails). */
  onDeleteFiles?: (sub: string, name: string) => void;
  /** Present when the backend has backing tracks: the owner's per-member "can upload" switch. */
  onSetUploads?: (sub: string, allowed: boolean) => void;
  /** True while a band write is running (disables the upload switches). */
  busy?: boolean;
  onEditProfile: () => void;
}) {
  const { isOwner } = view;
  return (
    <section aria-labelledby="members-heading" className="mb-8">
      <h2 id="members-heading" className="mb-2 text-lg font-semibold text-foreground">Members</h2>
      <MemberList
        view={view}
        onRemove={isOwner ? onRemove : undefined}
        onSetUploads={isOwner ? onSetUploads : undefined}
        busy={busy}
        onEditProfile={onEditProfile}
      />
      {isOwner && view.removedMembers.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-medium text-muted-foreground">Removed</h3>
          <ul className="grid gap-1.5">
            {view.removedMembers.map(({ sub, name }) => (
              <li key={sub} className="flex min-h-11 items-center justify-between gap-3 rounded-md bg-destructive/10 px-3 py-1.5">
                <span className="min-w-0 truncate text-sm text-foreground/80">{name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {onDeleteFiles && (
                    <Button variant="ghost" size="sm" onClick={() => onDeleteFiles(sub, name)} aria-label={`Delete backing track files of ${name}`}>
                      Delete files
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => onRestore(sub)} aria-label={`Restore ${name}`}>
                    Restore
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function DangerZone({ isOwner, onClick }: { isOwner: boolean; onClick: () => void }) {
  return (
    <section aria-labelledby="danger-heading" className="mb-4 border-t border-border pt-6">
      <h2 id="danger-heading" className="mb-2 text-lg font-semibold text-foreground">
        {isOwner ? 'Delete band' : 'Leave band'}
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {isOwner
          ? 'Deleting closes the band for everyone. Members’ own songs and votes are not removed.'
          : 'Leaving removes you from the member list. The owner can still remove you from the roster for good.'}
      </p>
      <Button variant="destructive" size="sm" onClick={onClick}>
        {isOwner ? 'Delete band' : 'Leave band'}
      </Button>
    </section>
  );
}
