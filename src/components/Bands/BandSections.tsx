import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BAND_LIMITS, type BandView } from '../../bandTypes';
import { setListPath } from '../../bandRoutes';
import { buildInviteLink, formatInviteCode, isSetListShared } from '../../bandUtils';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { InlineAlert } from './InlineAlert';
import { CopyShareLinkButton } from './CopyShareLinkButton';
import { MemberList } from './MemberList';

/** The four sections of the band page. They only render; every action is a callback. */

export function SetListsSection({
  view,
  onCreate,
  onRename,
  onArchive,
  onToggleShared,
}: {
  view: BandView;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onArchive: (id: string, name: string) => void;
  onToggleShared: (id: string, shared: boolean) => void;
}) {
  const { band, isOwner } = view;
  return (
    <section aria-labelledby="set-lists-heading" className="mb-8">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="set-lists-heading" className="text-lg font-semibold text-foreground">Set lists</h2>
        {isOwner && band.setListIds.length < BAND_LIMITS.maxSetLists && (
          <Button size="sm" onClick={onCreate}>New set list</Button>
        )}
      </div>
      <p className="mb-2 text-sm text-muted-foreground">
        A shared set list has a public link anyone can open without signing in. Nothing is shared until the owner
        turns it on, and stopping only hides the list in the app.
      </p>
      {view.setLists.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {isOwner ? 'Create your first set list.' : 'The owner hasn’t created a set list yet.'}
        </p>
      ) : (
        <ul className="grid gap-2">
          {view.setLists.map((setList) => {
            const shared = isSetListShared(band, setList.id);
            return (
              <li key={setList.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  to={setListPath(band.id, setList.id)}
                  className="flex min-h-12 min-w-0 flex-1 basis-48 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 text-foreground no-underline transition-colors hover:bg-accent"
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

export function MembersSection({
  view,
  onRemove,
  onRestore,
}: {
  view: BandView;
  onRemove: (sub: string, name: string) => void;
  onRestore: (sub: string) => void;
}) {
  const { isOwner } = view;
  return (
    <section aria-labelledby="members-heading" className="mb-8">
      <h2 id="members-heading" className="mb-2 text-lg font-semibold text-foreground">Members</h2>
      <MemberList view={view} onRemove={isOwner ? onRemove : undefined} />
      {isOwner && view.removedMembers.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-medium text-muted-foreground">Removed</h3>
          <ul className="grid gap-1.5">
            {view.removedMembers.map(({ sub, name }) => (
              <li key={sub} className="flex min-h-11 items-center justify-between gap-3 rounded-md bg-destructive/10 px-3 py-1.5">
                <span className="min-w-0 truncate text-sm text-foreground/80">{name}</span>
                <Button variant="ghost" size="sm" onClick={() => onRestore(sub)} aria-label={`Restore ${name}`}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function InviteSection({ view, onReset }: { view: BandView; onReset: () => void }) {
  const [copied, copy] = useCopyToClipboard();
  const [copyFailed, setCopyFailed] = useState(false);
  const link = buildInviteLink(window.location.origin, view.band.inviteCode);
  return (
    <section aria-labelledby="invite-heading" className="mb-8">
      <h2 id="invite-heading" className="mb-2 text-lg font-semibold text-foreground">Invite</h2>
      <p className="mb-2 text-sm text-muted-foreground">
        Anyone with this code or link can join instantly. Share it only with people you trust.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-md bg-card px-3 py-2 font-mono text-base tracking-wider text-foreground">
          {link ? formatInviteCode(view.band.inviteCode) : '—'}
        </code>
        <Button
          variant="outline"
          size="sm"
          disabled={!link}
          onClick={async () => {
            if (link) setCopyFailed(!(await copy(link)));
          }}
        >
          {copied ? 'Copied!' : 'Copy invite link'}
        </Button>
        {view.isOwner && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            Reset code
          </Button>
        )}
      </div>
      {copyFailed && (
        <InlineAlert tone="warning" className="mt-2">
          Couldn’t copy automatically. Select the code and copy it by hand.
        </InlineAlert>
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
