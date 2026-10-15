import { Pencil, Trash2, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SongTally, ValidSong, VoteValue } from '../../bandTypes';
import { SongDetails } from './SongDetails';
import { VoteButtons } from './VoteButtons';

interface SongRowProps {
  song: ValidSong;
  rank: number;
  tally: SongTally;
  myVote: VoteValue | undefined;
  suggestedBy: string;
  /** The caller suggested this song (may edit/delete it). */
  isAuthor: boolean;
  /** The caller owns the band (may hide any song). */
  isOwner: boolean;
  isVoting: boolean;
  onVote: (value: VoteValue) => void;
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
  isAuthor,
  isOwner,
  isVoting,
  onVote,
  onEdit,
  onDelete,
  onHide,
}: SongRowProps) {
  return (
    <li className="rounded-lg border border-border bg-card p-3 sm:p-4">
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
      {(isAuthor || isOwner) && (
        <div className="mt-2 flex flex-wrap gap-1 pl-9">
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
      )}
    </li>
  );
}
