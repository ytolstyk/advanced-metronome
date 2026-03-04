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
  let offset = 0;
  for (const m of measures) {
    measureStarts.add(offset);
    offset += m.timeSignature.beats;
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
          onClick={() => onToggle(instrument.id, i)}
        />
      ))}
    </>
  );
}
