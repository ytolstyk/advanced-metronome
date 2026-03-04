import type { InstrumentId, Measure } from '../../types';
import type { InstrumentConfig } from '../../constants';
import { BeatCell } from '../BeatCell/BeatCell';
import './InstrumentRow.css';

interface InstrumentRowProps {
  instrument: InstrumentConfig;
  beats: boolean[];
  measures: Measure[];
  currentBeat: number;
  isPlaying: boolean;
  onToggle: (instrument: InstrumentId, beat: number) => void;
}

export function InstrumentRow({
  instrument,
  beats,
  measures,
  currentBeat,
  isPlaying,
  onToggle,
}: InstrumentRowProps) {
  const measureStarts = new Set<number>();
  const subdivisionCells = new Set<number>();
  let offset = 0;
  for (const m of measures) {
    const spb = m.timeSignature.stepsPerBeat ?? 1;
    measureStarts.add(offset);
    for (let b = 0; b < m.timeSignature.beats; b++) {
      for (let s = 1; s < spb; s++) {
        subdivisionCells.add(offset + b * spb + s);
      }
    }
    offset += m.timeSignature.beats * spb;
  }

  return (
    <>
      <div className="instrument-label">{instrument.label}</div>
      {beats.map((active, i) => (
        <BeatCell
          key={i}
          active={active}
          color={instrument.color}
          isCurrentBeat={isPlaying && currentBeat === i}
          isMeasureStart={measureStarts.has(i) && i > 0}
          isSubdivision={subdivisionCells.has(i)}
          onClick={() => onToggle(instrument.id, i)}
        />
      ))}
    </>
  );
}
