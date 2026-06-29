import { cn } from '@/lib/utils';

interface ProposedBeatCellProps {
  currentActive: boolean;
  proposedActive: boolean;
  className?: string;
}

export function ProposedBeatCell({ currentActive, proposedActive, className }: ProposedBeatCellProps) {
  return (
    <div
      className={cn(
        'proposed-beat-cell',
        currentActive && 'proposed-beat-cell--current',
        proposedActive && 'proposed-beat-cell--proposed',
        currentActive && proposedActive && 'proposed-beat-cell--both',
        className,
      )}
    />
  );
}
