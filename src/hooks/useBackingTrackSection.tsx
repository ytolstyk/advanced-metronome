import { useEffect, useRef, useState, type ReactNode } from 'react';
import { addBackingTrack, areBackingTrackUploadsOn, isBackingTracksReady } from '../api/backingTracksApi';
import { BackingTrackDialog } from '../components/Bands/BackingTrackDialog';
import { BackingTracksPanel } from '../components/Bands/BackingTracksPanel';
import { ConfirmDialog } from '../components/Bands/ConfirmDialog';
import type { BandView, SetListView, ValidBackingTrack, ValidSong } from '../bandTypes';
import { useBackingTracks } from './useBackingTracks';

/**
 * How long after a backing track write the list is read once more. The tracks come from an eventually
 * consistent index, so a reload right after a commit, edit or remove can still show the old list; one more
 * quiet read a moment later catches up.
 */
const CATCH_UP_READ_MS = 1_500;

interface Options {
  list: SetListView;
  view: BandView;
  fetchedAt: number;
  reload: () => Promise<void>;
  nameOf: (sub: string) => string;
}

/**
 * Everything the set list page needs for backing tracks, so the page itself only places two things: the panel
 * under each song (`panelFor`) and the dialogs (`dialogs`). Owns the add / edit / remove dialog state, the
 * player, and the catch-up read. Add is offered only while uploads are on; listening, editing and removing
 * work either way.
 */
export function useBackingTrackSection({ list, view, fetchedAt, reload, nameOf }: Options) {
  const backing = useBackingTracks(list, fetchedAt);
  const ready = isBackingTracksReady();
  const uploadsOn = areBackingTrackUploadsOn();
  const [adding, setAdding] = useState<ValidSong | null>(null);
  const [editing, setEditing] = useState<ValidBackingTrack | null>(null);
  const [removing, setRemoving] = useState<ValidBackingTrack | null>(null);

  const catchUp = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(catchUp.current), []);
  /** After a write that went through: read now, and once more shortly (cleared if the page goes away first). */
  const reloadAfterWrite = () => {
    void reload();
    clearTimeout(catchUp.current);
    catchUp.current = setTimeout(() => void reload(), CATCH_UP_READ_MS);
  };

  /** Runs a write; a success reads now and again shortly, a failure reads once (nothing is known to have changed) and rethrows for the dialog. */
  const afterWrite = async (write: () => Promise<void>) => {
    try {
      await write();
      reloadAfterWrite();
    } catch (e) {
      void reload();
      throw e;
    }
  };

  const panelFor = (song: ValidSong): ReactNode => {
    if (!ready) return undefined;
    const tracks = list.backingTracks.get(song.id) ?? [];
    const canAdd = uploadsOn && view.isMember;
    if (tracks.length === 0 && !canAdd) return undefined;
    return (
      <BackingTracksPanel
        songTitle={song.title}
        tracks={tracks}
        viewerSub={view.sub}
        isBandOwner={view.isOwner}
        nameOf={nameOf}
        controls={{
          playingId: backing.playingId,
          busy: backing.busy,
          onPlay: (track) => void backing.play(track),
          onDownload: (track) => void backing.download(track),
          onEdit: setEditing,
          onRemove: setRemoving,
          onAdd: canAdd ? () => setAdding(song) : undefined,
        }}
      />
    );
  };

  const dialogs = (
    <>
      {adding && (
        <BackingTrackDialog
          key={adding.id}
          mode="add"
          songTitle={adding.title}
          onOpenChange={(open) => !open && setAdding(null)}
          onSubmit={({ file, label, tags }, { onProgress, signal }) =>
            afterWrite(() => addBackingTrack({ song: adding, file, label, tags, onProgress, signal }))
          }
        />
      )}
      {editing && (
        <BackingTrackDialog
          key={editing.id}
          mode="edit"
          songTitle={list.songs.find((s) => s.id === editing.songId)?.title ?? 'this song'}
          initial={{ label: editing.label, tags: editing.forTags }}
          onOpenChange={(open) => !open && setEditing(null)}
          onSubmit={({ label, tags }) => afterWrite(() => backing.edit(editing, label, tags))}
        />
      )}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRemoving(null)}
          title={`Remove “${removing.label}”?`}
          description={
            removing.owner === view.sub
              ? 'The audio file is deleted for everyone in the band.'
              : `The audio file ${nameOf(removing.owner)} added is deleted for everyone in the band.`
          }
          confirmLabel="Remove"
          destructive
          onConfirm={() => afterWrite(() => backing.remove(removing))}
        />
      )}
    </>
  );

  return { panelFor, dialogs, error: backing.error };
}
