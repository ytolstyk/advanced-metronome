import './BeatCell.css';

interface BeatCellProps {
  active: boolean;
  color: string;
  isCurrentBeat: boolean;
  isMeasureStart: boolean;
  isSubdivision: boolean;
  onClick: () => void;
}

export function BeatCell({
  active,
  color,
  isCurrentBeat,
  isMeasureStart,
  isSubdivision,
  onClick,
}: BeatCellProps) {
  return (
    <button
      className={[
        'beat-cell',
        active ? 'beat-cell--active' : '',
        isCurrentBeat ? 'beat-cell--current' : '',
        isMeasureStart ? 'beat-cell--measure-start' : '',
        isSubdivision ? 'beat-cell--subdivision' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={active ? { backgroundColor: color } : undefined}
      onClick={onClick}
      type="button"
    />
  );
}
