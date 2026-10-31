import { FLAC_DOWNLOAD_HINT } from '@/audio/clickExportSinks';
import { Download, ExternalLink, EyeOff, Music, Pencil, Play, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SONG_COLOR_STYLES, SONG_COLOR_TINT_PERCENT, type ColorLabels } from '../../bandSongColors';
import type { SongColorKey, SongTally, ValidSong, VoteValue } from '../../bandTypes';
import { CARD_SURFACE } from './cardStyles';
import { SongColorPicker } from './SongColorPicker';
import { SongDetails } from './SongDetails';
import { VoteButtons } from './VoteButtons';

/** What the song row needs to show and drive a song's click track (absent when the song has none). */
export interface SongClickTrackControls {
  /** Display name of the member whose track is shown. */
  by: string;
  /** Short date the track was saved, '' when unknown. */
  date: string;
  playing: boolean;
  /** A fetch is in flight for some song: all track buttons wait. */
  busy: boolean;
  /** Why the track can't be played (unreadable / newer app); Play, Download and Open are then disabled. */
  problem?: string;
  onPlay: () => void;
  onDownload: () => void;
  /** The much smaller lossless FLAC download. */
  onDownloadCompressed: () => void;
  onOpen: () => void;
  onRemove: () => void;
}

interface SongRowProps {
  song: ValidSong;
  rank: number;
  tally: SongTally;
  myVote: VoteValue | undefined;
  suggestedBy: string;
  color: SongColorKey | undefined;
  /** The band's names for its colors. */
  colorLabels?: ColorLabels;
  /** The caller suggested this song (may edit/delete it). */
  isAuthor: boolean;
  /** The caller owns the band (may hide any song). */
  isOwner: boolean;
  isVoting: boolean;
  clickTrack?: SongClickTrackControls;
  onVote: (value: VoteValue) => void;
  onColor: (color: SongColorKey | null) => void;
  onEdit: () => void;
  onDelete: () => void;
  onHide: () => void;
}

export function SongRow({
  song,
  rank,
  tally,
  myVote,
  suggestedBy,
  color,
  colorLabels,
  isAuthor,
  isOwner,
  isVoting,
  clickTrack,
  onVote,
  onColor,
  onEdit,
  onDelete,
  onHide,
}: SongRowProps) {
  return (
    <li
      className={cn(CARD_SURFACE, 'rounded-lg border-l-4 border-l-transparent p-3 sm:p-4')}
      style={
        color
          ? {
              borderLeftColor: SONG_COLOR_STYLES[color].hex,
              backgroundColor: `color-mix(in srgb, ${SONG_COLOR_STYLES[color].hex} ${SONG_COLOR_TINT_PERCENT}%, var(--color-surface))`,
            }
          : undefined
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="w-6 shrink-0 pt-0.5 text-right text-sm tabular-nums text-muted-foreground" aria-label={`Rank ${rank}`}>
            {rank}
          </span>
          <SongDetails song={song}>
            <p className="mt-1 text-xs text-muted-foreground">Suggested by {suggestedBy}</p>
          </SongDetails>
        </div>
        <VoteButtons songTitle={song.title} myVote={myVote} tally={tally} disabled={isVoting} onVote={onVote} />
      </div>
      {clickTrack && <SongClickTrackStrip songTitle={song.title} track={clickTrack} />}
      <div className="mt-2 flex flex-wrap gap-1 pl-9">
        <SongColorPicker songTitle={song.title} color={color} labels={colorLabels} onChange={onColor} />
        {isAuthor && (
          <>
            <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${song.title}`}>
              <Pencil size={14} className="mr-1" /> Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} aria-label={`Delete ${song.title}`}>
              <Trash2 size={14} className="mr-1" /> Delete
            </Button>
          </>
        )}
        {isOwner && (
          <Button variant="ghost" size="sm" onClick={onHide} aria-label={`Hide ${song.title}`}>
            <EyeOff size={14} className="mr-1" /> Hide
          </Button>
        )}
      </div>
    </li>
  );
}

function SongClickTrackStrip({ songTitle, track }: { songTitle: string; track: SongClickTrackControls }) {
  const usable = !track.problem;
  return (
    <div className="mt-2 pl-9">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <Music size={14} aria-hidden className="shrink-0" />
          <span className="truncate">
            Click track · by {track.by}
            {track.date ? `, ${track.date}` : ''}
          </span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={track.onPlay}
          disabled={!usable || (track.busy && !track.playing)}
          aria-label={`${track.playing ? 'Stop' : 'Play'} click track for ${songTitle}`}
        >
          {track.playing ? <Square size={14} className="mr-1" /> : <Play size={14} className="mr-1" />}
          {track.playing ? 'Stop' : 'Play'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={track.onDownload}
          disabled={!usable || track.busy}
          aria-label={`Download click track for ${songTitle}`}
        >
          <Download size={14} className="mr-1" /> WAV
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={track.onDownloadCompressed}
          disabled={!usable || track.busy}
          title={FLAC_DOWNLOAD_HINT}
          aria-label={`Download compressed click track (FLAC) for ${songTitle}`}
        >
          <Download size={14} className="mr-1" /> FLAC
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={track.onOpen}
          disabled={!usable || track.busy}
          aria-label={`Open click track for ${songTitle} in the editor`}
        >
          <ExternalLink size={14} className="mr-1" /> Open
        </Button>
        <Button variant="ghost" size="sm" onClick={track.onRemove} disabled={track.busy} aria-label={`Remove click track for ${songTitle}`}>
          <Trash2 size={14} className="mr-1" /> Remove
        </Button>
      </div>
      {track.problem && <p className="mt-1 text-xs text-destructive">{track.problem}</p>}
    </div>
  );
}
