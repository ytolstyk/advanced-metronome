import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Headphones, Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BACKING_TRACK_LIMITS } from '../../backingTrackFormat';
import { canRemoveBackingTrack, formatTrackSize } from '../../backingTrackUtils';
import type { ValidBackingTrack } from '../../bandTypes';
import { BackingTrackPlayer, type BackingTrackPlayerControls } from './BackingTrackPlayer';
import { InstrumentLabels } from './InstrumentBadges';

/** What the panel needs to drive one song's backing tracks. */
export interface BackingTrackControls {
  playingId: string | null;
  /** A link is being fetched for some track: further presses are ignored (the buttons stay enabled so keyboard focus is not lost). */
  busy: boolean;
  onPlay: (track: ValidBackingTrack) => void;
  onDownload: (track: ValidBackingTrack) => void;
  onEdit: (track: ValidBackingTrack) => void;
  onRemove: (track: ValidBackingTrack) => void;
  /** Seek bar, time and pause for the track that is playing. */
  player: BackingTrackPlayerControls;
  /** Absent when the caller can't add (not a member). */
  onAdd?: () => void;
}

interface BackingTracksPanelProps {
  songTitle: string;
  tracks: readonly ValidBackingTrack[];
  viewerSub: string;
  isBandOwner: boolean;
  nameOf: (sub: string) => string;
  controls: BackingTrackControls;
}

/**
 * The backing tracks of one song: a collapsed row ("Backing tracks (3)") that opens a list with Play,
 * Download and, for the author or the band owner, Edit / Remove. Players are plain `<audio>` links
 * to short-lived signed URLs fetched on demand, never stored.
 */
export function BackingTracksPanel({ songTitle, tracks, viewerSub, isBandOwner, nameOf, controls }: BackingTracksPanelProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const full = tracks.length >= BACKING_TRACK_LIMITS.maxPerSong;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="mt-2 pl-9">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`Backing tracks for ${songTitle} (${tracks.length})`}
        >
          <Chevron size={14} className="mr-1" aria-hidden />
          <Headphones size={14} className="mr-1" aria-hidden />
          Backing tracks{tracks.length > 0 ? ` (${tracks.length})` : ''}
        </Button>
        {controls.onAdd && (
          <Button
            variant="ghost"
            size="sm"
            onClick={controls.onAdd}
            disabled={full}
            title={full ? `A song can have ${BACKING_TRACK_LIMITS.maxPerSong} backing tracks` : undefined}
            aria-label={`Add a backing track to ${songTitle}`}
          >
            <Plus size={14} className="mr-1" aria-hidden /> Add
          </Button>
        )}
      </div>

      {open && (
        <ul id={listId} className="mt-1 grid gap-1.5">
          {tracks.length === 0 && <li className="text-xs text-muted-foreground">No backing tracks yet.</li>}
          {tracks.map((track) => {
            const playing = controls.playingId === track.id;
            const mine = track.owner === viewerSub;
            return (
              <li key={track.id} className="rounded-md border border-border/60 px-2.5 py-1.5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-foreground">{track.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {track.forTags.length > 0 ? (
                        <>
                          For <InstrumentLabels instruments={track.forTags} />
                        </>
                      ) : (
                        'For everyone'
                      )}{' '}
                      · by {nameOf(track.owner)} · {track.ext.toUpperCase()} {formatTrackSize(track.bytes)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => controls.onPlay(track)}
                      aria-busy={controls.busy && !playing}
                      aria-label={`${playing ? 'Stop' : 'Play'} ${track.label}`}
                    >
                      {playing ? <Square size={14} className="mr-1" aria-hidden /> : <Play size={14} className="mr-1" aria-hidden />}
                      {playing ? 'Stop' : 'Play'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => controls.onDownload(track)}
                      aria-busy={controls.busy}
                      aria-label={`Download ${track.label}`}
                    >
                      <Download size={14} className="mr-1" aria-hidden /> Download
                    </Button>
                    {mine && (
                      <Button variant="ghost" size="sm" onClick={() => controls.onEdit(track)} aria-label={`Edit ${track.label}`}>
                        <Pencil size={14} className="mr-1" aria-hidden /> Edit
                      </Button>
                    )}
                    {canRemoveBackingTrack(track, viewerSub, isBandOwner) && (
                      <Button variant="ghost" size="sm" onClick={() => controls.onRemove(track)} aria-label={`Remove ${track.label}`}>
                        <Trash2 size={14} className="mr-1" aria-hidden /> Remove
                      </Button>
                    )}
                  </div>
                </div>
                {playing && <BackingTrackPlayer label={track.label} player={controls.player} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
