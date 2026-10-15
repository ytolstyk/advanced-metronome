import { ThumbsDown, ThumbsUp } from 'lucide-react';
import type { SongTally, ValidSong } from '../../bandTypes';
import { SongDetails } from './SongDetails';

/** A song on the public set list page: ranked and scored, read-only (no names, no buttons). */
export function SharedSongRow({ song, rank, tally }: { song: ValidSong; rank: number; tally: SongTally }) {
  return (
    <li className="flex items-start justify-between gap-x-4 rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="w-6 shrink-0 pt-0.5 text-right text-sm tabular-nums text-muted-foreground" aria-label={`Rank ${rank}`}>
          {rank}
        </span>
        <SongDetails song={song} />
      </div>
      <p className="flex shrink-0 items-center gap-2 pt-0.5 text-sm tabular-nums text-muted-foreground">
        <span className="sr-only">{`Score ${tally.score}, ${tally.up} up, ${tally.down} down`}</span>
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          <ThumbsUp size={14} /> {tally.up}
        </span>
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          <ThumbsDown size={14} /> {tally.down}
        </span>
      </p>
    </li>
  );
}
