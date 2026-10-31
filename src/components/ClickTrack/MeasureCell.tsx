import { memo } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MeasureCellProps {
  pieceIndex: number;
  rep: number;
  /** Position of this bar in the whole track (0-based). */
  flatIdx: number;
  color: string;
  /** Segment label; only the first bar of a segment shows it. */
  label: string;
  numerator: number;
  denominator: number;
  bpm: number;
  dots: ReadonlyArray<'accent' | 'beat' | 'sub'>;
  isActive: boolean;
  isSelected: boolean;
  /** Index of the dot that is clicking right now; -1 for every cell but the active one. */
  activeDot: number;
  playDisabled: boolean;
  /** Only passed to the active cell, so the page can scroll it into view. */
  activeRef?: (el: HTMLDivElement | null) => void;
  onSelect: (flatIdx: number, shiftKey: boolean) => void;
  onPlayFrom: (pieceIndex: number, rep: number) => void;
}

/**
 * One bar in the score view. Memoized and fed only primitives and stable callbacks, so while a long
 * track plays only the cell whose beat changed re-renders instead of every bar of the song.
 */
export const MeasureCell = memo(function MeasureCell({
  pieceIndex, rep, flatIdx, color, label, numerator, denominator, bpm, dots,
  isActive, isSelected, activeDot, playDisabled, activeRef, onSelect, onPlayFrom,
}: MeasureCellProps) {
  return (
    <div
      ref={activeRef}
      className={cn('ct-measure-cell', isActive && 'is-active-rep', isSelected && 'is-selected')}
      style={{ '--piece-color': color } as React.CSSProperties}
      onClick={(e) => onSelect(flatIdx, e.shiftKey)}
    >
      <div className="ct-measure-count">{flatIdx + 1}</div>
      {label && <div className="ct-measure-label">{label}</div>}
      <div className="ct-dots-row">
        {dots.map((type, di) => (
          <span
            key={di}
            className={cn(`ct-dot ct-dot--${type}`, di === activeDot && 'ct-dot--clicking')}
          />
        ))}
      </div>
      <div className="ct-measure-info">
        <span>{numerator}/{denominator}</span>
        <span className="ct-measure-info-sep">·</span>
        <span>{bpm} bpm</span>
      </div>
      <div className="ct-measure-footer">
        <button
          className="ct-cell-play-btn"
          disabled={playDisabled}
          title="Play from here"
          onClick={(e) => { e.stopPropagation(); onPlayFrom(pieceIndex, rep); }}
        >
          <Play size={12} />
        </button>
      </div>
    </div>
  );
});
