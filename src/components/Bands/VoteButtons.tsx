import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SongTally, VoteValue } from '../../bandTypes';

interface VoteButtonsProps {
  /** Song title, for screen readers. */
  songTitle: string;
  myVote: VoteValue | undefined;
  tally: SongTally;
  disabled?: boolean;
  onVote: (value: VoteValue) => void;
}

/** Up/down vote toggle. Clicking the active arrow retracts the vote (handled by the caller). */
export function VoteButtons({ songTitle, myVote, tally, disabled, onVote }: VoteButtonsProps) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Vote on ${songTitle}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn('min-h-11 min-w-11', myVote === 'up' && 'bg-emerald-500/20 text-emerald-300')}
        aria-pressed={myVote === 'up'}
        aria-label={`Upvote ${songTitle}`}
        disabled={disabled}
        onClick={() => onVote('up')}
      >
        <ThumbsUp size={18} />
      </Button>
      <span
        role="status"
        className="min-w-8 text-center text-sm tabular-nums text-foreground"
        aria-live="polite"
        aria-label={`Score ${tally.score}, ${tally.up} up, ${tally.down} down`}
        title={`${tally.up} up · ${tally.down} down`}
      >
        {tally.score}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn('min-h-11 min-w-11', myVote === 'down' && 'bg-red-500/20 text-red-300')}
        aria-pressed={myVote === 'down'}
        aria-label={`Downvote ${songTitle}`}
        disabled={disabled}
        onClick={() => onVote('down')}
      >
        <ThumbsDown size={18} />
      </Button>
    </div>
  );
}
